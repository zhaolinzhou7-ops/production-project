"""数据管理 API 的传输模型 (DTO)。

与 models.py 的区别: 这里的交期/释放时间是**绝对时间** (datetime),
排产时由 crud.load_schedule_request 换算为相对分钟喂给求解器。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

ORDER_STATUSES = ("normal", "rush", "cancelled")


class MachineDTO(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    calendar_id: str | None = None
    active: bool = True
    # setup_times[from_family][to_family] = 分钟
    setup_times: dict[str, dict[str, int]] = Field(default_factory=dict)


class OperationDTO(BaseModel):
    id: str = ""  # 留空时自动生成 "<订单ID>-<工序号>"
    seq: int = Field(..., ge=0, description="订单内工序号, 决定先后")
    name: str = Field(..., min_length=1)
    family: str = Field(..., min_length=1, description="产品族, 用于换型")
    machines: dict[str, int] = Field(
        default_factory=dict, description="合格机台 -> 加工时长(分钟)"
    )
    is_outsourced: bool = False
    outsource_lead_min: int | None = None

    @field_validator("machines")
    @classmethod
    def _positive_durations(cls, v: dict[str, int]) -> dict[str, int]:
        for mid, dur in v.items():
            if dur <= 0:
                raise ValueError(f"机台 {mid} 的加工时长必须为正")
        return v


class OrderDTO(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    due_date: datetime
    priority: int = Field(default=1, ge=1)
    release_time: datetime | None = None
    status: str = "normal"
    operations: list[OperationDTO] = Field(..., min_length=1)

    @field_validator("status")
    @classmethod
    def _known_status(cls, v: str) -> str:
        if v not in ORDER_STATUSES:
            raise ValueError(f"未知订单状态: {v} (可选: {', '.join(ORDER_STATUSES)})")
        return v

    @field_validator("operations")
    @classmethod
    def _valid_ops(cls, v: list[OperationDTO]) -> list[OperationDTO]:
        seqs = [op.seq for op in v]
        if len(set(seqs)) != len(seqs):
            raise ValueError("同一订单内工序号 (seq) 不能重复")
        for op in v:
            if not op.is_outsourced and not op.machines:
                raise ValueError(f"工序 seq={op.seq} 至少要有一台合格机台")
            if op.is_outsourced and not op.outsource_lead_min:
                raise ValueError(f"外协工序 seq={op.seq} 必须填写外协周期(分钟)")
        return sorted(v, key=lambda op: op.seq)


class ImportIssue(BaseModel):
    """Excel 导入的单条错误 (定位到 sheet 与行号)。"""

    sheet: str
    row: int
    message: str


class ImportReport(BaseModel):
    ok: bool
    mode: str
    machines: int = 0
    orders: int = 0
    operations: int = 0
    errors: list[ImportIssue] = Field(default_factory=list)
