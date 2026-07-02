"""冻结增量重排测试。"""
from __future__ import annotations

from backend.models import (
    FrozenOp,
    Machine,
    Operation,
    Order,
    ScheduleRequest,
)
from backend.reschedule import solve_with_freeze

from validators import assert_schedule_valid


def _request() -> ScheduleRequest:
    machines = [
        Machine(id="M1", name="车床",
                setup_times={"A": {"B": 25}, "B": {"A": 25}}),
        Machine(id="M2", name="铣床"),
    ]
    orders = [
        Order(id="J1", name="a", due_date=500, priority=2, operations=[
            Operation(id="J1-0", name="车", sequence=0, family="A",
                      eligible_machines={"M1": 60}),
            Operation(id="J1-1", name="铣", sequence=1, family="A",
                      eligible_machines={"M2": 40}),
        ]),
        Order(id="J2", name="b", due_date=500, operations=[
            Operation(id="J2-0", name="车", sequence=0, family="B",
                      eligible_machines={"M1": 50}),
        ]),
    ]
    return ScheduleRequest(machines=machines, orders=orders, time_limit_seconds=8)


def test_frozen_op_unchanged():
    """已开工工序保持机台与时间不动, 其余工序 >= now。"""
    req = _request()
    frozen = {"J1-0": FrozenOp(op_id="J1-0", machine_id="M1", start=10, end=70)}
    result, conflicts = solve_with_freeze(req, frozen, now=30)

    assert conflicts == []
    assert result.status in ("OPTIMAL", "FEASIBLE")
    ops = {o.operation_id: o for o in result.operations}
    assert ops["J1-0"].machine_id == "M1"
    assert (ops["J1-0"].start, ops["J1-0"].end) == (10, 70)
    # 未冻结工序不得早于 now=30 (J2-0 在 M1 上还要等冻结工序完工)
    assert ops["J2-0"].start >= 70
    assert ops["J1-1"].start >= 70


def test_frozen_family_counts_changeover():
    """冻结工序的产品族应作为机台初始族, 影响后续换型。"""
    req = _request()
    frozen = {"J1-0": FrozenOp(op_id="J1-0", machine_id="M1", start=0, end=60)}
    result, _ = solve_with_freeze(req, frozen)
    ops = {o.operation_id: o for o in result.operations}
    # J2-0 (B 族) 排在 A 族冻结工序后, 需 25 分钟换型
    assert ops["J2-0"].start >= 60 + 25
    assert ops["J2-0"].setup == 25


def test_fully_frozen_order():
    """订单全部工序冻结时, 交付结果直接来自冻结安排。"""
    req = _request()
    frozen = {
        "J1-0": FrozenOp(op_id="J1-0", machine_id="M1", start=0, end=60),
        "J1-1": FrozenOp(op_id="J1-1", machine_id="M2", start=60, end=100),
    }
    result, _ = solve_with_freeze(req, frozen)
    j1 = next(o for o in result.orders if o.order_id == "J1")
    assert j1.completion == 100
    assert j1.tardiness == 0
    assert len(result.operations) == 3


def test_downtime_override_applies():
    """模拟新增停机窗: 未冻结工序须避开。"""
    from backend.models import TimeWindow

    req = _request()
    result, conflicts = solve_with_freeze(
        req, {}, extra_downtimes={"M1": [TimeWindow(start=0, end=100)]},
    )
    assert conflicts == []
    ops = {o.operation_id: o for o in result.operations}
    assert ops["J1-0"].start >= 100
    assert ops["J2-0"].start >= 100
    assert_schedule_valid_with_extra(req, result)


def assert_schedule_valid_with_extra(req, result):
    # extra downtime 不在原 req 里, 只做基本校验
    by_machine = {}
    for op in result.operations:
        by_machine.setdefault(op.machine_id, []).append(op)
    for ops in by_machine.values():
        ops.sort(key=lambda x: x.start)
        for i in range(1, len(ops)):
            assert ops[i].start >= ops[i - 1].end
