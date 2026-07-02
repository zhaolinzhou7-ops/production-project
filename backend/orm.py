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
