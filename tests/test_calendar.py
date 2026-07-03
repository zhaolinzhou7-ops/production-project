"""班次日历展开与停机窗约束测试。"""
from __future__ import annotations

from datetime import date, datetime

from backend.calendar_utils import (
    CalendarException,
    ShiftRule,
    WorkCalendar,
    expand_unavailable,
    max_contiguous_available,
    merge_windows,
)
from backend.models import (
    Machine,
    ObjectiveWeights,
    Operation,
    Order,
    ScheduleRequest,
    TimeWindow,
)
from backend.scheduler import solve

from validators import assert_schedule_valid


def two_shift_calendar() -> WorkCalendar:
    """周一~周五 08:00-16:00 + 16:00-22:00 两班, 周末休。"""
    rules = []
    for wd in range(5):
        rules.append(ShiftRule(weekday=wd, start="08:00", end="16:00"))
        rules.append(ShiftRule(weekday=wd, start="16:00", end="22:00"))
    return WorkCalendar(id="C1", name="两班制", rules=rules)


def test_expand_two_shift_day():
    # 2026-07-06 是周一; 从 00:00 起展开一天
    start = datetime(2026, 7, 6, 0, 0)
    windows = expand_unavailable(two_shift_calendar(), start, 24 * 60)
    # 不可用: 00:00-08:00 与 22:00-24:00; 连班 08-16/16-22 合并为可用
    assert [(w.start, w.end) for w in windows] == [(0, 480), (1320, 1440)]


def test_expand_weekend_merges_across_days():
    # 周五 12:00 起展开 72h: 周五 22:00 -> 周一 08:00 应合并为一个大窗
    start = datetime(2026, 7, 10, 12, 0)  # 周五
    windows = expand_unavailable(two_shift_calendar(), start, 72 * 60)
    # 周五 22:00 = 相对 600 分钟; 周一 08:00 = 相对 12+48+8=68h = 4080 分钟
    assert (600, 4080) in [(w.start, w.end) for w in windows]


def test_expand_exception_day_off_and_overtime():
    cal = two_shift_calendar()
    cal.exceptions = [
        CalendarException(day=date(2026, 7, 6), available=False),          # 周一全休
        CalendarException(day=date(2026, 7, 11), available=True,
                          start="09:00", end="12:00"),                     # 周六加班
    ]
    start = datetime(2026, 7, 6, 0, 0)
    windows = expand_unavailable(cal, start, 7 * 24 * 60)
    spans = [(w.start, w.end) for w in windows]
    # 周一全天在不可用窗内
    assert any(s <= 0 and e >= 24 * 60 for s, e in spans)
    # 周六 (第 6 天) 09:00-12:00 可用 -> 该段不在任何不可用窗内
    sat9 = 5 * 24 * 60 + 9 * 60
    assert all(not (s < sat9 + 60 and sat9 < e) for s, e in spans)


def test_max_contiguous_available():
    windows = [TimeWindow(start=0, end=480), TimeWindow(start=960, end=1440)]
    assert max_contiguous_available(windows, 1440) == 480
    assert max_contiguous_available([], 1000) == 1000
    assert merge_windows(
        [TimeWindow(start=10, end=20), TimeWindow(start=20, end=30)]
    ) == [TimeWindow(start=10, end=30)]


def _downtime_request(use_hint: bool = True) -> ScheduleRequest:
    """单机台, 停机窗 [50, 200), 两道 60 分钟工序。"""
    m = Machine(id="M1", name="车床",
                downtime_windows=[TimeWindow(start=50, end=200)])
    orders = [
        Order(id="J1", name="a", due_date=400, operations=[
            Operation(id="J1-0", name="op1", sequence=0, family="A",
                      eligible_machines={"M1": 60}),
            Operation(id="J1-1", name="op2", sequence=1, family="A",
                      eligible_machines={"M1": 60}),
        ]),
    ]
    req = ScheduleRequest(machines=[m], orders=orders, time_limit_seconds=8)
    if not use_hint:
        from backend.models import SolverParams
        req.solver_params = SolverParams(use_hint=False)
    return req


def test_solver_avoids_downtime():
    req = _downtime_request()
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert_schedule_valid(req, result)
    # 两道 60min 工序放不进 [0,50), 至少一道要推到 200 之后
    assert max(op.end for op in result.operations) >= 320


def test_solver_avoids_downtime_without_hint():
    req = _downtime_request(use_hint=False)
    result = solve(req)
    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert_schedule_valid(req, result)


def test_heuristic_respects_downtime():
    from backend.heuristic import greedy_schedule, plan_to_result

    req = _downtime_request()
    plan = greedy_schedule(req)
    assert_schedule_valid(req, plan_to_result(req, plan, 0.0))
