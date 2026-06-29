"""排产引擎的基本正确性测试。"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.models import (  # noqa: E402
    Machine,
    ObjectiveWeights,
    Operation,
    Order,
    ScheduleRequest,
)
from backend.sample_data import sample_request  # noqa: E402
from backend.scheduler import solve  # noqa: E402


def test_sample_is_feasible():
    result = solve(sample_request())
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.makespan > 0
    # 每道工序都被安排
    total_ops = sum(len(o.operations) for o in sample_request().orders)
    assert len(result.operations) == total_ops


def test_precedence_respected():
    """同一订单内, 后序工序开工不早于前序完工。"""
    req = sample_request()
    result = solve(req)
    by_id = {op.operation_id: op for op in result.operations}
    for order in req.orders:
        ops = order.operations
        for i in range(1, len(ops)):
            prev = by_id[ops[i - 1].id]
            cur = by_id[ops[i].id]
            assert cur.start >= prev.end, f"{ops[i].id} 早于前序 {ops[i-1].id}"


def test_no_machine_overlap():
    """同一机台上工序 (含换型) 不重叠。"""
    result = solve(sample_request())
    by_machine: dict[str, list] = {}
    for op in result.operations:
        by_machine.setdefault(op.machine_id, []).append(op)
    for mid, ops in by_machine.items():
        ops.sort(key=lambda x: x.start)
        for i in range(1, len(ops)):
            # 上一道完工 + 本道换型 <= 本道开工
            assert ops[i].start - ops[i].setup >= ops[i - 1].end - 1, (
                f"机台 {mid} 上 {ops[i].operation_id} 与前一道重叠"
            )


def test_eligible_machine_only():
    """工序只能排到其合格机台上。"""
    req = sample_request()
    result = solve(req)
    op_eligible = {}
    for order in req.orders:
        for op in order.operations:
            op_eligible[op.id] = set(op.eligible_machines.keys())
    for sop in result.operations:
        assert sop.machine_id in op_eligible[sop.operation_id]


def test_tardiness_weight_reduces_tardiness():
    """提高拖期权重后, 加权拖期不应变得更糟。"""
    req_low = sample_request()
    req_low.weights = ObjectiveWeights(makespan=1, tardiness=0, changeover=0, idle=0)
    req_low.time_limit_seconds = 8

    req_high = sample_request()
    req_high.weights = ObjectiveWeights(makespan=1, tardiness=50, changeover=0, idle=0)
    req_high.time_limit_seconds = 8

    r_low = solve(req_low)
    r_high = solve(req_high)
    assert r_high.total_tardiness <= r_low.total_tardiness


def test_single_order_single_machine():
    """最小用例: 1 订单 1 工序 1 机台。"""
    req = ScheduleRequest(
        machines=[Machine(id="M1", name="M1")],
        orders=[
            Order(
                id="J1", name="x", due_date=100,
                operations=[
                    Operation(id="J1-0", name="op", sequence=0, family="A",
                              eligible_machines={"M1": 30}),
                ],
            )
        ],
        time_limit_seconds=5,
    )
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.makespan == 30
    assert result.operations[0].start == 0
    assert result.operations[0].end == 30
