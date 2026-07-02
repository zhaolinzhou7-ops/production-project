"""冻结冲突预检测试: 返回结构化冲突而非黑盒 INFEASIBLE。"""
from __future__ import annotations

from backend.models import (
    FrozenOp,
    Machine,
    Operation,
    Order,
    ScheduleRequest,
    TimeWindow,
)
from backend.reschedule import precheck_conflicts, solve_with_freeze


def _request() -> ScheduleRequest:
    return ScheduleRequest(
        machines=[Machine(id="M1", name="车床")],
        orders=[
            Order(id="J1", name="a", due_date=500, operations=[
                Operation(id="J1-0", name="op1", sequence=0, family="A",
                          eligible_machines={"M1": 60}),
                Operation(id="J1-1", name="op2", sequence=1, family="A",
                          eligible_machines={"M1": 40}),
            ]),
        ],
        time_limit_seconds=5,
    )


def test_downtime_overlap_conflict():
    """新停机窗覆盖已开工工序 -> 返回 downtime_overlap 冲突。"""
    req = _request()
    frozen = {"J1-0": FrozenOp(op_id="J1-0", machine_id="M1", start=10, end=70)}
    result, conflicts = solve_with_freeze(
        req, frozen,
        extra_downtimes={"M1": [TimeWindow(start=40, end=120)]},
    )
    assert result is None
    assert len(conflicts) == 1
    assert conflicts[0].kind == "downtime_overlap"
    assert conflicts[0].op_id == "J1-0"


def test_non_prefix_freeze_conflict():
    """后道工序报工但前道未报 -> non_prefix_freeze 冲突。"""
    req = _request()
    frozen = {"J1-1": FrozenOp(op_id="J1-1", machine_id="M1", start=100, end=140)}
    conflicts = precheck_conflicts(req, frozen)
    assert any(c.kind == "non_prefix_freeze" for c in conflicts)


def test_unknown_machine_conflict():
    req = _request()
    frozen = {"J1-0": FrozenOp(op_id="J1-0", machine_id="MX", start=0, end=60)}
    conflicts = precheck_conflicts(req, frozen)
    assert any(c.kind == "machine_not_eligible" for c in conflicts)


def test_no_conflict_passes():
    req = _request()
    frozen = {"J1-0": FrozenOp(op_id="J1-0", machine_id="M1", start=0, end=60)}
    assert precheck_conflicts(req, frozen) == []
