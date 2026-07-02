"""大规模随机算例测试 (打 slow marker, CI 可分层执行)。"""
from __future__ import annotations

import random

import pytest

from backend.models import (
    Machine,
    Operation,
    Order,
    ScheduleRequest,
    SolverParams,
)
from backend.scheduler import solve

from validators import assert_schedule_valid


def random_request(
    n_orders: int, n_machines: int, ops_per_order: int = 3, seed: int = 42
) -> ScheduleRequest:
    rng = random.Random(seed)
    families = ["A", "B", "C"]
    machines = []
    for i in range(n_machines):
        setup = {
            f: {t: (0 if f == t else rng.randint(10, 40)) for t in families}
            for f in families
        }
        machines.append(Machine(id=f"M{i}", name=f"机台{i}", setup_times=setup))

    orders = []
    for j in range(n_orders):
        ops = []
        for k in range(ops_per_order):
            eligible = rng.sample(range(n_machines), rng.randint(2, min(4, n_machines)))
            ops.append(Operation(
                id=f"J{j}-{k}", name=f"工序{k}", sequence=k,
                family=rng.choice(families),
                eligible_machines={f"M{m}": rng.randint(15, 60) for m in eligible},
            ))
        orders.append(Order(
            id=f"J{j}", name=f"订单{j}",
            due_date=rng.randint(300, 2000),
            priority=rng.randint(1, 3),
            operations=ops,
        ))
    return ScheduleRequest(machines=machines, orders=orders)


@pytest.mark.slow
def test_100_orders_20_machines_feasible():
    """100 订单 x 3 工序 x 20 机台, 限时内可行且方案有效。"""
    req = random_request(100, 20)
    req.time_limit_seconds = 60
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE", "HEURISTIC"), result.status
    assert_schedule_valid(req, result)


@pytest.mark.slow
def test_decomposition_triggers_and_valid():
    """超过分解阈值时走滚动时域, 结果仍需通过可行性校验。"""
    req = random_request(60, 10)
    req.time_limit_seconds = 40
    req.solver_params = SolverParams(decompose_threshold=100, batch_size=20)
    result = solve(req)
    assert result.status.startswith("DECOMPOSED_"), result.status
    assert_schedule_valid(req, result)


def test_small_decomposition_valid():
    """小算例强制分解 (快速回归, 不打 slow)。"""
    req = random_request(12, 4, ops_per_order=2, seed=7)
    req.time_limit_seconds = 20
    req.solver_params = SolverParams(decompose_threshold=10, batch_size=4)
    result = solve(req)
    assert result.status.startswith("DECOMPOSED_"), result.status
    assert_schedule_valid(req, result)
