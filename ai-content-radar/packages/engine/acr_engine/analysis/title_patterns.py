"""模块2 · 爆款分析引擎 —— 标题/时长/节奏规律抽取。

输入一批 ContentItem，输出《爆款规律报告》核心字段：
  - 高频钩子词及其"爆款溢价"（命中该词的平均互动 / 整体平均互动）
  - 最佳时长区间
  - 标题长度规律
全部为可解释的统计量，便于运营复核。
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from statistics import mean
from typing import Iterable

from ..models import ContentItem
from .lexicon import HOOK_KEYWORDS

_TOKEN_RE = re.compile(r"[一-鿿]{2,4}")  # 朴素中文 2-4 gram 兜底


@dataclass
class HookStat:
    keyword: str
    label: str
    hits: int
    avg_engagement: float
    lift: float  # 爆款溢价：命中该词 vs 全体的平均互动倍数


@dataclass
class DurationBucket:
    label: str
    lo: int
    hi: int
    count: int
    avg_engagement: float


@dataclass
class TitlePatternReport:
    sample_size: int
    overall_avg_engagement: float
    top_hooks: list[HookStat] = field(default_factory=list)
    best_duration: DurationBucket | None = None
    duration_buckets: list[DurationBucket] = field(default_factory=list)
    avg_title_len: float = 0.0

    def to_dict(self) -> dict:
        return {
            "sample_size": self.sample_size,
            "overall_avg_engagement": round(self.overall_avg_engagement, 2),
            "avg_title_len": round(self.avg_title_len, 1),
            "top_hooks": [
                {
                    "keyword": h.keyword,
                    "label": h.label,
                    "hits": h.hits,
                    "avg_engagement": round(h.avg_engagement, 1),
                    "lift": round(h.lift, 2),
                }
                for h in self.top_hooks
            ],
            "best_duration": _bucket_dict(self.best_duration) if self.best_duration else None,
            "duration_buckets": [_bucket_dict(b) for b in self.duration_buckets],
        }


def _bucket_dict(b: DurationBucket) -> dict:
    return {
        "label": b.label,
        "range_sec": [b.lo, b.hi],
        "count": b.count,
        "avg_engagement": round(b.avg_engagement, 1),
    }


# 时长分桶（秒）：短视频常见区间
_DURATION_BINS = [
    ("0-15s 黄金钩子", 0, 15),
    ("15-30s 短平快", 15, 30),
    ("30-60s 标准", 30, 60),
    ("1-3min 中长", 60, 180),
    ("3min+ 长视频", 180, 10 ** 9),
]


def analyze_titles(items: Iterable[ContentItem]) -> TitlePatternReport:
    items = [i for i in items if i is not None]
    if not items:
        return TitlePatternReport(sample_size=0, overall_avg_engagement=0.0)

    overall_avg = mean(i.engagement for i in items)
    overall_avg = overall_avg or 1.0  # 防止全 0 导致 lift 除零

    # --- 钩子词统计 ---
    hook_eng: dict[str, list[int]] = defaultdict(list)
    for it in items:
        text = f"{it.title} {it.caption}"
        for kw in HOOK_KEYWORDS:
            if kw in text:
                hook_eng[kw].append(it.engagement)

    hooks: list[HookStat] = []
    for kw, engs in hook_eng.items():
        avg = mean(engs)
        hooks.append(
            HookStat(
                keyword=kw,
                label=HOOK_KEYWORDS[kw],
                hits=len(engs),
                avg_engagement=avg,
                lift=avg / overall_avg,
            )
        )
    # 先按溢价、再按命中数排序
    hooks.sort(key=lambda h: (h.lift, h.hits), reverse=True)

    # --- 时长分桶 ---
    buckets: list[DurationBucket] = []
    for label, lo, hi in _DURATION_BINS:
        grp = [i for i in items if lo <= i.duration_sec < hi]
        if grp:
            buckets.append(
                DurationBucket(label, lo, hi, len(grp), mean(i.engagement for i in grp))
            )
    best = max(buckets, key=lambda b: b.avg_engagement) if buckets else None

    avg_title_len = mean(len(i.title) for i in items)

    return TitlePatternReport(
        sample_size=len(items),
        overall_avg_engagement=overall_avg,
        top_hooks=hooks[:12],
        best_duration=best,
        duration_buckets=buckets,
        avg_title_len=avg_title_len,
    )
