"""把各平台原始 payload 归一化为统一的 ContentItem，并做跨平台去重。

各平台字段名不同，这里用 FIELD_MAP 声明式映射；新增平台只需加一张表，
符合"开闭原则"，不改归一化主流程。采集器(爬虫/官方API)只负责吐原始
dict，业务下游只认 ContentItem。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

from ..models import ContentItem, Platform

# 平台原始字段 -> 统一字段 的映射表
FIELD_MAP: dict[Platform, dict[str, str]] = {
    Platform.DOUYIN: {
        "external_id": "aweme_id", "title": "desc", "caption": "desc",
        "likes": "digg_count", "collects": "collect_count", "shares": "share_count",
        "comments_count": "comment_count", "plays": "play_count",
        "duration_sec": "duration", "author_id": "author_uid",
    },
    Platform.KUAISHOU: {
        "external_id": "photo_id", "title": "caption", "caption": "caption",
        "likes": "like_count", "collects": "collect_count", "shares": "share_count",
        "comments_count": "comment_count", "plays": "view_count",
        "duration_sec": "duration", "author_id": "user_id",
    },
    Platform.XIAOHONGSHU: {
        "external_id": "note_id", "title": "title", "caption": "desc",
        "likes": "liked_count", "collects": "collected_count", "shares": "shared_count",
        "comments_count": "comments_count", "plays": "view_count",
        "duration_sec": "video_duration", "author_id": "user_id",
    },
    Platform.BILIBILI: {
        "external_id": "bvid", "title": "title", "caption": "desc",
        "likes": "like", "collects": "favorite", "shares": "share",
        "comments_count": "reply", "plays": "view",
        "duration_sec": "duration", "author_id": "mid",
    },
    Platform.YOUTUBE: {
        "external_id": "videoId", "title": "title", "caption": "description",
        "likes": "likeCount", "collects": "favoriteCount", "shares": "shareCount",
        "comments_count": "commentCount", "plays": "viewCount",
        "duration_sec": "durationSec", "author_id": "channelId",
    },
}

_INT_FIELDS = {"likes", "collects", "shares", "comments_count", "plays", "duration_sec"}


def _to_int(v: Any) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _parse_dt(v: Any) -> datetime | None:
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        return v
    # 支持秒级时间戳或 ISO 字符串
    if isinstance(v, (int, float)):
        try:
            return datetime.utcfromtimestamp(int(v))
        except (OverflowError, OSError, ValueError):
            return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(v)[:19], fmt)
        except ValueError:
            continue
    return None


def normalize(platform: Platform | str, raw: dict[str, Any]) -> ContentItem:
    """单条归一化。`published_at`/`tags` 用通用键名做兜底解析。"""
    if isinstance(platform, str):
        platform = Platform(platform)
    fmap = FIELD_MAP[platform]

    kwargs: dict[str, Any] = {"platform": platform, "raw": raw}
    for unified, src in fmap.items():
        val = raw.get(src)
        if unified in _INT_FIELDS:
            kwargs[unified] = _to_int(val)
        else:
            kwargs[unified] = val if val is not None else ""

    # tags / published_at 多平台键名兜底
    tags = raw.get("tags") or raw.get("hashtags") or raw.get("topic") or []
    if isinstance(tags, str):
        tags = [t for t in tags.replace("#", " ").split() if t]
    kwargs["tags"] = list(tags)
    kwargs["published_at"] = _parse_dt(
        raw.get("published_at") or raw.get("create_time") or raw.get("pubdate")
        or raw.get("publishedAt")
    )

    if not kwargs.get("external_id"):
        kwargs["external_id"] = ""
    return ContentItem(**kwargs)


def dedup(items: Iterable[ContentItem]) -> list[ContentItem]:
    """按 (platform, external_id) 去重；保留互动量更高的一条。"""
    best: dict[tuple[str, str], ContentItem] = {}
    for it in items:
        key = (it.platform.value, it.external_id)
        if not it.external_id:
            # 无 id 的条目无法可靠去重，直接保留
            best[(it.platform.value, id(it))] = it  # type: ignore[index]
            continue
        cur = best.get(key)
        if cur is None or it.engagement > cur.engagement:
            best[key] = it
    return list(best.values())
