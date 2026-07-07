"""模块5 · 蓝海机会发现 —— Opportunity Score。

核心理念："高需求 + 低供给" = 蓝海。

  demand   ∈ [0,1]  需求强度（搜索/互动/评论期待度归一化）
  supply   ∈ [0,1]  供给密度（内容占比/竞争指数归一化）
  growth   ∈ [-1,∞] 增长率

  OpportunityScore = 100 * demand * (1 - supply) * growth_multiplier

其中 growth_multiplier 把增长率压缩到 (0.5, 1.5)，让"正在升温但还没卷"
的赛道得分更高。结果 0-100，越高越蓝海。

`discover_blue_oceans` 在赛道上做"跨界组合"（如 修仙 × 工业文明），
为每个组合估算 demand/supply 并打分，产出《蓝海机会报告》候选。
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import product
from typing import Iterable


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _growth_multiplier(growth: float) -> float:
    """把增长率经 logistic 压到 (0.6, 1.4)。growth=0 -> 1.0。

    刻意收窄区间：避免"高增长赛道"把机会分直接顶到 100 而失去区分度。
    """
    return 0.6 + 0.8 / (1.0 + math.exp(-3.0 * growth))


@dataclass
class OpportunityInput:
    name: str
    demand: float   # 0-1
    supply: float   # 0-1
    growth: float   # 例如 0.2 = +20%


def opportunity_score(inp: OpportunityInput) -> float:
    demand = _clamp01(inp.demand)
    supply = _clamp01(inp.supply)
    score = 100.0 * demand * (1.0 - supply) * _growth_multiplier(inp.growth)
    return round(max(0.0, min(100.0, score)), 1)


@dataclass
class BlueOcean:
    name: str               # 组合名，如 "修仙 + 工业文明"
    base_track: str
    cross: str
    score: float
    demand: float
    supply: float
    growth: float
    rationale: str = ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "base_track": self.base_track,
            "cross": self.cross,
            "score": self.score,
            "demand": round(self.demand, 3),
            "supply": round(self.supply, 3),
            "growth": round(self.growth, 3),
            "rationale": self.rationale,
        }


# 跨界维度种子：与主赛道做笛卡尔积，制造"内容空白区"候选
DEFAULT_CROSS_DIMENSIONS = [
    "AI", "工业文明", "时间循环", "航空制造", "赛博朋克",
    "美食", "基建狂魔", "悬疑推理", "经营养成", "末世求生",
]

# 每个跨界维度的画像：(需求系数, 供给增量)。
#   需求系数：该题材当下的大众关注度(1.0=很热)。
#   供给增量：该跨界方向已有多少人做(越大越拥挤，机会越低)。
# 让不同跨界组合产生有区分度的机会分，而不是全部并列。
CROSS_PROFILE: dict[str, tuple[float, float]] = {
    "AI":     (1.00, 0.10),   # 很热，但也已有人做
    "工业文明": (0.86, 0.03),
    "时间循环": (0.82, 0.04),
    "航空制造": (0.70, 0.01),  # 冷门但极新
    "赛博朋克": (0.90, 0.06),
    "美食":    (0.95, 0.08),
    "基建狂魔": (0.80, 0.03),
    "悬疑推理": (0.92, 0.07),
    "经营养成": (0.78, 0.04),
    "末世求生": (0.88, 0.05),
}
_DEFAULT_PROFILE = (0.85, 0.05)


def discover_blue_oceans(
    base_tracks: Iterable[str],
    track_supply: dict[str, float],
    track_growth: dict[str, float],
    cross_dimensions: Iterable[str] | None = None,
    demand_hint: dict[str, float] | None = None,
    top_k: int = 20,
    max_per_base: int | None = None,
) -> list[BlueOcean]:
    """对 (主赛道 × 跨界维度) 组合打分，返回 Top-K 蓝海机会。

    - track_supply / track_growth：来自模块3 的同质化分析。
    - demand_hint：来自模块4 的需求雷达（缺省按基础需求估计）。
    - max_per_base：每个主赛道最多保留几条，让推荐覆盖多个赛道、避免最热
      赛道霸榜（None=不限制）。
    跨界组合天然供给更低（市场上少见），因此 supply 在主赛道基础上打折。
    """
    cross_dimensions = list(cross_dimensions or DEFAULT_CROSS_DIMENSIONS)
    demand_hint = demand_hint or {}
    out: list[BlueOcean] = []

    for base, cross in product(base_tracks, cross_dimensions):
        base_supply = _clamp01(track_supply.get(base, 0.5))
        growth = track_growth.get(base, 0.0)
        cross_demand, cross_supply_add = CROSS_PROFILE.get(cross, _DEFAULT_PROFILE)
        # 跨界组合越"陌生"，供给越低：主赛道供给衰减 + 该跨界方向已有供给
        combo_supply = _clamp01(base_supply * 0.35 + cross_supply_add)
        # 需求：主赛道既有热度(demand_hint) × 该跨界题材的大众关注度。
        # 映射到 (0.25, 0.75) 而非逼近 1，避免热门赛道把分数直接顶满、失去区分度。
        base_demand = _clamp01(demand_hint.get(base, 0.6) * 0.5 + 0.25)
        demand = _clamp01(base_demand * cross_demand)
        inp = OpportunityInput(
            name=f"{base} + {cross}", demand=demand, supply=combo_supply, growth=growth
        )
        score = opportunity_score(inp)
        out.append(
            BlueOcean(
                name=inp.name,
                base_track=base,
                cross=cross,
                score=score,
                demand=demand,
                supply=combo_supply,
                growth=growth,
                rationale=(
                    f"{base} 已有受众基础(需求≈{demand:.2f})，"
                    f"× {cross} 的内容供给稀缺(供给≈{combo_supply:.2f})，"
                    f"赛道增速 {growth:+.0%} → 高需求低供给的内容空白。"
                ),
            )
        )

    out.sort(key=lambda b: b.score, reverse=True)
    if max_per_base is not None:
        kept: dict[str, int] = {}
        diversified: list[BlueOcean] = []
        for b in out:
            if kept.get(b.base_track, 0) >= max_per_base:
                continue
            kept[b.base_track] = kept.get(b.base_track, 0) + 1
            diversified.append(b)
        out = diversified
    return out[:top_k]
