"""Celery 应用 —— 异步任务调度（采集、分析、生成、预测）。

任务设计为幂等、可重试；定时任务用 Celery beat 触发（如每日采集 + 赛道快照）。
"""
from __future__ import annotations

import os

from celery import Celery

BROKER = os.getenv("REDIS_URL", "redis://localhost:6379/0")
BACKEND = os.getenv("REDIS_URL", "redis://localhost:6379/1")

celery_app = Celery("acr", broker=BROKER, backend=BACKEND)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=10,
    timezone="Asia/Shanghai",
)

# 定时任务：每天 03:00 全量采集，03:30 生成赛道快照与蓝海报告
celery_app.conf.beat_schedule = {
    "daily-collect": {
        "task": "worker.tasks.collect_all_platforms",
        "schedule": 24 * 3600,
    },
    "daily-track-snapshot": {
        "task": "worker.tasks.snapshot_tracks",
        "schedule": 24 * 3600,
    },
}
