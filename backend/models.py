"""离散制造排产系统的领域数据模型 (Domain models).

建模对象 (柔性作业车间 FJSP):
- Machine     机台/设备
- Operation   工序 (订单内的一道加工步骤)
- Order       订单 (由多道有先后顺序的工序组成)
- 顺序相关换型时间通过产品族 (product family) 在机台上的转移矩阵描述。
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class Machine(BaseModel):
    """一台可执行工序的设备。"""

    id: str = Field(..., description="机台唯一标识, 如 M1")
    name: str = Field(..., description="机台名称")
    # 换型时间矩阵: setup_times[from_family][to_family] = 分钟
    # 在该机台上, 由生产 from_family 切换到 to_family 所需的换型时间。
    setup_times: dict[str, dict[str, int]] = Field(
        default_factory=dict,
        description="顺序相关换型时间矩阵 (按产品族), 单位: 分钟",
    )

    def setup_time(self, from_family: Optional[str], to_family: str) -> int:
        """返回从某产品族切换到另一产品族在本机台的换型时间。"""
        if from_family is None:  # 该机台上的首个工序, 无换型
            return 0
        if from_family == to_family:
            return 0
        return self.setup_times.get(from_family, {}).get(to_family, 0)


class Operation(BaseModel):
    """订单内的一道工序。

    可在多台合格机台之一上加工 (柔性), 不同机台耗时可不同。
    """

    id: str = Field(..., description="工序唯一标识, 如 O1-2")
    name: str = Field(..., description="工序名称, 如 '车削'")
    sequence: int = Field(..., description="在所属订单内的工序序号 (从 0 开始, 决定先后)")
    family: str = Field(..., description="产品族, 用于计算换型时间")
    # 合格机台 -> 在该机台上的加工时长(分钟)
    eligible_machines: dict[str, int] = Field(
        ..., description="可执行本工序的机台及对应加工时长(分钟)"
    )

    @field_validator("eligible_machines")
    @classmethod
    def _non_empty_machines(cls, v: dict[str, int]) -> dict[str, int]:
        if not v:
            raise ValueError("每道工序至少要有一台合格机台")
        return v


class Order(BaseModel):
    """生产订单, 由一组有先后顺序的工序组成。"""

    id: str = Field(..., description="订单唯一标识, 如 J1")
    name: str = Field(..., description="订单/产品名称")
    due_date: int = Field(..., description="交期 (距 t=0 的分钟数)")
    priority: int = Field(default=1, ge=1, description="优先级权重, 越大越重要")
    release_time: int = Field(default=0, ge=0, description="最早可开工时间(分钟)")
    operations: list[Operation] = Field(..., description="工序列表")

    @field_validator("operations")
    @classmethod
    def _sorted_unique_sequence(cls, v: list[Operation]) -> list[Operation]:
        if not v:
            raise ValueError("订单至少要有一道工序")
        return sorted(v, key=lambda op: op.sequence)


class ObjectiveWeights(BaseModel):
    """多目标加权系数。求解器最小化各项的加权和。"""

    makespan: float = Field(default=1.0, ge=0, description="最短完工时间权重")
    tardiness: float = Field(default=5.0, ge=0, description="拖期 (按时交付) 权重")
    changeover: float = Field(default=1.0, ge=0, description="换型时间总量权重")
    idle: float = Field(default=0.5, ge=0, description="设备空闲 (利用率) 权重")


class ScheduleRequest(BaseModel):
    """一次排产请求。"""

    machines: list[Machine]
    orders: list[Order]
    weights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)
    time_limit_seconds: float = Field(
        default=10.0, gt=0, description="求解时间上限(秒)"
    )


class ScheduledOperation(BaseModel):
    """排产结果中的单条工序安排。"""

    operation_id: str
    operation_name: str
    order_id: str
    order_name: str
    machine_id: str
    family: str
    start: int = Field(..., description="开工时刻(分钟)")
    setup: int = Field(..., description="开工前换型时长(分钟)")
    duration: int = Field(..., description="加工时长(分钟)")
    end: int = Field(..., description="完工时刻(分钟)")


class OrderResult(BaseModel):
    """单个订单的完工与拖期情况。"""

    order_id: str
    order_name: str
    due_date: int
    completion: int
    tardiness: int


class MachineUtilization(BaseModel):
    machine_id: str
    machine_name: str
    busy_time: int = Field(..., description="加工+换型占用时间")
    utilization: float = Field(..., description="占用时间 / makespan")


class ScheduleResult(BaseModel):
    """排产结果。"""

    status: str = Field(..., description="求解状态: OPTIMAL/FEASIBLE/INFEASIBLE 等")
    makespan: int = Field(..., description="总完工时间(分钟)")
    total_tardiness: int = Field(..., description="加权拖期总量")
    total_changeover: int = Field(..., description="换型时间总量(分钟)")
    objective_value: float = Field(..., description="目标函数值")
    solve_time_seconds: float
    operations: list[ScheduledOperation]
    orders: list[OrderResult]
    machine_utilization: list[MachineUtilization]
