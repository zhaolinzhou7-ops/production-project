"""基础数据管理 API (机台/订单/Excel 导入导出/从 DB 组装排产请求)。"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from . import crud, excel_io
from .db import get_session
from .models import ObjectiveWeights, ScheduleRequest
from .schemas import ImportReport, MachineDTO, OrderDTO

router = APIRouter(prefix="/api", tags=["data"])


# ---- 机台 -------------------------------------------------------------------

@router.get("/machines", response_model=list[MachineDTO])
def list_machines(session: Session = Depends(get_session)):
    return crud.list_machines(session)


@router.post("/machines", response_model=MachineDTO)
def create_machine(dto: MachineDTO, session: Session = Depends(get_session)):
    if crud.get_machine(session, dto.id) is not None:
        raise HTTPException(409, f"机台 {dto.id} 已存在")
    return crud.upsert_machine(session, dto)


@router.put("/machines/{machine_id}", response_model=MachineDTO)
def update_machine(
    machine_id: str, dto: MachineDTO, session: Session = Depends(get_session)
):
    if dto.id != machine_id:
        raise HTTPException(400, "路径与请求体中的机台ID不一致")
    if crud.get_machine(session, machine_id) is None:
        raise HTTPException(404, f"机台 {machine_id} 不存在")
    return crud.upsert_machine(session, dto)


@router.put("/machines/{machine_id}/setup-times", response_model=MachineDTO)
def update_setup_times(
    machine_id: str,
    matrix: dict[str, dict[str, int]],
    session: Session = Depends(get_session),
):
    dto = crud.set_setup_times(session, machine_id, matrix)
    if dto is None:
        raise HTTPException(404, f"机台 {machine_id} 不存在")
    return dto


@router.delete("/machines/{machine_id}")
def delete_machine(machine_id: str, session: Session = Depends(get_session)):
    try:
        if not crud.delete_machine(session, machine_id):
            raise HTTPException(404, f"机台 {machine_id} 不存在")
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"deleted": machine_id}


# ---- 订单 -------------------------------------------------------------------

@router.get("/orders", response_model=list[OrderDTO])
def list_orders(session: Session = Depends(get_session)):
    return crud.list_orders(session)


@router.post("/orders", response_model=OrderDTO)
def create_order(dto: OrderDTO, session: Session = Depends(get_session)):
    if crud.get_order(session, dto.id) is not None:
        raise HTTPException(409, f"订单 {dto.id} 已存在")
    try:
        return crud.upsert_order(session, dto)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/orders/{order_id}", response_model=OrderDTO)
def get_order(order_id: str, session: Session = Depends(get_session)):
    dto = crud.get_order(session, order_id)
    if dto is None:
        raise HTTPException(404, f"订单 {order_id} 不存在")
    return dto


@router.put("/orders/{order_id}", response_model=OrderDTO)
def update_order(order_id: str, dto: OrderDTO, session: Session = Depends(get_session)):
    if dto.id != order_id:
        raise HTTPException(400, "路径与请求体中的订单ID不一致")
    if crud.get_order(session, order_id) is None:
        raise HTTPException(404, f"订单 {order_id} 不存在")
    try:
        return crud.upsert_order(session, dto)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.delete("/orders/{order_id}")
def delete_order(order_id: str, session: Session = Depends(get_session)):
    if not crud.delete_order(session, order_id):
        raise HTTPException(404, f"订单 {order_id} 不存在")
    return {"deleted": order_id}


# ---- Excel ------------------------------------------------------------------

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/import/template")
def download_template():
    return Response(
        content=excel_io.build_template(),
        media_type=XLSX_MIME,
        headers={"Content-Disposition": 'attachment; filename="aps_template.xlsx"'},
    )


@router.post("/import/excel", response_model=ImportReport)
async def import_excel(
    file: UploadFile,
    mode: str = Query("replace", pattern="^(replace|append)$"),
    session: Session = Depends(get_session),
):
    content = await file.read()
    report = excel_io.import_workbook(session, content, mode=mode)
    if not report.ok:
        # 校验失败: 报告以 200 返回 (前端逐行展示), 但不落库
        session.rollback()
    return report


# ---- 从 DB 组装排产请求 ------------------------------------------------------

@router.get("/data/schedule-request", response_model=ScheduleRequest)
def build_schedule_request(
    schedule_start: datetime | None = None,
    time_limit_seconds: float = Query(10.0, gt=0),
    session: Session = Depends(get_session),
):
    """把库中数据组装成 ScheduleRequest, 前端拿到后调 POST /api/schedule。"""
    try:
        return crud.load_schedule_request(
            session,
            schedule_start=schedule_start,
            weights=ObjectiveWeights(),
            time_limit_seconds=time_limit_seconds,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
