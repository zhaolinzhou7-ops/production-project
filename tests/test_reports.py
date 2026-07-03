"""KPI 报表与交期预警计算测试。"""
from __future__ import annotations

from datetime import datetime

from backend import reports
from backend.models import (
    MachineUtilization,
    OrderResult,
    ScheduledOperation,
    ScheduleResult,
)
from backend.scenario import save_scenario


def _fake_result() -> ScheduleResult:
    """构造已知数值的方案: 2 订单, 1 拖期; 1 机台 + 外协。"""
    ops = [
        ScheduledOperation(
            operation_id="J1-0", operation_name="车", order_id="J1",
            order_name="甲", machine_id="M1", family="A",
            start=0, setup=0, duration=100, end=100,
        ),
        ScheduledOperation(
            operation_id="J1-1", operation_name="热处理", order_id="J1",
            order_name="甲", machine_id="OUTSOURCE", family="A",
            start=100, setup=0, duration=100, end=200,
        ),
        ScheduledOperation(
            operation_id="J2-0", operation_name="车", order_id="J2",
            order_name="乙", machine_id="M1", family="B",
            start=120, setup=20, duration=80, end=200,
        ),
    ]
    orders = [
        OrderResult(order_id="J1", order_name="甲", due_date=150,
                    completion=200, tardiness=50),   # red
        OrderResult(order_id="J2", order_name="乙", due_date=1000,
                    completion=200, tardiness=0),    # green (富余 800)
    ]
    return ScheduleResult(
        status="OPTIMAL", makespan=200, total_tardiness=50, total_changeover=20,
        objective_value=0.0, solve_time_seconds=0.1,
        operations=ops, orders=orders,
        machine_utilization=[MachineUtilization(
            machine_id="M1", machine_name="M1", busy_time=200, utilization=1.0,
        )],
    )


def _saved(session) -> int:
    summary = save_scenario(
        session, name="t", kind="baseline", result=_fake_result(),
        schedule_start=datetime(2026, 7, 6, 8, 0),
    )
    session.commit()
    return summary.id


def test_kpi(session):
    sid = _saved(session)
    kpi = reports.kpi(session, sid)
    assert kpi.order_count == 2
    assert kpi.tardy_count == 1
    assert kpi.on_time_rate == 0.5
    # 外协不计机台利用; M1 = 100 + 80 + 20 换型 = 200 / makespan 200
    assert len(kpi.machines) == 1
    m1 = kpi.machines[0]
    assert m1.busy_min == 200
    assert m1.utilization == 1.0


def test_delivery_risk(session):
    sid = _saved(session)
    report = reports.delivery_risk(session, sid)
    assert (report.red, report.yellow, report.green) == (1, 0, 1)
    by_id = {o.order_id: o for o in report.orders}
    assert by_id["J1"].risk == "red"
    assert by_id["J1"].slack_min == -50
    # 绝对时间换算: 08:00 + 150min = 10:30
    assert by_id["J1"].due == datetime(2026, 7, 6, 10, 30)
    assert by_id["J2"].risk == "green"
    # 富余排序: 最危险在前
    assert report.orders[0].order_id == "J1"


def test_yellow_threshold(session):
    """富余 < 8 小时 -> 黄色。"""
    result = _fake_result()
    result.orders[1] = OrderResult(
        order_id="J2", order_name="乙", due_date=200 + 100,  # 富余 100 < 480
        completion=200, tardiness=0,
    )
    summary = save_scenario(
        session, name="t2", kind="baseline", result=result,
        schedule_start=datetime(2026, 7, 6, 8, 0),
    )
    session.commit()
    report = reports.delivery_risk(session, summary.id)
    assert report.yellow == 1


def test_missing_scenario(session):
    assert reports.kpi(session, 999) is None
    assert reports.delivery_risk(session, 999) is None
