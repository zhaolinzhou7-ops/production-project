"""Circuit 换型建模的正确性测试。"""
from __future__ import annotations

from backend.models import (
    Machine,
    ObjectiveWeights,
    Operation,
    Order,
    ScheduleRequest,
)
from backend.sample_data import sample_request
from backend.scheduler import solve

from validators import assert_schedule_valid


def _single_machine_request() -> ScheduleRequest:
    """1 台机台 3 道独立工序: 族序 A,B,A; 已知最优换型 = 一次 A->B (10)。

    换型矩阵 A->B=10, B->A=50: 最优顺序是把两个 A 排在一起 (A,A,B),
    总换型 10; 差的顺序 (A,B,A) 要 10+50=60。
    """
    m = Machine(id="M1", name="车床",
                setup_times={"A": {"A": 0, "B": 10}, "B": {"A": 50, "B": 0}})
    orders = [
        Order(id="J1", name="a1", due_date=1000, operations=[
            Operation(id="J1-0", name="op", sequence=0, family="A",
                      eligible_machines={"M1": 20}),
        ]),
        Order(id="J2", name="b1", due_date=1000, operations=[
            Operation(id="J2-0", name="op", sequence=0, family="B",
                      eligible_machines={"M1": 20}),
        ]),
        Order(id="J3", name="a2", due_date=1000, operations=[
            Operation(id="J3-0", name="op", sequence=0, family="A",
                      eligible_machines={"M1": 20}),
        ]),
    ]
    return ScheduleRequest(
        machines=[m], orders=orders,
        weights=ObjectiveWeights(makespan=0, tardiness=0, changeover=1, idle=0),
        time_limit_seconds=8,
    )


def test_known_optimal_changeover():
    result = solve(_single_machine_request())
    assert result.status == "OPTIMAL"
    assert result.total_changeover == 10
    assert_schedule_valid(_single_machine_request(), result)


def test_reported_setup_matches_sequence():
    """结果里每道工序的 setup 应与机台实际先后序一致 (来源: 选中弧)。"""
    req = _single_machine_request()
    result = solve(req)
    seq = sorted(result.operations, key=lambda x: x.start)
    m = req.machines[0]
    prev_family = None
    for sop in seq:
        assert sop.setup == m.setup_time(prev_family, sop.family)
        prev_family = sop.family


def test_sample_valid_and_setup_counted():
    req = sample_request()
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert_schedule_valid(req, result)
    # 换型总量 = 各工序 setup 之和 (同源)
    assert result.total_changeover == sum(op.setup for op in result.operations)


def test_machine_release_and_init_family():
    """滚动分解入参: 机台释放时刻与初始产品族生效。"""
    from backend.scheduler import solve_core

    req = _single_machine_request()
    result = solve_core(
        req, machine_release={"M1": 100}, machine_init_family={"M1": "B"},
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    first = min(result.operations, key=lambda x: x.start)
    # 机台 100 分钟才可用; B 起手, 首道 A 工序要 50 换型 -> 最优是先排 B (0 换型)
    assert first.start >= 100
    assert first.family == "B"
