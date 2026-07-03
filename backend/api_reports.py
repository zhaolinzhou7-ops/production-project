"""报表 API: 交期预警 / KPI / 方案结果 Excel 导出。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from . import excel_io, reports
from .db import get_session
from .reports import DeliveryRiskReport, KpiReport

router = APIRouter(prefix="/api", tags=["reports"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/reports/delivery-risk", response_model=DeliveryRiskReport)
def delivery_risk(scenario_id: int, session: Session = Depends(get_session)):
    report = reports.delivery_risk(session, scenario_id)
    if report is None:
        raise HTTPException(404, f"方案 {scenario_id} 不存在")
    return report


@router.get("/reports/kpi", response_model=KpiReport)
def kpi(scenario_id: int, session: Session = Depends(get_session)):
    report = reports.kpi(session, scenario_id)
    if report is None:
        raise HTTPException(404, f"方案 {scenario_id} 不存在")
    return report


@router.get("/export/scenario/{scenario_id}.xlsx")
def export_scenario(scenario_id: int, session: Session = Depends(get_session)):
    content = excel_io.export_scenario(session, scenario_id)
    if content is None:
        raise HTTPException(404, f"方案 {scenario_id} 不存在")
    return Response(
        content=content,
        media_type=XLSX_MIME,
        headers={
            "Content-Disposition":
                f'attachment; filename="scenario_{scenario_id}.xlsx"'
        },
    )
