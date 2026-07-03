"""贪心启发式排产测试。"""
from __future__ import annotations

from backend.heuristic import greedy_schedule, plan_to_result
from backend.sample_data import sample_request

from validators import assert_schedule_valid


def test_greedy_plan_is_feasible():
    req = sample_request()
    plan = greedy_schedule(req)
    result = plan_to_result(req, plan, 0.0)
    assert result.status == "HEURISTIC"
    assert result.makespan == plan.makespan > 0
    assert_schedule_valid(req, result)


def test_greedy_respects_machine_release():
    req = sample_request()
    release = {m.id: 500 for m in req.machines}
    plan = greedy_schedule(req, machine_release=release)
    assert min(start for (_, start, _, _) in plan.assignment.values()) >= 500


def test_greedy_counts_init_family_setup():
    """机台初始产品族会产生首道工序换型。"""
    req = sample_request()
    # 所有机台初始为 B: 首道 A 族工序应带换型
    plan = greedy_schedule(req, machine_init_family={m.id: "B" for m in req.machines})
    machines = {m.id: m for m in req.machines}
    firsts: dict[str, tuple] = {}
    for op_id, (mid, start, end, setup) in plan.assignment.items():
        if mid not in firsts or start < firsts[mid][1]:
            firsts[mid] = (op_id, start, setup)
    req_ops = {op.id: op for o in req.orders for op in o.operations}
    for mid, (op_id, _, setup) in firsts.items():
        expected = machines[mid].setup_time("B", req_ops[op_id].family)
        assert setup == expected
