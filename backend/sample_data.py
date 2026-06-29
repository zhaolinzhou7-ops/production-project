"""演示用样例数据: 一个带换型时间的小型柔性作业车间。

3 台机台, 4 个订单, 每个订单 2~3 道工序, 涉及两个产品族 A / B。
机台之间换型时间不同, 体现 "减少换型" 与 "设备利用率" 的权衡。
"""
from __future__ import annotations

from .models import Machine, Operation, Order, ScheduleRequest


def _setup_matrix(ab: int, ba: int) -> dict[str, dict[str, int]]:
    """构造产品族 A<->B 的换型矩阵。"""
    return {"A": {"A": 0, "B": ab}, "B": {"A": ba, "B": 0}}


def sample_request() -> ScheduleRequest:
    machines = [
        Machine(id="M1", name="CNC 车床", setup_times=_setup_matrix(30, 20)),
        Machine(id="M2", name="加工中心", setup_times=_setup_matrix(15, 15)),
        Machine(id="M3", name="磨床", setup_times=_setup_matrix(40, 25)),
    ]

    orders = [
        Order(
            id="J1",
            name="轴承座-A",
            due_date=300,
            priority=3,
            operations=[
                Operation(id="J1-0", name="粗车", sequence=0, family="A",
                          eligible_machines={"M1": 40, "M2": 50}),
                Operation(id="J1-1", name="精铣", sequence=1, family="A",
                          eligible_machines={"M2": 35}),
                Operation(id="J1-2", name="磨削", sequence=2, family="A",
                          eligible_machines={"M3": 30}),
            ],
        ),
        Order(
            id="J2",
            name="法兰盘-B",
            due_date=260,
            priority=2,
            operations=[
                Operation(id="J2-0", name="粗车", sequence=0, family="B",
                          eligible_machines={"M1": 30, "M2": 40}),
                Operation(id="J2-1", name="钻孔", sequence=1, family="B",
                          eligible_machines={"M2": 25, "M3": 35}),
            ],
        ),
        Order(
            id="J3",
            name="齿轮轴-A",
            due_date=400,
            priority=1,
            operations=[
                Operation(id="J3-0", name="粗车", sequence=0, family="A",
                          eligible_machines={"M1": 50}),
                Operation(id="J3-1", name="精铣", sequence=1, family="A",
                          eligible_machines={"M2": 45}),
                Operation(id="J3-2", name="磨削", sequence=2, family="A",
                          eligible_machines={"M3": 40}),
            ],
        ),
        Order(
            id="J4",
            name="端盖-B",
            due_date=220,
            priority=3,
            release_time=20,
            operations=[
                Operation(id="J4-0", name="铣面", sequence=0, family="B",
                          eligible_machines={"M2": 30, "M1": 35}),
                Operation(id="J4-1", name="磨削", sequence=1, family="B",
                          eligible_machines={"M3": 28}),
            ],
        ),
    ]

    return ScheduleRequest(machines=machines, orders=orders)
