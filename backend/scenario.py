"""排产方案的持久化、读取与对比。"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import crud
from .models import (
    OUTSOURCE_MACHINE_ID,
    FrozenOp,
    ScheduleRequest,
    ScheduleResult,
)
from .orm import (
    OperationRow,
    OpProgressRow,
    ScenarioOperationRow,
    ScenarioOrderRow,
    ScenarioRow,
)


class ScenarioSummary(BaseModel):
    id: int
    name: str
    kind: str
    base_scenario_id: int | None = None
    created_at: datetime
    schedule_start: datetime
    status: str
    makespan: int
    total_tardiness: int
    total_changeover: int
    solve_time_seconds: float


class ScenarioDetail(ScenarioSummary):
    operations: list[dict]
    orders: list[dict]


class OrderDiff(BaseModel):
    order_id: str
    order_name: str
    due_min: int
    completion_a: int | None = None
    completion_b: int | None = None
    tardiness_a: int | None = None
    tardiness_b: int | None = None
    delta_completion: int | None = None


class ScenarioCompare(BaseModel):
    a: ScenarioSummary
    b: ScenarioSummary
    orders: list[OrderDiff]
    moved_operations: int = Field(..., description="机台或时间发生变化的工序数")


def save_scenario(
    session: Session,
    name: str,
    kind: str,
    result: ScheduleResult,
    schedule_start: datetime,
    base_scenario_id: int | None = None,
    frozen_ids: set[str] | None = None,
) -> ScenarioSummary:
    frozen_ids = frozen_ids or set()
    row = ScenarioRow(
        name=name, kind=kind, base_scenario_id=base_scenario_id,
        schedule_start=schedule_start, status=result.status,
        makespan=result.makespan, total_tardiness=result.total_tardiness,
        total_changeover=result.total_changeover,
        solve_time_seconds=result.solve_time_seconds,
    )
    row.operations = [
        ScenarioOperationRow(
            operation_id=op.operation_id, operation_name=op.operation_name,
            order_id=op.order_id, order_name=op.order_name,
            machine_id=op.machine_id, family=op.family,
            start_min=op.start, setup_min=op.setup,
            duration_min=op.duration, end_min=op.end,
            frozen=op.operation_id in frozen_ids,
        )
        for op in result.operations
    ]
    row.orders = [
        ScenarioOrderRow(
            order_id=o.order_id, order_name=o.order_name, due_min=o.due_date,
            completion_min=o.completion, tardiness_min=o.tardiness,
        )
        for o in result.orders
    ]
    session.add(row)
    session.flush()
    return _summary(row)


def _summary(row: ScenarioRow) -> ScenarioSummary:
    return ScenarioSummary(
        id=row.id, name=row.name, kind=row.kind,
        base_scenario_id=row.base_scenario_id,
        created_at=row.created_at, schedule_start=row.schedule_start,
        status=row.status, makespan=row.makespan,
        total_tardiness=row.total_tardiness,
        total_changeover=row.total_changeover,
        solve_time_seconds=row.solve_time_seconds,
    )


def list_scenarios(session: Session) -> list[ScenarioSummary]:
    rows = session.scalars(
        select(ScenarioRow).order_by(ScenarioRow.id.desc())
    ).all()
    return [_summary(r) for r in rows]


def get_scenario(session: Session, scenario_id: int) -> ScenarioDetail | None:
    row = session.get(
        ScenarioRow, scenario_id,
        options=[
            selectinload(ScenarioRow.operations),
            selectinload(ScenarioRow.orders),
        ],
    )
    if row is None:
        return None
    return ScenarioDetail(
        **_summary(row).model_dump(),
        operations=[
            dict(
                operation_id=op.operation_id, operation_name=op.operation_name,
                order_id=op.order_id, order_name=op.order_name,
                machine_id=op.machine_id, family=op.family,
                start=op.start_min, setup=op.setup_min,
                duration=op.duration_min, end=op.end_min, frozen=op.frozen,
            )
            for op in row.operations
        ],
        orders=[
            dict(
                order_id=o.order_id, order_name=o.order_name, due_date=o.due_min,
                completion=o.completion_min, tardiness=o.tardiness_min,
            )
            for o in row.orders
        ],
    )


def delete_scenario(session: Session, scenario_id: int) -> bool:
    row = session.get(ScenarioRow, scenario_id)
    if row is None:
        return False
    session.delete(row)
    return True


def compare_scenarios(
    session: Session, a_id: int, b_id: int
) -> ScenarioCompare | None:
    a = get_scenario(session, a_id)
    b = get_scenario(session, b_id)
    if a is None or b is None:
        return None

    a_orders = {o["order_id"]: o for o in a.orders}
    b_orders = {o["order_id"]: o for o in b.orders}
    diffs: list[OrderDiff] = []
    for oid in sorted(set(a_orders) | set(b_orders)):
        oa, ob = a_orders.get(oid), b_orders.get(oid)
        ref = oa or ob
        d = OrderDiff(
            order_id=oid, order_name=ref["order_name"], due_min=ref["due_date"],
            completion_a=oa["completion"] if oa else None,
            completion_b=ob["completion"] if ob else None,
            tardiness_a=oa["tardiness"] if oa else None,
            tardiness_b=ob["tardiness"] if ob else None,
        )
        if oa and ob:
            d.delta_completion = ob["completion"] - oa["completion"]
        diffs.append(d)

    a_ops = {op["operation_id"]: op for op in a.operations}
    moved = 0
    for op in b.operations:
        prev = a_ops.get(op["operation_id"])
        if prev and (prev["machine_id"] != op["machine_id"]
                     or prev["start"] != op["start"]):
            moved += 1
    return ScenarioCompare(a=_to_summary(a), b=_to_summary(b), orders=diffs,
                           moved_operations=moved)


def _to_summary(detail: ScenarioDetail) -> ScenarioSummary:
    data = detail.model_dump()
    data.pop("operations")
    data.pop("orders")
    return ScenarioSummary(**data)


# ---- 报工 -> 冻结安排 ---------------------------------------------------------

def build_frozen_from_progress(
    session: Session, request: ScheduleRequest
) -> dict[str, FrozenOp]:
    """从 op_progress 报工记录构造冻结安排 (相对分钟)。

    started/done 的工序按实际机台与实际开工冻结; 时长取该机台工艺时长
    (外协取外协周期)。
    """
    if request.schedule_start is None:
        raise ValueError("请求缺少 schedule_start, 无法换算报工时间")
    rows = session.scalars(
        select(OpProgressRow).where(OpProgressRow.state.in_(["started", "done"]))
    ).all()
    if not rows:
        return {}

    op_index = {
        op.id: op for o in request.orders for op in o.operations
    }
    frozen: dict[str, FrozenOp] = {}
    for r in rows:
        op = op_index.get(r.operation_id)
        if op is None:  # 订单被取消等情况, 忽略
            continue
        if r.actual_start is None:
            raise ValueError(f"工序 {r.operation_id} 报工缺少实际开工时间")
        start = crud.minutes_from(request.schedule_start, r.actual_start)
        if op.is_outsourced:
            mid, dur = OUTSOURCE_MACHINE_ID, op.outsource_lead
        else:
            mid = r.actual_machine_id or next(iter(op.eligible_machines))
            dur = op.eligible_machines.get(mid)
            if dur is None:
                raise ValueError(
                    f"工序 {r.operation_id} 报工机台 {mid} 不在其工艺路线中"
                )
        frozen[r.operation_id] = FrozenOp(
            op_id=r.operation_id, machine_id=mid, start=start, end=start + dur,
        )
    return frozen


def set_progress(
    session: Session,
    operation_id: str,
    state: str,
    actual_start: datetime | None,
    actual_machine_id: str | None,
) -> None:
    if state not in ("pending", "started", "done"):
        raise ValueError(f"未知报工状态: {state}")
    if session.get(OperationRow, operation_id) is None:
        raise ValueError(f"工序 {operation_id} 不存在")
    row = session.get(OpProgressRow, operation_id)
    if row is None:
        row = OpProgressRow(operation_id=operation_id)
        session.add(row)
    row.state = state
    row.actual_start = actual_start
    row.actual_machine_id = actual_machine_id
    session.flush()
