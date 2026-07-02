"""外协工序测试: 固定周期、不占机台、顺序保持。"""
from __future__ import annotations

from backend.models import (
    OUTSOURCE_MACHINE_ID,
    Machine,
    Operation,
    Order,
    ScheduleRequest,
)
from backend.scheduler import solve

from validators import assert_schedule_valid


def _request() -> ScheduleRequest:
    """车削 -> 外协热处理(240min) -> 磨削; 另一订单占用机台。"""
    machines = [Machine(id="M1", name="车床"), Machine(id="M2", name="磨床")]
    orders = [
        Order(id="J1", name="主轴", due_date=1000, priority=2, operations=[
            Operation(id="J1-0", name="车削", sequence=0, family="A",
                      eligible_machines={"M1": 60}),
            Operation(id="J1-1", name="热处理", sequence=1, family="A",
                      is_outsourced=True, outsource_lead=240),
            Operation(id="J1-2", name="磨削", sequence=2, family="A",
                      eligible_machines={"M2": 50}),
        ]),
        Order(id="J2", name="衬套", due_date=1000, operations=[
            Operation(id="J2-0", name="车削", sequence=0, family="A",
                      eligible_machines={"M1": 80}),
        ]),
    ]
    return ScheduleRequest(machines=machines, orders=orders, time_limit_seconds=8)


def test_outsource_fixed_lead_and_sequence():
    req = _request()
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert_schedule_valid(req, result)

    ops = {o.operation_id: o for o in result.operations}
    ht = ops["J1-1"]
    assert ht.machine_id == OUTSOURCE_MACHINE_ID
    assert ht.end - ht.start == 240
    assert ht.start >= ops["J1-0"].end
    assert ops["J1-2"].start >= ht.end


def test_outsource_does_not_block_machines():
    """外协期间机台可加工其他订单 (J2 与热处理并行)。"""
    req = _request()
    result = solve(req)
    ops = {o.operation_id: o for o in result.operations}
    # 机台利用不含外协: 外协不出现在任何真实机台上
    assert all(
        op.machine_id in ("M1", "M2", OUTSOURCE_MACHINE_ID)
        for op in result.operations
    )
    # J1 完工 = 车60 + 热240 + 磨50 = 350 (机台冲突只影响 J2)
    j1 = next(o for o in result.orders if o.order_id == "J1")
    assert j1.completion == 350


def test_outsource_validation():
    import pytest

    with pytest.raises(ValueError, match="外协周期"):
        Operation(id="X", name="x", sequence=0, family="A", is_outsourced=True)
    with pytest.raises(ValueError, match="合格机台"):
        Operation(id="X", name="x", sequence=0, family="A")
