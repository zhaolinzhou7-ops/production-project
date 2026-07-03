"""SQLAlchemy 2.0 ORM 表定义。

表结构 (M1):
- machines            机台 (calendar_id 预留给班次日历)
- setup_times         机台换型矩阵 (按产品族)
- orders              订单 (交期/释放为绝对时间)
- operations          工序 (外协/资源字段预留, M3 启用)
- operation_machines  工序-合格机台 及加工时长
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class MachineRow(Base):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    calendar_id: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    setup_times: Mapped[list["SetupTimeRow"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan"
    )


class SetupTimeRow(Base):
    __tablename__ = "setup_times"

    machine_id: Mapped[str] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), primary_key=True
    )
    from_family: Mapped[str] = mapped_column(String, primary_key=True)
    to_family: Mapped[str] = mapped_column(String, primary_key=True)
    minutes: Mapped[int] = mapped_column(Integer)

    machine: Mapped[MachineRow] = relationship(back_populates="setup_times")


class OrderRow(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    due_date: Mapped[datetime] = mapped_column(DateTime)
    priority: Mapped[int] = mapped_column(Integer, default=1)
    release_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="normal")  # normal/rush/cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    operations: Mapped[list["OperationRow"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OperationRow.seq",
    )


class OperationRow(Base):
    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String)
    family: Mapped[str] = mapped_column(String)
    # M3 启用: 外协工序 (固定周期, 不占内部机台) 与第二资源需求
    is_outsourced: Mapped[bool] = mapped_column(Boolean, default=False)
    outsource_lead_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String, nullable=True)
    resource_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)

    order: Mapped[OrderRow] = relationship(back_populates="operations")
    machines: Mapped[list["OperationMachineRow"]] = relationship(
        back_populates="operation", cascade="all, delete-orphan"
    )


class CalendarRow(Base):
    __tablename__ = "calendars"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")

    rules: Mapped[list["CalendarRuleRow"]] = relationship(
        back_populates="calendar", cascade="all, delete-orphan"
    )
    exceptions: Mapped[list["CalendarExceptionRow"]] = relationship(
        back_populates="calendar", cascade="all, delete-orphan"
    )


class CalendarRuleRow(Base):
    __tablename__ = "calendar_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    calendar_id: Mapped[str] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE")
    )
    weekday: Mapped[int] = mapped_column(Integer)  # 0=周一 ... 6=周日
    shift_start: Mapped[str] = mapped_column(String)  # "08:00"
    shift_end: Mapped[str] = mapped_column(String)    # "16:00"

    calendar: Mapped[CalendarRow] = relationship(back_populates="rules")


class CalendarExceptionRow(Base):
    __tablename__ = "calendar_exceptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    calendar_id: Mapped[str] = mapped_column(
        ForeignKey("calendars.id", ondelete="CASCADE")
    )
    date: Mapped[str] = mapped_column(String)  # "2026-07-06"
    available: Mapped[bool] = mapped_column(Boolean)  # False=整天停; True=按窗加班
    start: Mapped[str | None] = mapped_column(String, nullable=True)
    end: Mapped[str | None] = mapped_column(String, nullable=True)

    calendar: Mapped[CalendarRow] = relationship(back_populates="exceptions")


class MachineDowntimeRow(Base):
    __tablename__ = "machine_downtimes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    machine_id: Mapped[str] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE")
    )
    start: Mapped[datetime] = mapped_column(DateTime)
    end: Mapped[datetime] = mapped_column(DateTime)
    reason: Mapped[str] = mapped_column(String, default="")


class ResourceRow(Base):
    __tablename__ = "resources"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    capacity: Mapped[int] = mapped_column(Integer, default=1)


class ScenarioRow(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String, default="baseline")  # baseline/simulation
    base_scenario_id: Mapped[int | None] = mapped_column(
        ForeignKey("scenarios.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    schedule_start: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String)
    makespan: Mapped[int] = mapped_column(Integer, default=0)
    total_tardiness: Mapped[int] = mapped_column(Integer, default=0)
    total_changeover: Mapped[int] = mapped_column(Integer, default=0)
    solve_time_seconds: Mapped[float] = mapped_column(default=0.0)

    operations: Mapped[list["ScenarioOperationRow"]] = relationship(
        cascade="all, delete-orphan"
    )
    orders: Mapped[list["ScenarioOrderRow"]] = relationship(
        cascade="all, delete-orphan"
    )


class ScenarioOperationRow(Base):
    __tablename__ = "scenario_operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE")
    )
    operation_id: Mapped[str] = mapped_column(String)
    operation_name: Mapped[str] = mapped_column(String)
    order_id: Mapped[str] = mapped_column(String)
    order_name: Mapped[str] = mapped_column(String)
    machine_id: Mapped[str] = mapped_column(String)
    family: Mapped[str] = mapped_column(String)
    start_min: Mapped[int] = mapped_column(Integer)
    setup_min: Mapped[int] = mapped_column(Integer, default=0)
    duration_min: Mapped[int] = mapped_column(Integer)
    end_min: Mapped[int] = mapped_column(Integer)
    frozen: Mapped[bool] = mapped_column(Boolean, default=False)


class ScenarioOrderRow(Base):
    __tablename__ = "scenario_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[int] = mapped_column(
        ForeignKey("scenarios.id", ondelete="CASCADE")
    )
    order_id: Mapped[str] = mapped_column(String)
    order_name: Mapped[str] = mapped_column(String)
    due_min: Mapped[int] = mapped_column(Integer)
    completion_min: Mapped[int] = mapped_column(Integer)
    tardiness_min: Mapped[int] = mapped_column(Integer)


class OpProgressRow(Base):
    """报工: 工序实际执行状态 (冻结重排的依据)。"""

    __tablename__ = "op_progress"

    operation_id: Mapped[str] = mapped_column(
        ForeignKey("operations.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[str] = mapped_column(String, default="pending")  # pending/started/done
    actual_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    actual_machine_id: Mapped[str | None] = mapped_column(String, nullable=True)


class OperationMachineRow(Base):
    __tablename__ = "operation_machines"

    operation_id: Mapped[str] = mapped_column(
        ForeignKey("operations.id", ondelete="CASCADE"), primary_key=True
    )
    machine_id: Mapped[str] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), primary_key=True
    )
    duration_min: Mapped[int] = mapped_column(Integer)

    operation: Mapped[OperationRow] = relationship(back_populates="machines")
