"""模块10 · 增长预测 —— 内容爆款概率与 0-100 评分。

工程取舍：线上应训练 GBDT/逻辑回归（特征：钩子词、时长、节奏、封面、
发布时段、历史账号权重…）。这里实现一个**可解释的加权打分**作为冷启动
基线，并保留与 ML 模型一致的 ViralityInput 契约，便于无缝替换。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class ViralityInput:
    hook_strength: float        # 0-1 标题钩子强度（来自模块2 lift 归一化）
    title_len: int              # 标题字数
    duration_sec: int           # 时长
    opening_3s_hook: bool       # 前3秒是否有强钩子
    novelty: float              # 0-1 创新指数（来自模块5）
    track_competition: float    # 0-100 赛道竞争指数（越高越红海，扣分）
    sentiment_fit: float        # 0-1 是否契合用户"喜欢"标签
    post_hour: int = 20         # 发布时段（0-23）


@dataclass
class ViralityScore:
    score: int                   # 0-100 综合内容评分
    viral_probability: float     # 0-1 爆款概率
    predicted_engagement_rate: float
    predicted_completion_rate: float
    breakdown: dict[str, float] = field(default_factory=dict)
    suggestions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "viral_probability": round(self.viral_probability, 3),
            "predicted_engagement_rate": round(self.predicted_engagement_rate, 4),
            "predicted_completion_rate": round(self.predicted_completion_rate, 4),
            "breakdown": {k: round(v, 2) for k, v in self.breakdown.items()},
            "suggestions": self.suggestions,
        }


def _duration_score(sec: int) -> float:
    """时长甜区：21-45s 最优，过短/过长扣分。返回 0-1。"""
    if sec <= 0:
        return 0.3
    ideal = 33.0
    return math.exp(-((sec - ideal) ** 2) / (2 * 22.0 ** 2))


def _title_len_score(n: int) -> float:
    """标题甜区：12-22 字。返回 0-1。"""
    ideal = 17.0
    return math.exp(-((n - ideal) ** 2) / (2 * 8.0 ** 2))


def _prime_time_score(hour: int) -> float:
    """黄金发布时段：午间 11-13、晚间 18-23 加分。"""
    if 18 <= hour <= 23:
        return 1.0
    if 11 <= hour <= 13:
        return 0.8
    if 6 <= hour <= 9:
        return 0.6
    return 0.4


# 各因子权重（合计 1.0），可被后台配置覆盖
WEIGHTS = {
    "hook": 0.24,
    "opening": 0.16,
    "novelty": 0.15,
    "sentiment_fit": 0.13,
    "duration": 0.12,
    "competition": 0.10,  # 越红海越扣（用 1-comp 计入）
    "title_len": 0.06,
    "prime_time": 0.04,
}


def predict_virality(inp: ViralityInput) -> ViralityScore:
    factors = {
        "hook": max(0.0, min(1.0, inp.hook_strength)),
        "opening": 1.0 if inp.opening_3s_hook else 0.35,
        "novelty": max(0.0, min(1.0, inp.novelty)),
        "sentiment_fit": max(0.0, min(1.0, inp.sentiment_fit)),
        "duration": _duration_score(inp.duration_sec),
        "competition": 1.0 - max(0.0, min(100.0, inp.track_competition)) / 100.0,
        "title_len": _title_len_score(inp.title_len),
        "prime_time": _prime_time_score(inp.post_hour),
    }
    weighted = sum(WEIGHTS[k] * v for k, v in factors.items())
    score = int(round(weighted * 100))

    # 爆款概率：对加权分做 logistic，中心 0.62
    viral_p = 1.0 / (1.0 + math.exp(-9.0 * (weighted - 0.62)))

    # 预测指标（经验映射，仅作参考量级）
    eng_rate = 0.02 + 0.10 * weighted
    completion = 0.25 + 0.55 * factors["duration"] * (0.6 + 0.4 * factors["opening"])

    suggestions = _suggest(factors, inp)

    return ViralityScore(
        score=score,
        viral_probability=viral_p,
        predicted_engagement_rate=eng_rate,
        predicted_completion_rate=min(0.98, completion),
        breakdown={k: WEIGHTS[k] * v * 100 for k, v in factors.items()},
        suggestions=suggestions,
    )


def _suggest(factors: dict[str, float], inp: ViralityInput) -> list[str]:
    tips: list[str] = []
    if factors["opening"] < 0.6:
        tips.append("前3秒缺少强钩子：建议用冲突/反差/悬念开场。")
    if factors["duration"] < 0.5:
        tips.append(f"时长 {inp.duration_sec}s 偏离甜区，建议压缩到 21-45s。")
    if factors["hook"] < 0.5:
        tips.append("标题钩子较弱：尝试植入'开局/重生/退婚/逆袭'等高溢价词。")
    if factors["competition"] < 0.4:
        tips.append("所选赛道偏红海：考虑模块5 推荐的蓝海跨界组合以降低竞争。")
    if factors["title_len"] < 0.5:
        tips.append("标题字数偏离 12-22 甜区，影响点击率。")
    if not tips:
        tips.append("各项指标均在健康区间，可直接进入生产流水线。")
    return tips
