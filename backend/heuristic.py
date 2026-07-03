"""贪心启发式排产 (list scheduling)。

用途:
1. 为 CP-SAT 提供初始解提示 (AddHint), 大规模下显著加速收敛;
2. 求解超时拿不到可行解时的兜底方案 (status=HEURISTIC);
3. 其 makespan 用于收紧 CP-SAT 的时域上界。

策略: 每一步在各订单的下一道待排工序中, 选「考虑换型后最早完工」的
(工序, 机台) 组合提交 (完工同时先高优先级、早交期)。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .calendar_utils import merge_windows
from .models import (
    OUTSOURCE_MACHINE_ID,
    MachineUtilization,
    OrderResult,
    ScheduledOperation,
    ScheduleRequest,
    ScheduleResult,
    TimeWindow,
)


def fit_after_windows(start: int, dur: int, windows: list[TimeWindow]) -> int:
    """把 [start, start+dur) 推到不与任何不可用窗重叠的最早位置。

    windows 需已合并排序 (merge_windows)。工序不可中断。
    """
    for w in windows:
        if start + dur <= w.start:
            break
        if start < w.end:  # 与该窗重叠 -> 推到窗后
            start = w.end
    return start


@dataclass
class HeuristicPlan:
    """启发式排产结果: op_id -> (机台, 开工, 完工, 换型)。"""

    assignment: dict[str, tuple[str, int, int, int]] = field(default_factory=dict)
    makespan: int = 0


def greedy_schedule(
    request: ScheduleRequest,
    machine_release: dict[str, int] | None = None,
    machine_init_family: dict[str, str] | None = None,
) -> HeuristicPlan:
    """贪心构造一个可行排产。

    machine_release / machine_init_family: 机台最早可用时刻与其上一产品族
    (滚动分解或冻结重排时传入)。
    """
    machines = {m.id: m for m in request.machines}
    free = {m.id: (machine_release or {}).get(m.id, 0) for m in request.machines}
    last_fam: dict[str, str | None] = {
        m.id: (machine_init_family or {}).get(m.id) for m in request.machines
    }
    windows = {m.id: merge_windows(m.downtime_windows) for m in request.machines}

    next_idx = {o.id: 0 for o in request.orders}
    prev_end = {o.id: o.release_time for o in request.orders}
    orders_sorted = sorted(request.orders, key=lambda o: (-o.priority, o.due_date))
    pending = sum(len(o.operations) for o in request.orders)

    plan = HeuristicPlan()
    while pending:
        best = None  # (key, order, op, machine, start, setup, dur)
        for o in orders_sorted:
            i = next_idx[o.id]
            if i >= len(o.operations):
                continue
            op = o.operations[i]
            if op.is_outsourced:
                # 外协: 不占机台, 固定周期
                start = prev_end[o.id]
                key = (start + op.outsource_lead, -o.priority, o.due_date)
                if best is None or key < best[0]:
                    best = (key, o, op, OUTSOURCE_MACHINE_ID, start, 0,
                            op.outsource_lead)
                continue
            for mid, dur in op.eligible_machines.items():
                setup = machines[mid].setup_time(last_fam[mid], op.family)
                start = max(prev_end[o.id], free[mid] + setup)
                # 加工段整体避开不可用窗 (换型允许落在停机时段)
                start = fit_after_windows(start, dur, windows[mid])
                key = (start + dur, -o.priority, o.due_date)
                if best is None or key < best[0]:
                    best = (key, o, op, mid, start, setup, dur)
        _, o, op, mid, start, setup, dur = best
        end = start + dur
        plan.assignment[op.id] = (mid, start, end, setup)
        if mid != OUTSOURCE_MACHINE_ID:
            free[mid] = end
            last_fam[mid] = op.family
        prev_end[o.id] = end
        next_idx[o.id] += 1
        pending -= 1

    plan.makespan = max((e for (_, _, e, _) in plan.assignment.values()), default=0)
    return plan


def plan_to_result(
    request: ScheduleRequest, plan: HeuristicPlan, solve_time: float
) -> ScheduleResult:
    """把启发式方案转成 ScheduleResult (兜底返回用)。"""
    scheduled: list[ScheduledOperation] = []
    for order in request.orders:
        for op in order.operations:
            mid, start, end, setup = plan.assignment[op.id]
            scheduled.append(ScheduledOperation(
                operation_id=op.id, operation_name=op.name,
                order_id=order.id, order_name=order.name,
                machine_id=mid, family=op.family,
                start=start, setup=setup, duration=end - start, end=end,
            ))
    scheduled.sort(key=lambda x: (x.machine_id, x.start))

    total_tard = 0
    order_results = []
    for o in request.orders:
        comp = max(plan.assignment[op.id][2] for op in o.operations)
        tard = max(0, comp - o.due_date)
        total_tard += o.priority * tard
        order_results.append(OrderResult(
            order_id=o.id, order_name=o.name, due_date=o.due_date,
            completion=comp, tardiness=tard,
        ))

    total_setup = sum(so.setup for so in scheduled)
    ms = plan.makespan
    busy: dict[str, int] = {}
    for so in scheduled:
        busy[so.machine_id] = busy.get(so.machine_id, 0) + so.duration + so.setup
    util = [
        MachineUtilization(
            machine_id=m.id, machine_name=m.name,
            busy_time=busy.get(m.id, 0),
            utilization=round(busy.get(m.id, 0) / ms, 3) if ms > 0 else 0.0,
        )
        for m in request.machines
    ]

    w = request.weights
    objective = (
        w.makespan * ms + w.tardiness * total_tard + w.changeover * total_setup
    )
    return ScheduleResult(
        status="HEURISTIC",
        makespan=ms,
        total_tardiness=total_tard,
        total_changeover=total_setup,
        objective_value=round(objective, 2),
        solve_time_seconds=round(solve_time, 3),
        operations=scheduled,
        orders=order_results,
        machine_utilization=util,
    )
