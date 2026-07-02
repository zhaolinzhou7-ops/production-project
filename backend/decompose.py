"""滚动时域分解: 大规模订单按交期分批, 逐批 CP-SAT 求解。

每批求解后把机台占用推进 (machine_release) 并记录末道产品族
(machine_init_family), 供下一批计算首工序换型。牺牲全局最优换取可解性。
"""
from __future__ import annotations

import time

from .models import (
    MachineUtilization,
    OrderResult,
    ScheduledOperation,
    ScheduleRequest,
    ScheduleResult,
    SolverParams,
)


def solve_decomposed(
    request: ScheduleRequest, params: SolverParams, time_limit: float
) -> ScheduleResult:
    t0 = time.time()
    orders_sorted = sorted(request.orders, key=lambda o: (o.due_date, -o.priority))
    batches = [
        orders_sorted[i : i + params.batch_size]
        for i in range(0, len(orders_sorted), params.batch_size)
    ]
    per_batch_limit = max(time_limit / len(batches), 2.0)

    from .scheduler import solve_core

    machine_release: dict[str, int] = {}
    machine_init_family: dict[str, str] = {}
    all_ops: list[ScheduledOperation] = []
    all_orders: list[OrderResult] = []
    worst_status = "OPTIMAL"

    for batch in batches:
        sub = ScheduleRequest(
            machines=request.machines,
            orders=batch,
            weights=request.weights,
            time_limit_seconds=per_batch_limit,
            solver_params=params,
        )
        result = solve_core(
            sub,
            params=params,
            time_limit=per_batch_limit,
            machine_release=dict(machine_release),
            machine_init_family=dict(machine_init_family),
        )
        if result.status in ("INFEASIBLE", "MODEL_INVALID", "UNKNOWN"):
            return ScheduleResult(
                status=result.status, makespan=0, total_tardiness=0,
                total_changeover=0, objective_value=0.0,
                solve_time_seconds=round(time.time() - t0, 3),
                operations=[], orders=[], machine_utilization=[],
            )
        if result.status != "OPTIMAL":
            worst_status = result.status

        all_ops.extend(result.operations)
        all_orders.extend(result.orders)
        # 推进机台占用与末道产品族
        for so in result.operations:
            if so.end > machine_release.get(so.machine_id, 0):
                machine_release[so.machine_id] = so.end
                machine_init_family[so.machine_id] = so.family

    # ---- 汇总全局指标 ------------------------------------------------------
    all_ops.sort(key=lambda x: (x.machine_id, x.start))
    makespan = max((so.end for so in all_ops), default=0)
    total_setup = sum(so.setup for so in all_ops)
    order_prio = {o.id: o.priority for o in request.orders}
    total_tard = sum(order_prio[r.order_id] * r.tardiness for r in all_orders)

    busy: dict[str, int] = {}
    for so in all_ops:
        busy[so.machine_id] = busy.get(so.machine_id, 0) + so.duration + so.setup
    util = [
        MachineUtilization(
            machine_id=m.id, machine_name=m.name,
            busy_time=busy.get(m.id, 0),
            utilization=round(busy.get(m.id, 0) / makespan, 3) if makespan else 0.0,
        )
        for m in request.machines
    ]

    w = request.weights
    objective = (
        w.makespan * makespan + w.tardiness * total_tard + w.changeover * total_setup
    )
    return ScheduleResult(
        status=f"DECOMPOSED_{worst_status}",
        makespan=makespan,
        total_tardiness=total_tard,
        total_changeover=total_setup,
        objective_value=round(objective, 2),
        solve_time_seconds=round(time.time() - t0, 3),
        operations=all_ops,
        orders=all_orders,
        machine_utilization=util,
    )
