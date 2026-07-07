"""API v1 路由 —— 把 HTTP 请求委托给 acr_engine（业务规则下沉到引擎）。

路由按十大模块分组：
  /collect      模块1
  /hot          模块2
  /homogeneity  模块3
  /sentiment    模块4
  /opportunity  模块5
  /topics       模块6
  /novel        模块7
  /storyboard   模块8 + 模块9（同时产出视频提示词）
  /virality     模块10
  /pipeline     全自动闭环
"""
from __future__ import annotations

from fastapi import APIRouter

from acr_engine.collect import normalize, dedup
from acr_engine.models import Comment
from acr_engine.analysis import analyze_titles, cluster_tracks, analyze_comments
from acr_engine.opportunity import discover_blue_oceans
from acr_engine.generation import (
    generate_topics, generate_novel_bible, generate_storyboard, generate_video_prompts,
)
from acr_engine.prediction import predict_virality, ViralityInput
from acr_engine.pipeline import run_pipeline

from app.schemas.analysis import (
    AnalyzeRequest, OpportunityRequest, TopicRequest, NovelRequest,
    StoryboardRequest, ViralityRequest, PipelineRequest,
)

router = APIRouter()


def _to_items(raw_list):
    items = [normalize(r.platform, r.raw) for r in raw_list]
    return dedup(items)


def _to_comments(comment_list):
    return [Comment(c.content_external_id, c.text, c.likes) for c in comment_list]


@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/collect/normalize", tags=["模块1 采集"])
def collect_normalize(req: AnalyzeRequest):
    items = _to_items(req.items)
    return {"count": len(items), "items": [i.to_dict() for i in items]}


@router.post("/hot/analyze", tags=["模块2 爆款规律"])
def hot_analyze(req: AnalyzeRequest):
    return analyze_titles(_to_items(req.items)).to_dict()


@router.post("/homogeneity/analyze", tags=["模块3 同质化"])
def homogeneity_analyze(req: AnalyzeRequest):
    return cluster_tracks(_to_items(req.items)).to_dict()


@router.post("/sentiment/analyze", tags=["模块4 评论情绪"])
def sentiment_analyze(req: AnalyzeRequest):
    return analyze_comments(_to_comments(req.comments)).to_dict()


@router.post("/opportunity/discover", tags=["模块5 蓝海机会"])
def opportunity_discover(req: OpportunityRequest):
    oceans = discover_blue_oceans(
        req.base_tracks, req.track_supply, req.track_growth,
        cross_dimensions=req.cross_dimensions, top_k=req.top_k,
    )
    return {"count": len(oceans), "blue_oceans": [o.to_dict() for o in oceans]}


@router.post("/topics/generate", tags=["模块6 选题"])
def topics_generate(req: TopicRequest):
    topics = generate_topics(
        req.track, cross=req.cross, n=req.n,
        base_supply=req.base_supply, growth=req.growth, liked_tags=req.liked_tags,
    )
    return {"count": len(topics), "topics": [t.to_dict() for t in topics]}


@router.post("/novel/bible", tags=["模块7 小说"])
def novel_bible(req: NovelRequest):
    return generate_novel_bible(
        req.title, req.track, cross=req.cross, n_chapters=req.n_chapters
    ).to_dict()


@router.post("/storyboard/generate", tags=["模块8/9 分镜+提示词"])
def storyboard_generate(req: StoryboardRequest):
    sb = generate_storyboard(req.title, req.logline, beats=req.beats)
    prompts = generate_video_prompts(sb.shots, targets=req.target_models)
    return {"storyboard": sb.to_dict(), "video_prompts": [p.to_dict() for p in prompts]}


@router.post("/virality/predict", tags=["模块10 增长预测"])
def virality_predict(req: ViralityRequest):
    return predict_virality(ViralityInput(**req.__dict__)).to_dict()


@router.post("/pipeline/run", tags=["全自动闭环"])
def pipeline_run(req: PipelineRequest):
    result = run_pipeline(
        _to_items(req.items), _to_comments(req.comments), n_topics=req.n_topics
    )
    return result.to_dict()
