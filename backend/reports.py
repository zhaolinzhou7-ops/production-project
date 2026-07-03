"""报表与交期预警: 基于已保存方案计算 KPI 与风险分级。"""
from __future__ import annotations

from datetime import datetime, timedelta

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import scenario as scenario_mod
from .models import OUTSOURCE_MACHINE_ID

# 交期风险黄色阈值: 完工距交期不足 8 小时
RISK_SLACK_MINUTES = 8 * 60


class OrderRisk(BaseModel):
    order_id: str
    order_name: str
    due: datetime
    completion: datetime
    tardiness_min: int
    slack_min: int = Field(..., description="交期富余 (负数=拖期)")
    risk: str = Field(..., description="red=拖期 / yellow=富余不足 / green=安全")


class DeliveryRiskReport(BaseModel):
    scenario_id: int
    scenario_name: str
    orders: list[OrderRisk]
    red: int
    yellow: int
    green: int


class MachineKpi(BaseModel):
    machine_id: str
    busy_min: int
    utilization: float


class KpiReport(BaseModel):
    scenario_id: int
    scenario_name: str
    status: str
    makespan: int
    total_tardiness: int
    total_changeover: int
    order_count: int
    tardy_count: int
    on_time_rate: float = Field(..., description="准交率 0~1")
    machines: list[MachineKpi]


def _to_dt(start: datetime, minutes: int) -> datetime:
    return start + timedelta(minutes=minutes)


def delivery_risk(session: Session, scenario_id: int) -> DeliveryRiskReport | None:
    detail = scenario_mod.get_scenario(session, scenario_id)
    if detail is None:
        return None
    start = detail.schedule_start

    orders: list[OrderRisk] = []
    for o in detail.orders:
        slack = o["due_date"] - o["completion"]
        risk = "red" if o["tardiness"] > 0 else (
            "yellow" if slack < RISK_SLACK_MINUTES else "green"
        )
        orders.append(OrderRisk(
            order_id=o["order_id"], order_name=o["order_name"],
            due=_to_dt(start, o["due_date"]),
            completion=_to_dt(start, o["completion"]),
            tardiness_min=o["tardiness"], slack_min=slack, risk=risk,
        ))
    orders.sort(key=lambda x: x.slack_min)
    return DeliveryRiskReport(
        scenario_id=detail.id, scenario_name=detail.name, orders=orders,
        red=sum(1 for o in orders if o.risk == "red"),
        yellow=sum(1 for o in orders if o.risk == "yellow"),
        green=sum(1 for o in orders if o.risk == "green"),
    )


def kpi(session: Session, scenario_id: int) -> KpiReport | None:
    detail = scenario_mod.get_scenario(session, scenario_id)
    if detail is None:
        return None

    busy: dict[str, int] = {}
    for op in detail.operations:
        if op["machine_id"] == OUTSOURCE_MACHINE_ID:
            continue
        busy[op["machine_id"]] = (
            busy.get(op["machine_id"], 0) + op["duration"] + op["setup"]
        )
    ms = detail.makespan
    machines = [
        MachineKpi(
            machine_id=mid, busy_min=b,
            utilization=round(b / ms, 3) if ms > 0 else 0.0,
        )
        for mid, b in sorted(busy.items())
    ]

    tardy = sum(1 for o in detail.orders if o["tardiness"] > 0)
    n = len(detail.orders)
    return KpiReport(
        scenario_id=detail.id, scenario_name=detail.name, status=detail.status,
        makespan=ms, total_tardiness=detail.total_tardiness,
        total_changeover=detail.total_changeover,
        order_count=n, tardy_count=tardy,
        on_time_rate=round((n - tardy) / n, 3) if n else 1.0,
        machines=machines,
    )
