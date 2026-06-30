"""Celery 任务 —— 编排引擎完成异步流水线。

任务只做 IO + 编排，业务逻辑全部来自 acr_engine（与 API 共享同一内核，
保证线上线下一致）。这里给出签名与骨架；真实 DB/采集器在 services 注入。
"""
from __future__ import annotations

from .celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, name="worker.tasks.collect_all_platforms")
def collect_all_platforms(self, tenant_id: int, keywords: list[str] | None = None):
    """模块1：拉取各平台内容 → 归一化 → 去重 → 落库。"""
    from acr_engine.collect import normalize, dedup
    # TODO: 接入各平台采集器（官方API/合规爬虫），此处为编排骨架
    raw_batches: list[tuple[str, dict]] = []  # [(platform, raw), ...]
    items = dedup([normalize(p, r) for p, r in raw_batches])
    return {"tenant_id": tenant_id, "collected": len(items)}


@celery_app.task(name="worker.tasks.snapshot_tracks")
def snapshot_tracks(tenant_id: int):
    """模块3+5：基于内容库做同质化分析与蓝海发现，落快照。"""
    # 从 DB 读取近 N 天 contents -> cluster_tracks -> discover_blue_oceans -> 落库
    return {"tenant_id": tenant_id, "status": "snapshot-scheduled"}


@celery_app.task(bind=True, max_retries=2, name="worker.tasks.run_pipeline_task")
def run_pipeline_task(self, tenant_id: int, project_id: int):
    """全自动闭环：洞察 → 选题 → 小说/分镜/提示词 → 评分，写回 Project。"""
    return {"tenant_id": tenant_id, "project_id": project_id, "status": "queued"}


@celery_app.task(name="worker.tasks.generate_novel_chapters")
def generate_novel_chapters(project_id: int, start: int, count: int):
    """模块7：批量生成章节正文（保持人物一致性），断点续写。"""
    return {"project_id": project_id, "from": start, "count": count}
