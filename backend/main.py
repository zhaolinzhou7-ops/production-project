"""自动排产系统 FastAPI 服务。

接口:
- GET  /                  -> 前端页面 (甘特图可视化)
- GET  /api/sample        -> 返回演示用样例排产请求数据
- POST /api/schedule      -> 提交排产请求, 返回排产结果
- GET  /api/health        -> 健康检查
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api_data import router as data_router
from .api_scenario import router as scenario_router
from .db import init_app_db
from .models import ScheduleRequest, ScheduleResult
from .sample_data import sample_request
from .scheduler import solve

app = FastAPI(title="智能排产系统", version="2.0.0")
init_app_db()
app.include_router(data_router)
app.include_router(scenario_router)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/sample", response_model=ScheduleRequest)
def get_sample() -> ScheduleRequest:
    """返回演示用样例数据, 前端可直接加载后排产。"""
    return sample_request()


@app.post("/api/schedule", response_model=ScheduleResult)
def schedule(request: ScheduleRequest) -> ScheduleResult:
    """执行排产并返回结果。"""
    return solve(request)


if FRONTEND_DIR.exists():
    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
