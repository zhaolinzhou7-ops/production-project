"""基于 OR-Tools CP-SAT 的柔性作业车间排产引擎 (FJSP solver)。

模型要点:
- 每道工序在每台合格机台上对应一个 "可选区间变量" (optional interval),
  恰好选择其中一个机台执行 (presence 之和 = 1)。
- 同一订单内工序遵守先后顺序 (sequence)。
- 同一机台: NoOverlap 不重叠 + AddCircuit 建模顺序相关换型时间。
  每机台一个回路: 节点 0 为虚拟起终点, 未选该机台的工序走自环退出;
  弧 (i -> j) 选中即约束 s_j >= e_i + setup(fam_i -> fam_j),
  换型总量为选中弧的线性和 (替代旧版 O(n^2) 成对布尔建模)。
- 多目标最小化: makespan / 加权拖期 / 换型总量 / 机台空闲 (首末工序间空隙)。
- 规模化: 贪心启发式提供初始解提示并收紧时域上界; 候选对数超阈值时
  转入滚动时域分解 (decompose.py); 超时无可行解时回退启发式方案。
"""
from __future__ import annotations

import time

from ortools.sat.python import cp_model

from .heuristic import greedy_schedule, plan_to_result
from .models import (
    OUTSOURCE_MACHINE_ID,
    MachineUtilization,
    Operation,
    Order,
    OrderResult,
    ScheduledOperation,
    ScheduleRequest,
    ScheduleResult,
    SolverParams,
)


def _sum_horizon(request: ScheduleRequest, machine_release: dict[str, int]) -> int:
    """保守时间上界: 所有工序最大耗时 + 换型 + 释放时间之和 + 停机总量。"""
    total = max(machine_release.values(), default=0)
    max_setup = 0
    for m in request.machines:
        for row in m.setup_times.values():
            for v in row.values():
                max_setup = max(max_setup, v)
    for order in request.orders:
        total += order.release_time
        for op in order.operations:
            if op.is_outsourced:
                total += op.outsource_lead
            else:
                total += max(op.eligible_machines.values()) + max_setup
    base = max(total, 1)
    # 工序需避开停机窗, 最坏情况全部被推到最晚停机窗之后
    max_window_end = max(
        (w.end for m in request.machines for w in m.downtime_windows),
        default=0,
    )
    return base + max_window_end


def _empty_result(status: str, solve_time: float) -> ScheduleResult:
    return ScheduleResult(
        status=status, makespan=0, total_tardiness=0, total_changeover=0,
        objective_value=0.0, solve_time_seconds=round(solve_time, 3),
        operations=[], orders=[], machine_utilization=[],
    )


def solve(request: ScheduleRequest) -> ScheduleResult:
    """排产入口: 规模超阈值走滚动分解, 否则整体求解。"""
    params = request.solver_params or SolverParams()
    time_limit = params.time_limit_seconds or request.time_limit_seconds

    pairs = sum(
        len(op.eligible_machines) for o in request.orders for op in o.operations
    )
    if pairs > params.decompose_threshold and len(request.orders) > params.batch_size:
        from .decompose import solve_decomposed

        return solve_decomposed(request, params, time_limit)

    return solve_core(request, params=params, time_limit=time_limit)


def solve_core(
    request: ScheduleRequest,
    *,
    params: SolverParams | None = None,
    time_limit: float | None = None,
    machine_release: dict[str, int] | None = None,
    machine_init_family: dict[str, str] | None = None,
) -> ScheduleResult:
    """整体 CP-SAT 求解。

    machine_release / machine_init_family: 各机台最早可用时刻与其上一产品族,
    滚动分解时由上一批传入 (普通排产为空)。
    """
    params = params or SolverParams()
    time_limit = time_limit or request.time_limit_seconds
    machine_release = machine_release or {}
    machine_init_family = machine_init_family or {}
    t0 = time.time()

    machines = {m.id: m for m in request.machines}

    # 有第二资源约束时贪心解可能超容量 (贪心不检查资源), 不能作为 hint/兜底
    res_ids = {r.id for r in request.resources}
    has_resource_ops = any(
        op.resource_id in res_ids
        for o in request.orders for op in o.operations
        if op.resource_id
    )
    use_hint = params.use_hint and not has_resource_ops

    # ---- 启发式初始解 (hint + 时域收紧 + 兜底) -----------------------------
    hint_plan = None
    if use_hint:
        hint_plan = greedy_schedule(request, machine_release, machine_init_family)
        # 上界留 30% 余量: 允许最优解为降换型/拖期而适当放宽完工时间
        horizon = int(hint_plan.makespan * 1.3) + 1
        horizon = max(horizon, *(machine_release.values() or [0])) + 1
    else:
        horizon = _sum_horizon(request, machine_release)

    model = cp_model.CpModel()

    # ---- 变量构造 ----------------------------------------------------------
    op_start: dict[str, cp_model.IntVar] = {}
    op_end: dict[str, cp_model.IntVar] = {}
    # alt[op_id][machine_id] = (presence, start, end, interval, duration)
    alt: dict[str, dict[str, tuple]] = {}
    machine_intervals: dict[str, list] = {m.id: [] for m in request.machines}
    # 机台上候选工序节点: (presence, start, end, family, op_id, order_id, seq)
    machine_ops: dict[str, list] = {m.id: [] for m in request.machines}

    for order in request.orders:
        for op in order.operations:
            s = model.NewIntVar(order.release_time, horizon, f"start_{op.id}")
            e = model.NewIntVar(order.release_time, horizon, f"end_{op.id}")
            op_start[op.id], op_end[op.id] = s, e
            alt[op.id] = {}

            if op.is_outsourced:
                # 外协: 固定周期, 不占内部机台/不进 NoOverlap
                model.Add(e == s + op.outsource_lead)
                continue

            presences = []
            for mid, dur in op.eligible_machines.items():
                lb = max(order.release_time, machine_release.get(mid, 0))
                pres = model.NewBoolVar(f"pres_{op.id}_{mid}")
                a_s = model.NewIntVar(lb, horizon, f"s_{op.id}_{mid}")
                a_e = model.NewIntVar(lb, horizon, f"e_{op.id}_{mid}")
                a_iv = model.NewOptionalIntervalVar(
                    a_s, dur, a_e, pres, f"iv_{op.id}_{mid}"
                )
                alt[op.id][mid] = (pres, a_s, a_e, a_iv, dur, lb)
                presences.append(pres)
                machine_intervals[mid].append(a_iv)
                machine_ops[mid].append(
                    (pres, a_s, a_e, op.family, op.id, order.id, op.sequence)
                )
                model.Add(s == a_s).OnlyEnforceIf(pres)
                model.Add(e == a_e).OnlyEnforceIf(pres)

            model.Add(sum(presences) == 1)

        # ---- 工序先后顺序约束 ----
        ops = order.operations
        for i in range(1, len(ops)):
            model.Add(op_start[ops[i].id] >= op_end[ops[i - 1].id])

    # ---- 机台: 不重叠 + Circuit 换型 ---------------------------------------
    setup_terms = []          # 换型量线性项 (进目标)
    # arc_selected[(mid)] = [(lit, from_node|None, to_node)], 用于结果回填换型
    machine_arcs: dict[str, list] = {}
    # 弧字面量登记 (供完整 hint): first/last/arc/empty
    first_lits: dict[str, dict[int, object]] = {}
    last_lits: dict[str, dict[int, object]] = {}
    pair_lits: dict[str, dict[tuple[int, int], object]] = {}
    empty_lits: dict[str, object] = {}
    idle_terms = []           # 各机台空闲 (进目标)
    machine_busy_expr: dict[str, object] = {}
    machine_span: dict[str, tuple] = {}  # mid -> (m_lo, m_hi, idle)

    for m in request.machines:
        mid = m.id
        nodes = machine_ops[mid]
        if not nodes:
            continue
        # 停机/班次外时间 -> 固定哑区间, 加工段不可与之重叠 (换型不占区间)
        for w in m.downtime_windows:
            machine_intervals[mid].append(
                model.NewFixedSizeIntervalVar(
                    w.start, w.end - w.start, f"down_{mid}_{w.start}"
                )
            )
        model.AddNoOverlap(machine_intervals[mid])

        init_fam = machine_init_family.get(mid)
        arcs = []
        arc_records = []  # (lit, from_idx|None, to_idx, setup)
        first_lits[mid], last_lits[mid], pair_lits[mid] = {}, {}, {}
        # 节点 0 = 虚拟起终点; 机台可能整台空置 -> 0 号自环
        empty = model.NewBoolVar(f"empty_{mid}")
        arcs.append((0, 0, empty))
        empty_lits[mid] = empty

        for j, (pres_j, s_j, e_j, fam_j, opid_j, ord_j, seq_j) in enumerate(nodes):
            nj = j + 1
            # 未选该机台 -> 自环退出回路
            arcs.append((nj, nj, pres_j.Not()))
            # 首工序弧 0 -> j: 承接上一批的产品族换型
            first = model.NewBoolVar(f"first_{mid}_{nj}")
            arcs.append((0, nj, first))
            first_lits[mid][j] = first
            setup0 = m.setup_time(init_fam, fam_j)
            if setup0 > 0:
                model.Add(s_j >= machine_release.get(mid, 0) + setup0).OnlyEnforceIf(first)
                setup_terms.append(setup0 * first)
            arc_records.append((first, None, j, setup0))
            # 末工序弧 j -> 0
            last = model.NewBoolVar(f"last_{mid}_{nj}")
            arcs.append((nj, 0, last))
            last_lits[mid][j] = last

            for i, (pres_i, s_i, e_i, fam_i, opid_i, ord_i, seq_i) in enumerate(nodes):
                if i == j:
                    continue
                # 剪枝: 同订单且 i 的工序号更大, 则 i 不可能紧邻排在 j 之前
                if ord_i == ord_j and seq_i > seq_j:
                    continue
                lit = model.NewBoolVar(f"arc_{mid}_{i}_{j}")
                arcs.append((i + 1, nj, lit))
                pair_lits[mid][(i, j)] = lit
                st = m.setup_time(fam_i, fam_j)
                model.Add(s_j >= e_i + st).OnlyEnforceIf(lit)
                if st > 0:
                    setup_terms.append(st * lit)
                arc_records.append((lit, i, j, st))

        model.AddCircuit(arcs)
        machine_arcs[mid] = arc_records

        # ---- 机台占用与空闲 (首末工序之间的空隙) ----
        busy = sum(
            alt[opid][mid][0] * alt[opid][mid][4]
            for (_, _, _, _, opid, _, _) in nodes
        )
        m_setup = sum(
            rec[0] * rec[3] for rec in arc_records if rec[3] > 0 and rec[1] is not None
        )
        machine_busy_expr[mid] = busy + m_setup

        m_lo = model.NewIntVar(0, horizon, f"lo_{mid}")
        m_hi = model.NewIntVar(0, horizon, f"hi_{mid}")
        model.Add(m_hi >= m_lo)
        for (pres, a_s, a_e, _, _, _, _) in nodes:
            model.Add(m_lo <= a_s).OnlyEnforceIf(pres)
            model.Add(m_hi >= a_e).OnlyEnforceIf(pres)
        idle = model.NewIntVar(0, horizon, f"idle_{mid}")
        model.Add(idle >= m_hi - m_lo - machine_busy_expr[mid])
        idle_terms.append(idle)
        machine_span[mid] = (m_lo, m_hi, idle)

    # ---- 第二资源 (工装/人员): Cumulative 容量约束 --------------------------
    if has_resource_ops:
        res_map = {r.id: r for r in request.resources}
        res_usage: dict[str, tuple[list, list]] = {r.id: ([], []) for r in request.resources}
        for order in request.orders:
            for op in order.operations:
                if op.is_outsourced or not op.resource_id:
                    continue
                if op.resource_id not in res_map:
                    raise ValueError(f"工序 {op.id} 引用了未定义的资源 {op.resource_id}")
                ivs, dem = res_usage[op.resource_id]
                # 所有机台候选可选区间都挂入; presence 保证同时只计一次
                for tup in alt[op.id].values():
                    ivs.append(tup[3])
                    dem.append(op.resource_qty)
        for rid, (ivs, dem) in res_usage.items():
            if ivs:
                model.AddCumulative(ivs, dem, res_map[rid].capacity)

    # ---- 目标各分量 --------------------------------------------------------
    makespan = model.NewIntVar(0, horizon, "makespan")
    model.AddMaxEquality(makespan, list(op_end.values()))

    tardiness_terms = []
    order_completion: dict[str, cp_model.IntVar] = {}
    order_tard: dict[str, cp_model.IntVar] = {}
    for order in request.orders:
        comp = op_end[order.operations[-1].id]
        order_completion[order.id] = comp
        tard = model.NewIntVar(0, horizon, f"tard_{order.id}")
        model.AddMaxEquality(tard, [comp - order.due_date, 0])
        order_tard[order.id] = tard
        tardiness_terms.append(order.priority * tard)

    total_tardiness = model.NewIntVar(0, horizon * 1000, "total_tardiness")
    model.Add(total_tardiness == sum(tardiness_terms))

    # 换型在多机台上并行累计, 总量可超过单机时域, 上界放宽到 horizon*机台数
    total_setup = model.NewIntVar(0, horizon * max(len(request.machines), 1), "total_setup")
    model.Add(total_setup == (sum(setup_terms) if setup_terms else 0))

    total_idle = model.NewIntVar(0, horizon * max(len(request.machines), 1), "total_idle")
    model.Add(total_idle == (sum(idle_terms) if idle_terms else 0))

    w = request.weights
    SCALE = 100  # CP-SAT 偏好整数目标, 权重放大取整
    model.Minimize(
        int(w.makespan * SCALE) * makespan
        + int(w.tardiness * SCALE) * total_tardiness
        + int(w.changeover * SCALE) * total_setup
        + int(w.idle * SCALE) * total_idle
    )

    # ---- 初始解提示 --------------------------------------------------------
    # 提示必须覆盖全部变量且自洽, CP-SAT 才能直接把启发式解验证为首个可行解
    # (不完整的提示在大模型上补全常失败, 退化成从零搜索)。
    if hint_plan is not None:
        asg = hint_plan.assignment
        for op_id, (mid, start, end, _setup) in asg.items():
            for cand_mid, (pres, a_s, a_e, _, dur, lb) in alt[op_id].items():
                chosen = cand_mid == mid
                model.AddHint(pres, int(chosen))
                model.AddHint(a_s, start if chosen else lb)
                model.AddHint(a_e, end if chosen else lb + dur)
            model.AddHint(op_start[op_id], start)
            model.AddHint(op_end[op_id], end)

        total_idle_hint = 0
        for m in request.machines:
            mid = m.id
            if mid not in first_lits:
                continue
            nodes = machine_ops[mid]
            # 该机台被启发式选中的节点, 按开工时间排出先后序
            chosen = [j for j, node in enumerate(nodes) if asg[node[4]][0] == mid]
            chosen.sort(key=lambda j: asg[nodes[j][4]][1])
            model.AddHint(empty_lits[mid], 0 if chosen else 1)
            for j, lit in first_lits[mid].items():
                model.AddHint(lit, 1 if chosen and j == chosen[0] else 0)
            for j, lit in last_lits[mid].items():
                model.AddHint(lit, 1 if chosen and j == chosen[-1] else 0)
            consecutive = set(zip(chosen, chosen[1:]))
            for (i, j), lit in pair_lits[mid].items():
                model.AddHint(lit, 1 if (i, j) in consecutive else 0)

            m_lo, m_hi, idle = machine_span[mid]
            if chosen:
                lo = min(asg[nodes[j][4]][1] for j in chosen)
                hi = max(asg[nodes[j][4]][2] for j in chosen)
                busy = sum(
                    asg[nodes[j][4]][2] - asg[nodes[j][4]][1] + asg[nodes[j][4]][3]
                    for j in chosen
                )
                idle_val = max(0, hi - lo - busy)
            else:
                lo = hi = idle_val = 0
            model.AddHint(m_lo, lo)
            model.AddHint(m_hi, hi)
            model.AddHint(idle, idle_val)
            total_idle_hint += idle_val

        model.AddHint(makespan, hint_plan.makespan)
        total_tard_hint = 0
        for order in request.orders:
            comp = max(asg[op.id][2] for op in order.operations)
            tard_val = max(0, comp - order.due_date)
            model.AddHint(order_tard[order.id], tard_val)
            total_tard_hint += order.priority * tard_val
        model.AddHint(total_tardiness, total_tard_hint)
        model.AddHint(total_setup, sum(s for (_, _, _, s) in asg.values()))
        model.AddHint(total_idle, total_idle_hint)

    # ---- 求解 --------------------------------------------------------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(time_limit - (time.time() - t0), 1.0)
    solver.parameters.num_search_workers = params.num_workers
    status = solver.Solve(model)
    solve_time = time.time() - t0

    status_name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if hint_plan is not None and status != cp_model.INFEASIBLE:
            # 超时未找到可行解 -> 回退启发式方案
            return plan_to_result(request, hint_plan, solve_time)
        return _empty_result(status_name, solve_time)

    # ---- 提取结果 ----------------------------------------------------------
    # 换型来源: 每机台选中弧 (入弧决定该工序的换型时长)
    op_setup: dict[str, int] = {}
    for mid, records in machine_arcs.items():
        nodes = machine_ops[mid]
        for lit, _from_idx, to_idx, st in records:
            if solver.Value(lit) == 1:
                op_setup[nodes[to_idx][4]] = st

    op_lookup: dict[str, tuple[Order, Operation]] = {}
    for o in request.orders:
        for op in o.operations:
            op_lookup[op.id] = (o, op)

    scheduled: list[ScheduledOperation] = []
    for op_id, alts in alt.items():
        for mid, (pres, a_s, a_e, _, dur, _lb) in alts.items():
            if solver.Value(pres) == 1:
                order, op = op_lookup[op_id]
                scheduled.append(ScheduledOperation(
                    operation_id=op_id, operation_name=op.name,
                    order_id=order.id, order_name=order.name,
                    machine_id=mid, family=op.family,
                    start=solver.Value(a_s),
                    setup=op_setup.get(op_id, 0),
                    duration=dur,
                    end=solver.Value(a_e),
                ))
    # 外协工序: 无机台区间, 直接取总体开工/完工
    for o in request.orders:
        for op in o.operations:
            if op.is_outsourced:
                scheduled.append(ScheduledOperation(
                    operation_id=op.id, operation_name=op.name,
                    order_id=o.id, order_name=o.name,
                    machine_id=OUTSOURCE_MACHINE_ID, family=op.family,
                    start=solver.Value(op_start[op.id]),
                    setup=0,
                    duration=op.outsource_lead,
                    end=solver.Value(op_end[op.id]),
                ))
    scheduled.sort(key=lambda x: (x.machine_id, x.start))

    order_results = []
    for o in request.orders:
        comp = solver.Value(order_completion[o.id])
        order_results.append(OrderResult(
            order_id=o.id, order_name=o.name, due_date=o.due_date,
            completion=comp, tardiness=max(0, comp - o.due_date),
        ))

    ms = solver.Value(makespan)
    util = []
    for m in request.machines:
        busy_total = (
            int(solver.Value(machine_busy_expr[m.id]))
            if m.id in machine_busy_expr else 0
        )
        util.append(MachineUtilization(
            machine_id=m.id, machine_name=m.name, busy_time=busy_total,
            utilization=round(busy_total / ms, 3) if ms > 0 else 0.0,
        ))

    return ScheduleResult(
        status=status_name,
        makespan=ms,
        total_tardiness=solver.Value(total_tardiness),
        total_changeover=solver.Value(total_setup),
        objective_value=round(solver.ObjectiveValue() / 100, 2),
        solve_time_seconds=round(solve_time, 3),
        operations=scheduled,
        orders=order_results,
        machine_utilization=util,
    )
