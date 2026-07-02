"""CRUD 往返与排产请求组装测试 (内存 SQLite)。"""
from __future__ import annotations

from datetime import datetime

import pytest

from backend import crud
from backend.schemas import OperationDTO, OrderDTO


def _seed(session, sample_machines, sample_order):
    for m in sample_machines:
        crud.upsert_machine(session, m)
    crud.upsert_order(session, sample_order)
    session.commit()


def test_machine_roundtrip(session, sample_machines):
    for m in sample_machines:
        crud.upsert_machine(session, m)
    session.commit()

    loaded = crud.list_machines(session)
    assert [m.id for m in loaded] == ["M1", "M2"]
    assert loaded[0].setup_times == {"A": {"B": 30}, "B": {"A": 20}}

    # 更新换型矩阵
    crud.set_setup_times(session, "M1", {"A": {"B": 99}})
    assert crud.get_machine(session, "M1").setup_times == {"A": {"B": 99}}


def test_order_roundtrip(session, sample_machines, sample_order):
    _seed(session, sample_machines, sample_order)

    loaded = crud.get_order(session, "J1")
    assert loaded is not None
    assert [op.seq for op in loaded.operations] == [0, 1]
    assert loaded.operations[0].machines == {"M1": 40, "M2": 50}
    # 工序 ID 自动生成
    assert loaded.operations[0].id == "J1-0"

    # 全量替换工序
    sample_order.operations = [
        OperationDTO(seq=0, name="磨削", family="B", machines={"M2": 20})
    ]
    crud.upsert_order(session, sample_order)
    loaded = crud.get_order(session, "J1")
    assert len(loaded.operations) == 1
    assert loaded.operations[0].name == "磨削"


def test_order_rejects_unknown_machine(session, sample_machines):
    crud.upsert_machine(session, sample_machines[0])
    bad = OrderDTO(
        id="J9", name="x", due_date=datetime(2026, 7, 10),
        operations=[OperationDTO(seq=0, name="车", family="A", machines={"MX": 10})],
    )
    with pytest.raises(ValueError, match="MX"):
        crud.upsert_order(session, bad)


def test_delete_machine_in_use_rejected(session, sample_machines, sample_order):
    _seed(session, sample_machines, sample_order)
    with pytest.raises(ValueError, match="M1"):
        crud.delete_machine(session, "M1")
    # 订单删除后机台可删
    crud.delete_order(session, "J1")
    assert crud.delete_machine(session, "M1") is True


def test_load_schedule_request_converts_minutes(session, sample_machines, sample_order):
    _seed(session, sample_machines, sample_order)
    start = datetime(2026, 7, 10, 8, 0)

    req = crud.load_schedule_request(session, schedule_start=start)
    assert len(req.machines) == 2
    assert len(req.orders) == 1
    # 17:00 - 08:00 = 540 分钟
    assert req.orders[0].due_date == 540
    assert req.orders[0].operations[0].eligible_machines == {"M1": 40, "M2": 50}
    # 换型矩阵透传
    assert req.machines[0].setup_time("A", "B") == 30


def test_load_schedule_request_skips_cancelled_and_inactive(
    session, sample_machines, sample_order
):
    _seed(session, sample_machines, sample_order)
    # M1 停用后, 工序 0 只剩 M2
    m1 = crud.get_machine(session, "M1")
    m1.active = False
    crud.upsert_machine(session, m1)
    req = crud.load_schedule_request(session, schedule_start=datetime(2026, 7, 10))
    assert req.orders[0].operations[0].eligible_machines == {"M2": 50}

    # 订单取消后组装应报缺数据
    o = crud.get_order(session, "J1")
    o.status = "cancelled"
    crud.upsert_order(session, o)
    with pytest.raises(ValueError):
        crud.load_schedule_request(session, schedule_start=datetime(2026, 7, 10))
