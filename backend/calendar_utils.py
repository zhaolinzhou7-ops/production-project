"""班次日历展开与时间换算。

日历定义 (DB):
- 周规则: (weekday 0-6, "08:00", "16:00"), 同一天多条 = 多班次;
- 例外: 指定日期整天休 (available=False) 或以给定窗覆盖当日班次 (加班/调休)。

展开: 在 [schedule_start, schedule_start + horizon) 内求出机台**不可用**窗
(相对分钟), 供求解器作为固定哑区间加入 NoOverlap。无日历 = 24h 连续可用。
约定: 工序不可中断, 只能整体落在连续可用段内; 换型允许落在停机时段。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from .models import TimeWindow

DAY_MIN = 24 * 60


@dataclass
class ShiftRule:
    weekday: int          # 0=周一 ... 6=周日
    start: str            # "08:00"
    end: str              # "16:00"


@dataclass
class CalendarException:
    day: date
    available: bool       # False=整天停; True=以 start/end 窗覆盖当日班次
    start: str | None = None
    end: str | None = None


@dataclass
class WorkCalendar:
    id: str
    name: str = ""
    rules: list[ShiftRule] = field(default_factory=list)
    exceptions: list[CalendarException] = field(default_factory=list)


def _hm_to_min(hm: str) -> int:
    h, m = hm.split(":")
    v = int(h) * 60 + int(m)
    if not 0 <= v <= DAY_MIN:
        raise ValueError(f"班次时刻超出范围: {hm}")
    return v


def _day_available_minutes(cal: WorkCalendar, day: date) -> list[tuple[int, int]]:
    """某日可用分钟窗 (相对当日 0 点), 已合并排序。"""
    exc = next((e for e in cal.exceptions if e.day == day), None)
    if exc is not None:
        if not exc.available:
            return []
        if exc.start and exc.end:
            return [(_hm_to_min(exc.start), _hm_to_min(exc.end))]
        return [(0, DAY_MIN)]

    windows = sorted(
        (_hm_to_min(r.start), _hm_to_min(r.end))
        for r in cal.rules
        if r.weekday == day.weekday() and _hm_to_min(r.start) < _hm_to_min(r.end)
    )
    merged: list[tuple[int, int]] = []
    for s, e in windows:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def expand_unavailable(
    cal: WorkCalendar | None,
    schedule_start: datetime,
    horizon_minutes: int,
) -> list[TimeWindow]:
    """展开 [0, horizon) 内的不可用窗 (相对 schedule_start 的分钟)。

    连续跨日的不可用段 (夜停+次日凌晨) 自动合并为一个窗。
    """
    if cal is None or (not cal.rules and not cal.exceptions):
        return []

    # 先收集可用段 (相对分钟), 再取补集
    available: list[tuple[int, int]] = []
    day0 = schedule_start.date()
    start_offset = int(
        (schedule_start - datetime.combine(day0, datetime.min.time())).total_seconds() // 60
    )
    n_days = (horizon_minutes + start_offset) // DAY_MIN + 2
    for d in range(n_days):
        day = day0 + timedelta(days=d)
        base = d * DAY_MIN - start_offset
        for s, e in _day_available_minutes(cal, day):
            lo, hi = max(base + s, 0), min(base + e, horizon_minutes)
            if lo < hi:
                available.append((lo, hi))

    available.sort()
    merged: list[tuple[int, int]] = []
    for s, e in available:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))

    unavailable: list[TimeWindow] = []
    cursor = 0
    for s, e in merged:
        if s > cursor:
            unavailable.append(TimeWindow(start=cursor, end=s))
        cursor = max(cursor, e)
    if cursor < horizon_minutes:
        unavailable.append(TimeWindow(start=cursor, end=horizon_minutes))
    return unavailable


def merge_windows(windows: list[TimeWindow]) -> list[TimeWindow]:
    """合并重叠/相邻时间窗。"""
    if not windows:
        return []
    ws = sorted(windows, key=lambda w: w.start)
    merged = [ws[0].model_copy()]
    for w in ws[1:]:
        if w.start <= merged[-1].end:
            merged[-1].end = max(merged[-1].end, w.end)
        else:
            merged.append(w.model_copy())
    return merged


def max_contiguous_available(windows: list[TimeWindow], horizon: int) -> int:
    """给定不可用窗, 返回 [0, horizon) 内最长连续可用时长。"""
    ws = merge_windows(windows)
    best, cursor = 0, 0
    for w in ws:
        if w.start > cursor:
            best = max(best, w.start - cursor)
        cursor = max(cursor, w.end)
    best = max(best, max(horizon - cursor, 0))
    return best
