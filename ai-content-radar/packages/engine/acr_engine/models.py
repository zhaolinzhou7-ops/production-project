"""引擎层的领域数据结构（与 ORM / Pydantic 解耦的纯 dataclass）。"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any


class Platform(str, Enum):
    DOUYIN = "douyin"      # 抖音
    KUAISHOU = "kuaishou"  # 快手
    XIAOHONGSHU = "xhs"    # 小红书
    BILIBILI = "bilibili"  # B 站
    YOUTUBE = "youtube"    # YouTube


@dataclass
class ContentItem:
    """统一内容模型 —— 模块1 采集后归一化的结果。

    所有平台的原始字段都映射到这一结构，下游分析只认它。
    """
    platform: Platform
    external_id: str            # 平台内的视频 id（用于跨平台去重）
    title: str = ""
    caption: str = ""           # 文案 / 正文
    tags: list[str] = field(default_factory=list)
    published_at: datetime | None = None
    likes: int = 0
    collects: int = 0           # 收藏
    shares: int = 0             # 转发
    comments_count: int = 0
    plays: int = 0              # 播放量（部分平台无 -> 0）
    duration_sec: int = 0       # 视频时长（秒）
    author_id: str = ""
    raw: dict[str, Any] = field(default_factory=dict)  # 保留原始 payload

    @property
    def engagement(self) -> int:
        """总互动量：点赞 + 收藏 + 转发 + 评论。"""
        return self.likes + self.collects + self.shares + self.comments_count

    @property
    def engagement_rate(self) -> float:
        """互动率 = 互动 / 播放。无播放数据时回退用互动量近似（避免除零）。"""
        base = self.plays if self.plays > 0 else max(self.engagement, 1)
        return self.engagement / base

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["platform"] = self.platform.value if isinstance(self.platform, Platform) else self.platform
        if isinstance(self.published_at, datetime):
            d["published_at"] = self.published_at.isoformat()
        return d


@dataclass
class Comment:
    """评论 —— 模块4 情绪分析的输入。"""
    content_external_id: str
    text: str
    likes: int = 0
    published_at: datetime | None = None


@dataclass
class TrackStat:
    """赛道统计 —— 模块3 同质化分析的输出单元。"""
    name: str                 # 赛道 / 子流派名，如 "退婚流"
    count: int                # 样本量
    share: float              # 内容占比 0-1
    growth_rate: float        # 增长率（近 7 天 vs 前 7 天）
    avg_engagement: float     # 平均互动
    competition_index: float  # 竞争指数 0-100
