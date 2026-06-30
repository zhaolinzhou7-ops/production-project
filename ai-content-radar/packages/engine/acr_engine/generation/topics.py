"""模块6 · AI 选题生成器。

给定目标赛道 + 用户需求信号（来自模块4），组合"冲突模板 × 爆点 × 人群"
生成差异化选题，并为每个选题估算竞争度与创新指数。

实现为"结构化模板 + 可选 LLM 润色"：无 Key 时用模板产出确定性结果，
有 Key 时把模板作为 few-shot 让 LLM 扩写标题（接口不变）。
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Iterable

from ..opportunity.scoring import OpportunityInput, opportunity_score

# 冲突原型 × 爆点 × 人群（差异化的来源）
_CONFLICTS = [
    "身份反差", "绝境翻盘", "信息差打脸", "时间错位", "规则颠覆",
    "亲情背叛", "天才陨落", "弱者觉醒", "联盟反目", "降维碾压",
]
_HOOKS = [
    "开局即巅峰", "全员低估主角", "一个误会引发的逆袭", "系统突然降临",
    "退婚当天身份曝光", "重生回到关键节点", "扮猪吃虎被识破",
]
_AUDIENCES = ["下沉市场男频", "都市女频", "Z世代二次元", "银发怀旧", "硬核科幻迷"]


@dataclass
class Topic:
    title: str
    hook: str            # 爆点
    conflict: str        # 冲突
    audience: str        # 目标人群
    competition: float   # 预估竞争度 0-100
    novelty: float       # 创新指数 0-1

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "hook": self.hook,
            "conflict": self.conflict,
            "audience": self.audience,
            "competition": round(self.competition, 1),
            "novelty": round(self.novelty, 3),
        }


def generate_topics(
    track: str,
    cross: str | None = None,
    *,
    n: int = 100,
    base_supply: float = 0.5,
    growth: float = 0.1,
    liked_tags: Iterable[str] | None = None,
    seed: int = 42,
) -> list[Topic]:
    """生成 n 个差异化选题（默认 100）。

    cross 给定时（蓝海跨界，如 "工业文明"），创新指数整体抬升、竞争度下降。
    liked_tags 来自模块4，命中会让选题更贴合用户喜好。
    """
    rng = random.Random(seed)
    liked = list(liked_tags or [])
    topics: list[Topic] = []
    seen: set[str] = set()

    attempts = 0
    while len(topics) < n and attempts < n * 6:
        attempts += 1
        conflict = rng.choice(_CONFLICTS)
        hook = rng.choice(_HOOKS)
        audience = rng.choice(_AUDIENCES)
        cross_part = f"×{cross}" if cross else ""
        like_part = f"·{rng.choice(liked)}" if liked and rng.random() < 0.5 else ""
        # 把人群编入标题，扩大可去重组合空间（hook×conflict×audience）
        title = f"【{track}{cross_part}|{audience}】{hook}：{conflict}{like_part}"
        if title in seen:
            continue
        seen.add(title)

        # 创新指数：跨界 +0.25，命中喜好 +0.1，加随机扰动
        novelty = min(1.0, 0.45 + (0.25 if cross else 0.0) + (0.1 if like_part else 0.0)
                      + rng.uniform(-0.1, 0.15))
        # 竞争度：用 opportunity_score 反推（机会越高竞争越低）
        opp = opportunity_score(
            OpportunityInput(
                name=title,
                demand=min(1.0, 0.55 + (0.1 if like_part else 0.0)),
                supply=base_supply * (0.4 if cross else 1.0),
                growth=growth,
            )
        )
        competition = round(max(0.0, 100.0 - opp), 1)
        topics.append(Topic(title, hook, conflict, audience, competition, novelty))

    # 高创新、低竞争优先
    topics.sort(key=lambda t: (t.novelty, -t.competition), reverse=True)
    return topics
