"""模块3 · 同质化分析系统 —— 子流派聚类 + 红海赛道地图。

策略（无外部依赖版）：弱监督词典匹配把内容归入子流派，再统计每个
流派的占比、增长率、平均互动，并据此算出"竞争指数"。

生产环境可把"词典匹配"替换为 Embedding + HDBSCAN 聚类，接口保持不变。
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from statistics import mean
from typing import Iterable

from ..models import ContentItem, TrackStat
from .lexicon import TRACK_LEXICON


@dataclass
class HomogeneityReport:
    total: int
    tracks: list[TrackStat] = field(default_factory=list)
    unclassified: int = 0

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "unclassified": self.unclassified,
            "tracks": [
                {
                    "name": t.name,
                    "count": t.count,
                    "share": round(t.share, 4),
                    "growth_rate": round(t.growth_rate, 4),
                    "avg_engagement": round(t.avg_engagement, 1),
                    "competition_index": round(t.competition_index, 1),
                }
                for t in self.tracks
            ],
        }


def _classify(item: ContentItem, lexicon: dict[str, list[str]]) -> str | None:
    """返回命中分值最高的子流派；都不命中返回 None。"""
    text = f"{item.title} {item.caption} {' '.join(item.tags)}"
    best, best_score = None, 0
    for track, words in lexicon.items():
        score = sum(1 for w in words if w in text)
        if score > best_score:
            best, best_score = track, score
    return best


def _competition_index(share: float, growth: float, count: int) -> float:
    """竞争指数 0-100：占比越高、存量越大 => 越红海；增长越快略微降低
    （说明还在扩张、仍有空间）。是一个可解释的启发式。
    """
    base = 100 * share                      # 占比贡献
    volume = min(20.0, count ** 0.5)        # 存量贡献（开方抑制）
    growth_relief = max(-15.0, min(15.0, growth * 30))  # 高增长 -> 减压
    idx = base + volume - growth_relief
    return max(0.0, min(100.0, idx))


def cluster_tracks(
    items: Iterable[ContentItem],
    lexicon: dict[str, list[str]] | None = None,
    now: datetime | None = None,
) -> HomogeneityReport:
    items = [i for i in items if i is not None]
    lexicon = lexicon or TRACK_LEXICON
    now = now or datetime.utcnow()
    total = len(items)
    if total == 0:
        return HomogeneityReport(total=0)

    groups: dict[str, list[ContentItem]] = defaultdict(list)
    unclassified = 0
    for it in items:
        track = _classify(it, lexicon)
        if track is None:
            unclassified += 1
        else:
            groups[track].append(it)

    week = timedelta(days=7)
    tracks: list[TrackStat] = []
    for name, grp in groups.items():
        count = len(grp)
        share = count / total
        # 增长率：近 7 天 vs 前 7 天 的样本数变化
        recent = sum(1 for i in grp if i.published_at and now - i.published_at <= week)
        prev = sum(
            1 for i in grp if i.published_at and week < (now - i.published_at) <= 2 * week
        )
        growth = (recent - prev) / prev if prev else (1.0 if recent else 0.0)
        avg_eng = mean(i.engagement for i in grp)
        tracks.append(
            TrackStat(
                name=name,
                count=count,
                share=share,
                growth_rate=growth,
                avg_engagement=avg_eng,
                competition_index=_competition_index(share, growth, count),
            )
        )

    tracks.sort(key=lambda t: t.competition_index, reverse=True)
    return HomogeneityReport(total=total, tracks=tracks, unclassified=unclassified)
