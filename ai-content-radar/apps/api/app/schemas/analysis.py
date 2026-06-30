"""API 请求/响应 schema（Pydantic v2）。"""
from __future__ import annotations

from typing import Any, Optional

try:
    from pydantic import BaseModel, Field
except ImportError:  # 文档/离线场景兜底
    class BaseModel:  # type: ignore
        def __init__(self, **kw: Any) -> None:
            self.__dict__.update(kw)

    def Field(default=None, **_: Any):  # type: ignore
        return default


class RawContent(BaseModel):
    platform: str = Field(..., description="douyin|kuaishou|xhs|bilibili|youtube")
    raw: dict[str, Any] = Field(default_factory=dict, description="平台原始字段")


class CommentIn(BaseModel):
    content_external_id: str = ""
    text: str
    likes: int = 0


class AnalyzeRequest(BaseModel):
    items: list[RawContent] = Field(default_factory=list)
    comments: list[CommentIn] = Field(default_factory=list)


class OpportunityRequest(BaseModel):
    base_tracks: list[str]
    track_supply: dict[str, float] = Field(default_factory=dict)
    track_growth: dict[str, float] = Field(default_factory=dict)
    cross_dimensions: Optional[list[str]] = None
    top_k: int = 20


class TopicRequest(BaseModel):
    track: str
    cross: Optional[str] = None
    n: int = 100
    base_supply: float = 0.5
    growth: float = 0.1
    liked_tags: list[str] = Field(default_factory=list)


class NovelRequest(BaseModel):
    title: str
    track: str
    cross: Optional[str] = None
    n_chapters: int = 100


class StoryboardRequest(BaseModel):
    title: str
    logline: str
    beats: Optional[list[str]] = None
    target_models: list[str] = Field(default_factory=lambda: ["veo", "kling", "jimeng"])


class ViralityRequest(BaseModel):
    hook_strength: float = 0.5
    title_len: int = 17
    duration_sec: int = 33
    opening_3s_hook: bool = True
    novelty: float = 0.5
    track_competition: float = 50.0
    sentiment_fit: float = 0.5
    post_hour: int = 20


class PipelineRequest(BaseModel):
    items: list[RawContent] = Field(default_factory=list)
    comments: list[CommentIn] = Field(default_factory=list)
    n_topics: int = 100
