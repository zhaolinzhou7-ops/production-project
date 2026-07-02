"""急单插入模拟与方案对比测试 (走 API 全链路)。"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from backend.db import create_db_engine, get_session
from backend.main import app

MACHINE = {"id": "M1", "name": "车床", "setup_times": {}}


def _order(oid: str, due: str, priority: int = 1, status: str = "normal") -> dict:
    return {
        "id": oid, "name": f"件{oid}", "due_date": due, "priority": priority,
        "status": status,
        "operations": [
            {"seq": 0, "name": "车", "family": "A", "machines": {"M1": 120}},
        ],
    }


@pytest.fixture()
def client():
    engine = create_db_engine("sqlite:///:memory:")
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        s = factory()
        try:
            yield s
            s.commit()
        except Exception:
            s.rollback()
            raise
        finally:
            s.close()

    app.dependency_overrides[get_session] = override
    # 后台线程 (open_session) 也要用同一个内存库
    import backend.api_scenario as api_scenario
    orig = api_scenario.open_session
    api_scenario.open_session = lambda: factory()
    yield TestClient(app)
    api_scenario.open_session = orig
    app.dependency_overrides.clear()
    engine.dispose()


def _solve_scenario(client, name, **extra) -> int:
    body = {
        "name": name, "time_limit_seconds": 6,
        "schedule_start": "2026-07-06T08:00:00", **extra,
    }
    res = client.post("/api/scenarios/solve?sync=true", json=body)
    assert res.status_code == 200, res.text
    run = res.json()
    assert run["status"] == "done", run
    return run["scenario_id"]


def test_rush_order_diff(client):
    client.post("/api/machines", json=MACHINE)
    client.post("/api/orders", json=_order("J1", "2026-07-06T12:00:00"))
    client.post("/api/orders", json=_order("J2", "2026-07-06T14:00:00"))

    base_id = _solve_scenario(client, "基准")

    # 插入高优先级急单 (交期最早)
    client.post("/api/orders",
                json=_order("R1", "2026-07-06T10:30:00", priority=9, status="rush"))
    sim_id = _solve_scenario(client, "急单模拟", kind="simulation",
                             base_scenario_id=base_id)

    res = client.get(f"/api/scenarios/compare?a={base_id}&b={sim_id}")
    assert res.status_code == 200, res.text
    cmp = res.json()

    orders = {o["order_id"]: o for o in cmp["orders"]}
    # 急单只在新方案中
    assert orders["R1"]["completion_a"] is None
    assert orders["R1"]["completion_b"] is not None
    # 单机台 120min*3: 有订单被急单挤后 (总完工推迟)
    assert cmp["b"]["makespan"] > cmp["a"]["makespan"]
    delayed = [
        o for o in cmp["orders"]
        if o["delta_completion"] is not None and o["delta_completion"] > 0
    ]
    assert delayed, "应有订单因急单插入而推迟"


def test_scenario_crud_and_progress(client):
    client.post("/api/machines", json=MACHINE)
    client.post("/api/orders", json=_order("J1", "2026-07-06T12:00:00"))
    sid = _solve_scenario(client, "基准")

    # 列表与详情
    assert any(s["id"] == sid for s in client.get("/api/scenarios").json())
    detail = client.get(f"/api/scenarios/{sid}").json()
    assert len(detail["operations"]) == 1

    # 报工 -> 冻结重排
    res = client.post("/api/operations/J1-0/progress", json={
        "state": "started", "actual_start": "2026-07-06T08:30:00",
        "actual_machine_id": "M1",
    })
    assert res.status_code == 200
    sim = client.post("/api/scenarios/solve?sync=true", json={
        "name": "冻结重排", "kind": "simulation", "time_limit_seconds": 6,
        "schedule_start": "2026-07-06T08:00:00", "freeze_progress": True,
    })
    run = sim.json()
    assert run["status"] == "done", run
    frozen_detail = client.get(f"/api/scenarios/{run['scenario_id']}").json()
    op = frozen_detail["operations"][0]
    assert op["frozen"] is True
    assert op["start"] == 30  # 08:30 开工 = 相对 30 分钟

    # 删除
    assert client.delete(f"/api/scenarios/{sid}").status_code == 200
    assert client.get(f"/api/scenarios/{sid}").status_code == 404


def test_conflict_reported_via_api(client):
    client.post("/api/machines", json=MACHINE)
    client.post("/api/orders", json=_order("J1", "2026-07-06T12:00:00"))
    client.post("/api/operations/J1-0/progress", json={
        "state": "started", "actual_start": "2026-07-06T08:00:00",
        "actual_machine_id": "M1",
    })
    # 新停机窗覆盖已开工工序
    res = client.post("/api/scenarios/solve?sync=true", json={
        "name": "停机冲突", "kind": "simulation", "time_limit_seconds": 6,
        "schedule_start": "2026-07-06T08:00:00", "freeze_progress": True,
        "extra_downtimes": [{
            "machine_id": "M1",
            "start": "2026-07-06T08:30:00", "end": "2026-07-06T09:00:00",
        }],
    })
    run = res.json()
    assert run["status"] == "conflict", run
    assert run["conflicts"][0]["kind"] == "downtime_overlap"
