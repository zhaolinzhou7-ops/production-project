"""基于 OR-Tools CP-SAT 的柔性作业车间排产引擎 (FJSP solver).

模型要点:
- 每道工序在每台合格机台上对应一个 "可选区间变量" (optional interval),
  恰好选择其中一个机台执行 (presence 之和 = 1)。
- 工序的实际开工/完工时间在所选机台的区间上对齐。
- 同一订单内工序遵守先后顺序 (sequence)。
- 同一机台上的工序两两不重叠 (no_overlap), 并按顺序相关换型时间约束相邻工序间隔。
- 多目标: 最短完工时间 / 拖期 / 换型 / 空闲, 加权求和后最小化。
"""
from __future__ import annotations

import time

from ortools.sat.python import cp_model

from .models import (
    MachineUtilization,
    Operation,
    Order,
    OrderResult,
    ScheduledOperation,
    ScheduleRequest,
    ScheduleResult,
)


def _horizon(request: ScheduleRequest) -> int:
    """一个安全的时间上界: 所有工序最大耗时 + 换型 + 最晚释放时间之和。"""
    total = 0
    max_setup = 0
    for m in request.machines:
        for row in m.setup_times.values():
            for v in row.values():
                max_setup = max(max_setup, v)
    for order in request.orders:
        total += order.release_time
        for op in order.operations:
            total += max(op.eligible_machines.values()) + max_setup
    return max(total, 1)


def solve(request: ScheduleRequest) -> ScheduleResult:
    model = cp_model.CpModel()
    horizon = _horizon(request)

    machines = {m.id: m for m in request.machines}

    # ---- 变量构造 ----------------------------------------------------------
    # 每个 (order, op) 的总体开工/完工 (跨机台对齐)
    op_start: dict[str, cp_model.IntVar] = {}
    op_end: dict[str, cp_model.IntVar] = {}
    op_family: dict[str, str] = {}

    # 每个 (op, machine) 的可选区间及其元数据
    # alt[op_id][machine_id] = (presence, start, end, interval, duration)
    alt: dict[str, dict[str, tuple]] = {}

    # 每台机台上的所有可选区间 (用于 no_overlap)
    machine_intervals: dict[str, list] = {m.id: [] for m in request.machines}
    # 每台机台上 (presence, start, end, family, op_id) 用于换型约束
    machine_ops: dict[str, list] = {m.id: [] for m in request.machines}

    for order in request.orders:
        for op in order.operations:
            s = model.NewIntVar(order.release_time, horizon, f"start_{op.id}")
            e = model.NewIntVar(order.release_time, horizon, f"end_{op.id}")
            op_start[op.id] = s
            op_end[op.id] = e
            op_family[op.id] = op.family
            alt[op.id] = {}

            presences = []
            for mid, dur in op.eligible_machines.items():
                pres = model.NewBoolVar(f"pres_{op.id}_{mid}")
                a_s = model.NewIntVar(order.release_time, horizon, f"s_{op.id}_{mid}")
                a_e = model.NewIntVar(order.release_time, horizon, f"e_{op.id}_{mid}")
                a_iv = model.NewOptionalIntervalVar(
                    a_s, dur, a_e, pres, f"iv_{op.id}_{mid}"
                )
                alt[op.id][mid] = (pres, a_s, a_e, a_iv, dur)
                presences.append(pres)
                machine_intervals[mid].append(a_iv)
                machine_ops[mid].append((pres, a_s, a_e, op.family, op.id))

                # 若选择该机台, 总体开工/完工与该机台区间对齐
                model.Add(s == a_s).OnlyEnforceIf(pres)
                model.Add(e == a_e).OnlyEnforceIf(pres)

            # 恰好选择一台机台
            model.Add(sum(presences) == 1)

        # ---- 工序先后顺序约束 ----
        ops = order.operations
        for i in range(1, len(ops)):
            model.Add(op_start[ops[i].id] >= op_end[ops[i - 1].id])

    # ---- 机台上不重叠 + 顺序相关换型时间 -----------------------------------
    # 换型时间总量 (用于目标)
    setup_terms: list[cp_model.IntVar] = []
    # 每台机台的占用时间 (加工+换型), 用于利用率与空闲目标
    machine_busy: dict[str, cp_model.IntVar] = {}

    for m in request.machines:
        mid = m.id
        model.AddNoOverlap(machine_intervals[mid])

        ops_on_m = machine_ops[mid]
        # 对机台上每一对工序 (a, b): 若两者都选了该机台, 则需满足换型间隔。
        # 用 before[a][b] 表示 a 在 b 之前。
        for i in range(len(ops_on_m)):
            pres_i, s_i, e_i, fam_i, opid_i = ops_on_m[i]
            for j in range(i + 1, len(ops_on_m)):
                pres_j, s_j, e_j, fam_j, opid_j = ops_on_m[j]
                if opid_i == opid_j:
                    continue
                both = model.NewBoolVar(f"both_{mid}_{i}_{j}")
                model.AddBoolAnd([pres_i, pres_j]).OnlyEnforceIf(both)
                model.AddBoolOr([pres_i.Not(), pres_j.Not()]).OnlyEnforceIf(
                    both.Not()
                )

                i_before_j = model.NewBoolVar(f"order_{mid}_{i}_{j}")
                setup_ij = m.setup_time(fam_i, fam_j)
                setup_ji = m.setup_time(fam_j, fam_i)

                # i 在 j 前: s_j >= e_i + setup(i->j)
                model.Add(s_j >= e_i + setup_ij).OnlyEnforceIf([both, i_before_j])
                # j 在 i 前: s_i >= e_j + setup(j->i)
                model.Add(s_i >= e_j + setup_ji).OnlyEnforceIf(
                    [both, i_before_j.Not()]
                )

                # 记录换型量 (只在 both 时计入)
                st = model.NewIntVar(0, max(setup_ij, setup_ji), f"st_{mid}_{i}_{j}")
                model.Add(st == setup_ij).OnlyEnforceIf([both, i_before_j])
                model.Add(st == setup_ji).OnlyEnforceIf([both, i_before_j.Not()])
                model.Add(st == 0).OnlyEnforceIf(both.Not())
                setup_terms.append(st)

        # 机台占用时间 = sum(选中工序的加工时长) + 该机台换型量
        proc_on_m = []
        for op_id, alts in alt.items():
            if mid in alts:
                pres, _, _, _, dur = alts[mid]
                proc_on_m.append(pres * dur)
        busy = model.NewIntVar(0, horizon, f"busy_{mid}")
        model.Add(busy == sum(proc_on_m))
        machine_busy[mid] = busy

    # ---- 目标各分量 --------------------------------------------------------
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, list(op_end.values()))

    # 加权拖期
    tardiness_terms = []
    order_completion: dict[str, cp_model.IntVar] = {}
    for order in request.orders:
        last_op = order.operations[-1]
        comp = op_end[last_op.id]
        order_completion[order.id] = comp
        tard = model.NewIntVar(0, horizon, f"tard_{order.id}")
        model.AddMaxEquality(tard, [comp - order.due_date, 0])
        tardiness_terms.append(order.priority * tard)

    total_tardiness = model.NewIntVar(0, horizon * 1000, "total_tardiness")
    model.Add(total_tardiness == sum(tardiness_terms))

    total_setup = model.NewIntVar(0, horizon, "total_setup")
    model.Add(total_setup == (sum(setup_terms) if setup_terms else 0))

    # 空闲 = makespan * 机台数 - 总占用 (近似, 越小越好 => 利用率越高)
    total_busy = model.NewIntVar(0, horizon * len(request.machines), "total_busy")
    model.Add(total_busy == sum(machine_busy.values()))

    w = request.weights
    # 用整数放大权重, CP-SAT 偏好整数目标
    SCALE = 100
    objective = (
        int(w.makespan * SCALE) * makespan
        + int(w.tardiness * SCALE) * total_tardiness
        + int(w.changeover * SCALE) * total_setup
        # 空闲目标: 最大化 total_busy 等价于在 objective 里减去它
        - int(w.idle * SCALE) * total_busy
    )
    model.Minimize(objective)

    # ---- 求解 --------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.time_limit_seconds
    solver.parameters.num_search_workers = 8
    t0 = time.time()
    status = solver.Solve(model)
    solve_time = time.time() - t0

    status_name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return ScheduleResult(
            status=status_name,
            makespan=0,
            total_tardiness=0,
            total_changeover=0,
            objective_value=0.0,
            solve_time_seconds=round(solve_time, 3),
            operations=[],
            orders=[],
            machine_utilization=[],
        )

    # ---- 提取结果 ----------------------------------------------------------
    scheduled: list[ScheduledOperation] = []
    order_lookup = {o.id: o for o in request.orders}
    op_lookup: dict[str, tuple[Order, Operation]] = {}
    for o in request.orders:
        for op in o.operations:
            op_lookup[op.id] = (o, op)

    # 计算每条工序的换型 (基于机台上的实际先后)
    for op_id, alts in alt.items():
        for mid, (pres, a_s, a_e, _, dur) in alts.items():
            if solver.Value(pres) == 1:
                order, op = op_lookup[op_id]
                start = solver.Value(a_s)
                end = solver.Value(a_e)
                scheduled.append(
                    ScheduledOperation(
                        operation_id=op_id,
                        operation_name=op.name,
                        order_id=order.id,
                        order_name=order.name,
                        machine_id=mid,
                        family=op.family,
                        start=start,
                        setup=0,  # 占位, 下面按机台序列回填
                        duration=dur,
                        end=end,
                    )
                )

    # 回填换型: 按机台分组排序, 计算相邻工序换型时间
    by_machine: dict[str, list[ScheduledOperation]] = {}
    for so in scheduled:
        by_machine.setdefault(so.machine_id, []).append(so)
    for mid, ops_seq in by_machine.items():
        ops_seq.sort(key=lambda x: x.start)
        m = machines[mid]
        prev_family = None
        for so in ops_seq:
            so.setup = m.setup_time(prev_family, so.family)
            prev_family = so.family

    scheduled.sort(key=lambda x: (x.machine_id, x.start))

    order_results = []
    for o in request.orders:
        comp = solver.Value(order_completion[o.id])
        order_results.append(
            OrderResult(
                order_id=o.id,
                order_name=o.name,
                due_date=o.due_date,
                completion=comp,
                tardiness=max(0, comp - o.due_date),
            )
        )

    ms = solver.Value(makespan)
    util = []
    for m in request.machines:
        busy = solver.Value(machine_busy[m.id])
        # 加上换型时间到占用
        setup_on_m = sum(so.setup for so in by_machine.get(m.id, []))
        busy_total = busy + setup_on_m
        util.append(
            MachineUtilization(
                machine_id=m.id,
                machine_name=m.name,
                busy_time=busy_total,
                utilization=round(busy_total / ms, 3) if ms > 0 else 0.0,
            )
        )

    return ScheduleResult(
        status=status_name,
        makespan=ms,
        total_tardiness=solver.Value(total_tardiness),
        total_changeover=solver.Value(total_setup),
        objective_value=round(solver.ObjectiveValue() / SCALE, 2),
        solve_time_seconds=round(solve_time, 3),
        operations=scheduled,
        orders=order_results,
        machine_utilization=util,
    )
