"""数据库 CRUD 与排产请求组装。

时间语义: DB 存绝对时间 (datetime), 求解器用相对分钟 (int)。
换算只发生在本模块 (API/DB 边界), 求解器内部不感知绝对时间。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import Machine, ObjectiveWeights, Operation, Order, ScheduleRequest
from .orm import (
    MachineRow,
    OperationMachineRow,
    OperationRow,
    OrderRow,
    SetupTimeRow,
)
from .schemas import MachineDTO, OperationDTO, OrderDTO


def minutes_from(start: datetime, t: datetime) -> int:
    """绝对时间 -> 相对 start 的分钟数 (早于 start 记 0)。"""
    return max(0, int((t - start).total_seconds() // 60))


# ---- 机台 -------------------------------------------------------------------

def _machine_to_dto(row: MachineRow) -> MachineDTO:
    matrix: dict[str, dict[str, int]] = {}
    for st in row.setup_times:
        matrix.setdefault(st.from_family, {})[st.to_family] = st.minutes
    return MachineDTO(
        id=row.id, name=row.name, calendar_id=row.calendar_id,
        active=row.active, setup_times=matrix,
    )


def list_machines(session: Session) -> list[MachineDTO]:
    rows = session.scalars(
        select(MachineRow).options(selectinload(MachineRow.setup_times))
        .order_by(MachineRow.id)
    ).all()
    return [_machine_to_dto(r) for r in rows]


def get_machine(session: Session, machine_id: str) -> MachineDTO | None:
    row = session.get(MachineRow, machine_id)
    return _machine_to_dto(row) if row else None


def upsert_machine(session: Session, dto: MachineDTO) -> MachineDTO:
    row = session.get(MachineRow, dto.id)
    if row is None:
        row = MachineRow(id=dto.id)
        session.add(row)
    row.name = dto.name
    row.calendar_id = dto.calendar_id
    row.active = dto.active
    row.setup_times = [
        SetupTimeRow(from_family=f, to_family=t, minutes=m)
        for f, tos in dto.setup_times.items()
        for t, m in tos.items()
    ]
    session.flush()
    return _machine_to_dto(row)


def set_setup_times(
    session: Session, machine_id: str, matrix: dict[str, dict[str, int]]
) -> MachineDTO | None:
    row = session.get(MachineRow, machine_id)
    if row is None:
        return None
    row.setup_times = [
        SetupTimeRow(from_family=f, to_family=t, minutes=m)
        for f, tos in matrix.items()
        for t, m in tos.items()
    ]
    session.flush()
    return _machine_to_dto(row)


def delete_machine(session: Session, machine_id: str) -> bool:
    row = session.get(MachineRow, machine_id)
    if row is None:
        return False
    used = session.scalars(
        select(OperationMachineRow).where(OperationMachineRow.machine_id == machine_id)
    ).first()
    if used is not None:
        raise ValueError(f"机台 {machine_id} 仍被工艺路线引用, 请先调整相关工序")
    session.delete(row)
    return True


# ---- 订单 -------------------------------------------------------------------

def _order_to_dto(row: OrderRow) -> OrderDTO:
    return OrderDTO(
        id=row.id, name=row.name, due_date=row.due_date, priority=row.priority,
        release_time=row.release_time, status=row.status,
        operations=[
            OperationDTO(
                id=op.id, seq=op.seq, name=op.name, family=op.family,
                machines={m.machine_id: m.duration_min for m in op.machines},
                is_outsourced=op.is_outsourced,
                outsource_lead_min=op.outsource_lead_min,
            )
            for op in row.operations
        ],
    )


def list_orders(session: Session) -> list[OrderDTO]:
    rows = session.scalars(
        select(OrderRow).options(
            selectinload(OrderRow.operations).selectinload(OperationRow.machines)
        ).order_by(OrderRow.due_date)
    ).all()
    return [_order_to_dto(r) for r in rows]


def get_order(session: Session, order_id: str) -> OrderDTO | None:
    row = session.get(OrderRow, order_id)
    return _order_to_dto(row) if row else None


def _check_machine_refs(session: Session, dto: OrderDTO) -> None:
    known = set(session.scalars(select(MachineRow.id)).all())
    for op in dto.operations:
        missing = set(op.machines) - known
        if missing:
            raise ValueError(
                f"工序 seq={op.seq} 引用了不存在的机台: {', '.join(sorted(missing))}"
            )


def upsert_order(session: Session, dto: OrderDTO) -> OrderDTO:
    """整体提交订单 (嵌套工序全量替换)。"""
    _check_machine_refs(session, dto)
    row = session.get(OrderRow, dto.id)
    if row is None:
        row = OrderRow(id=dto.id)
        session.add(row)
    row.name = dto.name
    row.due_date = dto.due_date
    row.priority = dto.priority
    row.release_time = dto.release_time
    row.status = dto.status
    row.operations = [
        OperationRow(
            id=op.id or f"{dto.id}-{op.seq}",
            seq=op.seq, name=op.name, family=op.family,
            is_outsourced=op.is_outsourced,
            outsource_lead_min=op.outsource_lead_min,
            machines=[
                OperationMachineRow(machine_id=mid, duration_min=dur)
                for mid, dur in op.machines.items()
            ],
        )
        for op in dto.operations
    ]
    session.flush()
    return _order_to_dto(row)


def delete_order(session: Session, order_id: str) -> bool:
    row = session.get(OrderRow, order_id)
    if row is None:
        return False
    session.delete(row)
    return True


def clear_all(session: Session) -> None:
    """清空全部业务数据 (Excel replace 导入用)。"""
    for row in session.scalars(select(OrderRow)).all():
        session.delete(row)
    for row in session.scalars(select(MachineRow)).all():
        session.delete(row)
    session.flush()


# ---- 排产请求组装 -----------------------------------------------------------

def load_schedule_request(
    session: Session,
    schedule_start: datetime | None = None,
    weights: ObjectiveWeights | None = None,
    time_limit_seconds: float = 10.0,
) -> ScheduleRequest:
    """从 DB 组装 ScheduleRequest (绝对时间 -> 相对分钟)。

    - 只取 active 机台与非 cancelled 订单;
    - schedule_start 默认取当前时间 (取整到分钟)。
    """
    start = (schedule_start or datetime.now()).replace(second=0, microsecond=0)

    machines = [
        Machine(id=m.id, name=m.name, setup_times=m.setup_times)
        for m in list_machines(session)
        if m.active
    ]
    machine_ids = {m.id for m in machines}

    orders: list[Order] = []
    for o in list_orders(session):
        if o.status == "cancelled":
            continue
        ops = []
        for op in o.operations:
            eligible = {mid: dur for mid, dur in op.machines.items() if mid in machine_ids}
            if not eligible:
                raise ValueError(
                    f"订单 {o.id} 工序 seq={op.seq} 没有可用机台 (机台停用或未配置)"
                )
            ops.append(Operation(
                id=op.id or f"{o.id}-{op.seq}",
                name=op.name, sequence=op.seq, family=op.family,
                eligible_machines=eligible,
            ))
        orders.append(Order(
            id=o.id, name=o.name,
            due_date=minutes_from(start, o.due_date),
            priority=o.priority,
            release_time=minutes_from(start, o.release_time) if o.release_time else 0,
            operations=ops,
        ))

    if not machines or not orders:
        raise ValueError("数据库中缺少机台或订单, 请先导入/录入数据")

    return ScheduleRequest(
        machines=machines,
        orders=orders,
        weights=weights or ObjectiveWeights(),
        time_limit_seconds=time_limit_seconds,
    )
