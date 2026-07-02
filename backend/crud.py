"""数据库 CRUD 与排产请求组装。

时间语义: DB 存绝对时间 (datetime), 求解器用相对分钟 (int)。
换算只发生在本模块 (API/DB 边界), 求解器内部不感知绝对时间。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .calendar_utils import (
    CalendarException,
    ShiftRule,
    WorkCalendar,
    expand_unavailable,
    max_contiguous_available,
    merge_windows,
)
from .models import (
    Machine,
    ObjectiveWeights,
    Operation,
    Order,
    Resource,
    ScheduleRequest,
    TimeWindow,
)
from .orm import (
    CalendarExceptionRow,
    CalendarRow,
    CalendarRuleRow,
    MachineDowntimeRow,
    MachineRow,
    OperationMachineRow,
    OperationRow,
    OrderRow,
    ResourceRow,
    SetupTimeRow,
)
from .schemas import (
    CalendarDTO,
    CalendarExceptionDTO,
    DowntimeDTO,
    MachineDTO,
    OperationDTO,
    OrderDTO,
    ResourceDTO,
    ShiftRuleDTO,
)


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
    if dto.calendar_id and session.get(CalendarRow, dto.calendar_id) is None:
        raise ValueError(f"日历 {dto.calendar_id} 不存在")
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
                resource_id=op.resource_id,
                resource_qty=op.resource_qty or 1,
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
            resource_id=op.resource_id,
            resource_qty=op.resource_qty,
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
    for row in session.scalars(select(CalendarRow)).all():
        session.delete(row)
    for row in session.scalars(select(ResourceRow)).all():
        session.delete(row)
    session.flush()


# ---- 日历 -------------------------------------------------------------------

def _calendar_to_dto(row: CalendarRow) -> CalendarDTO:
    return CalendarDTO(
        id=row.id, name=row.name,
        rules=[
            ShiftRuleDTO(weekday=r.weekday, start=r.shift_start, end=r.shift_end)
            for r in row.rules
        ],
        exceptions=[
            CalendarExceptionDTO(
                date=e.date, available=e.available, start=e.start, end=e.end
            )
            for e in row.exceptions
        ],
    )


def list_calendars(session: Session) -> list[CalendarDTO]:
    rows = session.scalars(
        select(CalendarRow)
        .options(selectinload(CalendarRow.rules), selectinload(CalendarRow.exceptions))
        .order_by(CalendarRow.id)
    ).all()
    return [_calendar_to_dto(r) for r in rows]


def get_calendar(session: Session, calendar_id: str) -> CalendarDTO | None:
    row = session.get(CalendarRow, calendar_id)
    return _calendar_to_dto(row) if row else None


def upsert_calendar(session: Session, dto: CalendarDTO) -> CalendarDTO:
    row = session.get(CalendarRow, dto.id)
    if row is None:
        row = CalendarRow(id=dto.id)
        session.add(row)
    row.name = dto.name
    row.rules = [
        CalendarRuleRow(weekday=r.weekday, shift_start=r.start, shift_end=r.end)
        for r in dto.rules
    ]
    row.exceptions = [
        CalendarExceptionRow(
            date=e.date, available=e.available, start=e.start, end=e.end
        )
        for e in dto.exceptions
    ]
    session.flush()
    return _calendar_to_dto(row)


def delete_calendar(session: Session, calendar_id: str) -> bool:
    row = session.get(CalendarRow, calendar_id)
    if row is None:
        return False
    used = session.scalars(
        select(MachineRow).where(MachineRow.calendar_id == calendar_id)
    ).first()
    if used is not None:
        raise ValueError(f"日历 {calendar_id} 仍被机台 {used.id} 引用")
    session.delete(row)
    return True


# ---- 停机窗 -----------------------------------------------------------------

def list_downtimes(session: Session, machine_id: str) -> list[DowntimeDTO]:
    rows = session.scalars(
        select(MachineDowntimeRow)
        .where(MachineDowntimeRow.machine_id == machine_id)
        .order_by(MachineDowntimeRow.start)
    ).all()
    return [DowntimeDTO(start=r.start, end=r.end, reason=r.reason) for r in rows]


def set_downtimes(
    session: Session, machine_id: str, items: list[DowntimeDTO]
) -> list[DowntimeDTO]:
    if session.get(MachineRow, machine_id) is None:
        raise ValueError(f"机台 {machine_id} 不存在")
    for r in session.scalars(
        select(MachineDowntimeRow).where(MachineDowntimeRow.machine_id == machine_id)
    ).all():
        session.delete(r)
    for d in items:
        session.add(MachineDowntimeRow(
            machine_id=machine_id, start=d.start, end=d.end, reason=d.reason,
        ))
    session.flush()
    return list_downtimes(session, machine_id)


# ---- 资源 -------------------------------------------------------------------

def list_resources(session: Session) -> list[ResourceDTO]:
    rows = session.scalars(select(ResourceRow).order_by(ResourceRow.id)).all()
    return [ResourceDTO(id=r.id, name=r.name, capacity=r.capacity) for r in rows]


def upsert_resource(session: Session, dto: ResourceDTO) -> ResourceDTO:
    row = session.get(ResourceRow, dto.id)
    if row is None:
        row = ResourceRow(id=dto.id)
        session.add(row)
    row.name = dto.name
    row.capacity = dto.capacity
    session.flush()
    return dto


def delete_resource(session: Session, resource_id: str) -> bool:
    row = session.get(ResourceRow, resource_id)
    if row is None:
        return False
    used = session.scalars(
        select(OperationRow).where(OperationRow.resource_id == resource_id)
    ).first()
    if used is not None:
        raise ValueError(f"资源 {resource_id} 仍被工序 {used.id} 引用")
    session.delete(row)
    return True


# ---- 排产请求组装 -----------------------------------------------------------

def _machine_windows(
    session: Session,
    machine: MachineDTO,
    start: datetime,
    horizon_minutes: int,
) -> list[TimeWindow]:
    """机台不可用窗 = 班次日历展开 + 停机记录 (合并, 相对分钟)。"""
    windows: list[TimeWindow] = []
    if machine.calendar_id:
        dto = get_calendar(session, machine.calendar_id)
        if dto is None:
            raise ValueError(f"机台 {machine.id} 引用了不存在的日历 {machine.calendar_id}")
        cal = WorkCalendar(
            id=dto.id, name=dto.name,
            rules=[ShiftRule(r.weekday, r.start, r.end) for r in dto.rules],
            exceptions=[
                CalendarException(
                    day=datetime.strptime(e.date, "%Y-%m-%d").date(),
                    available=e.available, start=e.start, end=e.end,
                )
                for e in dto.exceptions
            ],
        )
        windows.extend(expand_unavailable(cal, start, horizon_minutes))
    for d in list_downtimes(session, machine.id):
        s = minutes_from(start, d.start)
        e = minutes_from(start, d.end)
        if e > s:
            windows.append(TimeWindow(start=s, end=e))
    return merge_windows(windows)


def load_schedule_request(
    session: Session,
    schedule_start: datetime | None = None,
    weights: ObjectiveWeights | None = None,
    time_limit_seconds: float = 10.0,
    calendar_days: int = 60,
) -> ScheduleRequest:
    """从 DB 组装 ScheduleRequest (绝对时间 -> 相对分钟)。

    - 只取 active 机台与非 cancelled 订单;
    - schedule_start 默认取当前时间 (取整到分钟);
    - 班次日历/停机在 [start, start + calendar_days天) 内展开为不可用窗;
    - 工序时长超过某机台最长连续可用段时, 剔除该机台; 全部被剔除则报错。
    """
    start = (schedule_start or datetime.now()).replace(second=0, microsecond=0)
    horizon_minutes = calendar_days * 24 * 60

    machines: list[Machine] = []
    for m in list_machines(session):
        if not m.active:
            continue
        machines.append(Machine(
            id=m.id, name=m.name, setup_times=m.setup_times,
            downtime_windows=_machine_windows(session, m, start, horizon_minutes),
        ))
    machine_ids = {m.id for m in machines}
    max_avail = {
        m.id: max_contiguous_available(m.downtime_windows, horizon_minutes)
        for m in machines
    }

    orders: list[Order] = []
    for o in list_orders(session):
        if o.status == "cancelled":
            continue
        ops = []
        for op in o.operations:
            if op.is_outsourced:
                ops.append(Operation(
                    id=op.id or f"{o.id}-{op.seq}",
                    name=op.name, sequence=op.seq, family=op.family,
                    is_outsourced=True, outsource_lead=op.outsource_lead_min,
                    resource_id=op.resource_id, resource_qty=op.resource_qty,
                ))
                continue
            eligible = {
                mid: dur for mid, dur in op.machines.items()
                if mid in machine_ids and dur <= max_avail[mid]
            }
            if not eligible:
                raise ValueError(
                    f"订单 {o.id} 工序 seq={op.seq} 没有可用机台 "
                    f"(机台停用/未配置, 或加工时长超过班次日历的最长连续可用段, "
                    f"请拆分工序或将机台设为 24h 连续)"
                )
            ops.append(Operation(
                id=op.id or f"{o.id}-{op.seq}",
                name=op.name, sequence=op.seq, family=op.family,
                eligible_machines=eligible,
                resource_id=op.resource_id, resource_qty=op.resource_qty,
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
        resources=[
            Resource(id=r.id, name=r.name, capacity=r.capacity)
            for r in list_resources(session)
        ],
        schedule_start=start,
    )
