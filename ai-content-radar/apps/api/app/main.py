"""FastAPI 入口 —— 装配中间件、路由、可观测性。"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.v1.router import router as v1_router

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI 爆款内容雷达 —— 从市场洞察到内容生产的全自动闭环",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产请收敛到具体域名
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix=settings.api_v1_prefix)


@app.get("/")
def root():
    return {"app": settings.app_name, "docs": "/docs", "api": settings.api_v1_prefix}
