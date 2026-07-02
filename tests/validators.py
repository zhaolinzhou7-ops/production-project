"""排产结果通用可行性校验器 (各阶段测试复用)。"""
from __future__ import annotations

from backend.models import ScheduleRequest, ScheduleResult


def assert_schedule_valid(req: ScheduleRequest, result: ScheduleResult) -> None:
    """校验: 全部工序被安排 / 资格机台 / 订单顺序 / 机台不重叠含换型。"""
    total_ops = sum(len(o.operations) for o in req.orders)
    assert len(result.operations) == total_ops, "存在未安排的工序"

    by_id = {op.operation_id: op for op in result.operations}
    machines = {m.id: m for m in req.machines}

    for order in req.orders:
        for op in order.operations:
            sop = by_id[op.id]
            assert sop.machine_id in op.eligible_machines, (
                f"{op.id} 排到了非合格机台 {sop.machine_id}"
            )
            assert sop.duration == op.eligible_machines[sop.machine_id]
            assert sop.start >= order.release_time
        ops = order.operations
        for i in range(1, len(ops)):
            assert by_id[ops[i].id].start >= by_id[ops[i - 1].id].end, (
                f"{ops[i].id} 早于前序完工"
            )

    by_machine: dict[str, list] = {}
    for sop in result.operations:
        by_machine.setdefault(sop.machine_id, []).append(sop)
    for mid, seq in by_machine.items():
        seq.sort(key=lambda x: x.start)
        m = machines[mid]
        for i in range(1, len(seq)):
            prev, cur = seq[i - 1], seq[i]
            need = m.setup_time(prev.family, cur.family)
            assert cur.start >= prev.end + need, (
                f"机台 {mid}: {cur.operation_id} 与 {prev.operation_id} "
                f"间隔不足换型时间 {need}"
            )
