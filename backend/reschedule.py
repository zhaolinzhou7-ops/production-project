"""增量重排: 冻结已开工工序 + 冲突预检 + 请求变换。

思路: 冻结工序不进求解模型 —— 从订单工序表中摘除, 其影响折算为:
- 所在机台的最早可用时刻 (machine_release) 与末道产品族 (machine_init_family);
- 所属订单剩余首道工序的最早开工 (release_time 提升);
- 其他一切照常求解, 求解后把冻结工序原样贴回结果。

求解前必须过冲突预检: 冻结区间撞新停机窗 / 机台不合格 / 非前缀冻结,
返回结构化冲突清单而不是黑盒 INFEASIBLE。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from .models import (
    OUTSOURCE_MACHINE_ID,
    FrozenOp,
    OrderResult,
    ScheduledOperation,
    ScheduleRequest,
    ScheduleResult,
    SolverParams,
    TimeWindow,
)


class Conflict(BaseModel):
    """一条冻结冲突。"""

    op_id: str
    machine_id: str
    kind: str = Field(..., description="downtime_overlap / machine_not_eligible / non_prefix_freeze")
    message: str


def precheck_conflicts(
    request: ScheduleRequest, frozen: dict[str, FrozenOp]
) -> list[Conflict]:
    """冻结安排与请求 (含新停机窗) 的冲突预检。"""
    conflicts: list[Conflict] = []
    machines = {m.id: m for m in request.machines}

    for order in request.orders:
        seen_unfrozen = False
        for op in order.operations:
            fo = frozen.get(op.id)
            if fo is None:
                seen_unfrozen = True
                continue
            if seen_unfrozen:
                conflicts.append(Conflict(
                    op_id=op.id, machine_id=fo.machine_id, kind="non_prefix_freeze",
                    message=f"订单 {order.id} 的工序 {op.id} 已开工, 但其前序工序未报工",
                ))
            if fo.machine_id == OUTSOURCE_MACHINE_ID:
                continue
            m = machines.get(fo.machine_id)
            if m is None:
                conflicts.append(Conflict(
                    op_id=op.id, machine_id=fo.machine_id, kind="machine_not_eligible",
                    message=f"工序 {op.id} 报工机台 {fo.machine_id} 不存在或已停用",
                ))
                continue
            for w in m.downtime_windows:
                if fo.start < w.end and fo.end > w.start:
                    conflicts.append(Conflict(
                        op_id=op.id, machine_id=fo.machine_id, kind="downtime_overlap",
                        message=(
                            f"已开工工序 {op.id} [{fo.start},{fo.end}) 与机台 "
                            f"{fo.machine_id} 的停机窗 [{w.start},{w.end}) 重叠, "
                            f"请调整停机计划或先处理该工序"
                        ),
                    ))
    return conflicts


def solve_with_freeze(
    request: ScheduleRequest,
    frozen: dict[str, FrozenOp],
    now: int = 0,
    extra_downtimes: dict[str, list[TimeWindow]] | None = None,
) -> tuple[ScheduleResult | None, list[Conflict]]:
    """冻结重排入口。返回 (结果, 冲突); 有冲突时结果为 None。

    extra_downtimes: 模拟新增停机 (机台 -> 窗列表, 相对分钟)。
    """
    from .scheduler import solve_core

    req = request.model_copy(deep=True)
    if extra_downtimes:
        for m in req.machines:
            m.downtime_windows = m.downtime_windows + extra_downtimes.get(m.id, [])

    conflicts = precheck_conflicts(req, frozen)
    if conflicts:
        return None, conflicts

    # ---- 请求变换: 摘除冻结工序 ----
    machine_release: dict[str, int] = {}
    machine_last: dict[str, tuple[int, str]] = {}  # mid -> (end, family)
    frozen_ops: list[ScheduledOperation] = []
    frozen_completion: dict[str, int] = {}

    for order in req.orders:
        remaining = []
        for op in order.operations:
            fo = frozen.get(op.id)
            if fo is None:
                remaining.append(op)
                continue
            frozen_ops.append(ScheduledOperation(
                operation_id=op.id, operation_name=op.name,
                order_id=order.id, order_name=order.name,
                machine_id=fo.machine_id, family=op.family,
                start=fo.start, setup=0, duration=fo.end - fo.start, end=fo.end,
            ))
            frozen_completion[order.id] = max(
                frozen_completion.get(order.id, 0), fo.end
            )
            if fo.machine_id != OUTSOURCE_MACHINE_ID:
                machine_release[fo.machine_id] = max(
                    machine_release.get(fo.machine_id, 0), fo.end
                )
                if fo.end >= machine_last.get(fo.machine_id, (0, ""))[0]:
                    machine_last[fo.machine_id] = (fo.end, op.family)
        order.operations = remaining
        order.release_time = max(
            order.release_time, now, frozen_completion.get(order.id, 0)
        )

    # 空闲机台的重排下界也是 now
    for m in req.machines:
        machine_release[m.id] = max(machine_release.get(m.id, 0), now)

    fully_frozen = [o for o in req.orders if not o.operations]
    req.orders = [o for o in req.orders if o.operations]

    if req.orders:
        params = req.solver_params or SolverParams()
        result = solve_core(
            req,
            params=params,
            time_limit=params.time_limit_seconds or req.time_limit_seconds,
            machine_release=machine_release,
            machine_init_family={mid: fam for mid, (_, fam) in machine_last.items()},
        )
        if result.status in ("INFEASIBLE", "MODEL_INVALID", "UNKNOWN"):
            return result, []
    else:
        result = ScheduleResult(
            status="OPTIMAL", makespan=0, total_tardiness=0, total_changeover=0,
            objective_value=0.0, solve_time_seconds=0.0,
            operations=[], orders=[], machine_utilization=[],
        )

    # ---- 贴回冻结工序并汇总 ----
    ops = result.operations + frozen_ops
    ops.sort(key=lambda x: (x.machine_id, x.start))

    order_results = {r.order_id: r for r in result.orders}
    src_orders = {o.id: o for o in request.orders}
    for o in fully_frozen:
        comp = frozen_completion.get(o.id, 0)
        order_results[o.id] = OrderResult(
            order_id=o.id, order_name=o.name, due_date=o.due_date,
            completion=comp, tardiness=max(0, comp - o.due_date),
        )
    # 部分冻结订单: 完工时间已含在模型内 (剩余工序), 无需修正
    all_orders = [
        order_results[oid] for oid in src_orders if oid in order_results
    ]

    makespan = max([result.makespan] + [op.end for op in frozen_ops])
    total_tard = sum(
        src_orders[r.order_id].priority * r.tardiness for r in all_orders
    )
    return result.model_copy(update={
        "operations": ops,
        "orders": all_orders,
        "makespan": makespan,
        "total_tardiness": total_tard,
    }), []
