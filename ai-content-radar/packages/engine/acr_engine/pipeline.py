"""端到端闭环编排：从市场洞察到内容生产的全自动流水线。

串联十大模块：
  采集归一化 → 爆款规律 → 同质化 → 情绪 → 蓝海机会
            → 选题 → (选定选题) → 小说Bible → 分镜 → 视频提示词 → 增长预测

这是"全自动闭环"的参考实现；线上由 Celery 把每一步拆成异步任务，
本函数则用于本地演示 / 集成测试，证明各模块契约对齐、可串联。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .models import ContentItem, Comment
from .collect import dedup
from .analysis import analyze_titles, cluster_tracks, analyze_comments
from .opportunity import discover_blue_oceans
from .generation import (
    generate_topics, generate_novel_bible, generate_storyboard, generate_video_prompts,
)
from .prediction import predict_virality, ViralityInput


@dataclass
class PipelineResult:
    hot_report: dict
    homogeneity: dict
    sentiment: dict
    blue_oceans: list[dict]
    topics: list[dict]
    chosen_topic: dict | None
    novel_bible: dict | None
    storyboard: dict | None
    video_prompts: list[dict] = field(default_factory=list)
    virality: dict | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__


def run_pipeline(
    items: list[ContentItem],
    comments: list[Comment] | None = None,
    *,
    n_topics: int = 100,
    storyboard_target_models: list[str] | None = None,
) -> PipelineResult:
    comments = comments or []
    items = dedup(items)

    # --- 洞察阶段 ---
    hot = analyze_titles(items)
    homo = cluster_tracks(items)
    radar = analyze_comments(comments)

    supply = {t.name: t.share for t in homo.tracks}
    growth = {t.name: t.growth_rate for t in homo.tracks}
    base_tracks = [t.name for t in homo.tracks] or ["通用"]
    oceans = discover_blue_oceans(base_tracks, supply, growth, top_k=20)

    # --- 选题阶段（取最高分蓝海作为目标赛道）---
    if oceans:
        top = oceans[0]
        liked = [t for t, _ in radar.likes][:5]
        topics = generate_topics(
            top.base_track, cross=top.cross, n=n_topics,
            base_supply=supply.get(top.base_track, 0.5),
            growth=growth.get(top.base_track, 0.1),
            liked_tags=liked,
        )
    else:
        top = None
        topics = generate_topics("通用", n=n_topics)

    chosen = topics[0] if topics else None

    # --- 生产阶段 ---
    bible = sb = None
    prompts: list = []
    virality = None
    if chosen:
        bible = generate_novel_bible(
            chosen.title, track=top.base_track if top else "通用",
            cross=top.cross if top else None, n_chapters=100,
        )
        sb = generate_storyboard(chosen.title, logline=chosen.hook)
        prompts = generate_video_prompts(
            sb.shots, targets=storyboard_target_models or ["veo", "kling", "jimeng"]
        )
        # --- 上线前增长预测 ---
        hook_strength = min(1.0, (hot.top_hooks[0].lift / 3.0) if hot.top_hooks else 0.5)
        comp = homo.tracks[0].competition_index if homo.tracks else 50.0
        virality = predict_virality(ViralityInput(
            hook_strength=hook_strength,
            title_len=len(chosen.title),
            duration_sec=int(sb.total_duration),
            opening_3s_hook=True,
            novelty=chosen.novelty,
            track_competition=comp,
            sentiment_fit=radar.positive_score,
            post_hour=20,
        )).to_dict()

    return PipelineResult(
        hot_report=hot.to_dict(),
        homogeneity=homo.to_dict(),
        sentiment=radar.to_dict(),
        blue_oceans=[o.to_dict() for o in oceans],
        topics=[t.to_dict() for t in topics],
        chosen_topic=chosen.to_dict() if chosen else None,
        novel_bible=bible.to_dict() if bible else None,
        storyboard=sb.to_dict() if sb else None,
        video_prompts=[p.to_dict() for p in prompts],
        virality=virality,
    )
