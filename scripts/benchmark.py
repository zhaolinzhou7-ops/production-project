"""排产引擎规模基准: 不同规模下的求解状态/耗时/目标值。

用法: python3 scripts/benchmark.py [时限秒=20]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tests"))

from backend.models import SolverParams  # noqa: E402
from backend.scheduler import solve  # noqa: E402
from test_scale import random_request  # noqa: E402


def run(name: str, n_orders: int, n_machines: int, limit: float, **params) -> None:
    req = random_request(n_orders, n_machines)
    req.time_limit_seconds = limit
    if params:
        req.solver_params = SolverParams(**params)
    r = solve(req)
    print(
        f"{name:<28} status={r.status:<20} 耗时={r.solve_time_seconds:>7.2f}s "
        f"makespan={r.makespan:>6} 拖期={r.total_tardiness:>7} 换型={r.total_changeover:>5}"
    )


if __name__ == "__main__":
    limit = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
    print(f"求解时限: {limit}s / 规模用例\n")
    run("小型 10x5", 10, 5, limit)
    run("中型 50x15", 50, 15, limit)
    run("大型 100x20 (整体)", 100, 20, limit)
    run("大型 100x20 (滚动分解)", 100, 20, limit, decompose_threshold=200, batch_size=25)
    run("超大 300x30 (滚动分解)", 300, 30, limit * 2, decompose_threshold=200, batch_size=30)
