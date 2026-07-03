"""第二资源 (工装/人员) Cumulative 约束测试。"""
from __future__ import annotations

from backend.models import (
    Machine,
    Operation,
    Order,
    Resource,
    ScheduleRequest,
)
from backend.scheduler import solve

from validators import assert_schedule_valid


def _request(capacity: int) -> ScheduleRequest:
    """两台机台两道同族工序, 都需要同一工装; capacity=1 时必须串行。"""
    machines = [Machine(id="M1", name="A机"), Machine(id="M2", name="B机")]
    orders = [
        Order(id="J1", name="x", due_date=500, operations=[
            Operation(id="J1-0", name="铣", sequence=0, family="A",
                      eligible_machines={"M1": 60},
                      resource_id="F1", resource_qty=1),
        ]),
        Order(id="J2", name="y", due_date=500, operations=[
            Operation(id="J2-0", name="铣", sequence=0, family="A",
                      eligible_machines={"M2": 60},
                      resource_id="F1", resource_qty=1),
        ]),
    ]
    return ScheduleRequest(
        machines=machines, orders=orders,
        resources=[Resource(id="F1", name="专用夹具", capacity=capacity)],
        time_limit_seconds=8,
    )


def test_capacity_one_serializes():
    req = _request(capacity=1)
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert_schedule_valid(req, result)
    a, b = sorted(result.operations, key=lambda x: x.start)
    # 不同机台但共用一套工装 -> 不得重叠
    assert b.start >= a.end


def test_capacity_two_allows_parallel():
    req = _request(capacity=2)
    result = solve(req)
    assert result.status == "OPTIMAL"
    a, b = sorted(result.operations, key=lambda x: x.start)
    assert a.start == b.start == 0  # 可并行


def test_unknown_resource_rejected():
    import pytest

    req = _request(capacity=1)
    req.orders[0].operations[0].resource_id = "F_MISSING"
    with pytest.raises(ValueError, match="F_MISSING"):
        solve(req)
