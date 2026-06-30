"""模块4 · 评论区情绪分析 —— 用户需求雷达图。

输出三类信号：喜欢 / 讨厌 / 期待，并按"点赞加权"排序，得到可直接
驱动选题的需求标签。无外部依赖；可平滑替换为 LLM 情绪抽取。
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from ..models import Comment
from .lexicon import POSITIVE_WORDS, NEGATIVE_WORDS, EXPECT_MARKERS


@dataclass
class SentimentRadar:
    sample_size: int
    positive_score: float          # 正向占比 0-1
    negative_score: float
    likes: list[tuple[str, float]] = field(default_factory=list)   # (标签, 权重)
    dislikes: list[tuple[str, float]] = field(default_factory=list)
    expectations: list[tuple[str, float]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "sample_size": self.sample_size,
            "positive_score": round(self.positive_score, 3),
            "negative_score": round(self.negative_score, 3),
            "likes": [{"tag": t, "weight": round(w, 1)} for t, w in self.likes],
            "dislikes": [{"tag": t, "weight": round(w, 1)} for t, w in self.dislikes],
            "expectations": [{"text": t, "weight": round(w, 1)} for t, w in self.expectations],
        }


def _weighted_hits(comments, vocab) -> dict[str, float]:
    """对词典里每个词，统计其出现评论的点赞加权和。"""
    acc: dict[str, float] = defaultdict(float)
    for c in comments:
        weight = 1.0 + c.likes  # 点赞越多，代表性越强
        for w in vocab:
            if w in c.text:
                acc[w] += weight
    return acc


def analyze_comments(comments: Iterable[Comment]) -> SentimentRadar:
    comments = [c for c in comments if c and c.text]
    n = len(comments)
    if n == 0:
        return SentimentRadar(0, 0.0, 0.0)

    pos = _weighted_hits(comments, POSITIVE_WORDS)
    neg = _weighted_hits(comments, NEGATIVE_WORDS)

    pos_total = sum(pos.values())
    neg_total = sum(neg.values())
    denom = pos_total + neg_total or 1.0

    # 期待类：命中许愿句式的评论原文（截断）
    expect: list[tuple[str, float]] = []
    for c in comments:
        if any(m in c.text for m in EXPECT_MARKERS):
            expect.append((c.text[:40], 1.0 + c.likes))
    expect.sort(key=lambda x: x[1], reverse=True)

    return SentimentRadar(
        sample_size=n,
        positive_score=pos_total / denom,
        negative_score=neg_total / denom,
        likes=sorted(pos.items(), key=lambda x: x[1], reverse=True)[:10],
        dislikes=sorted(neg.items(), key=lambda x: x[1], reverse=True)[:10],
        expectations=expect[:10],
    )
