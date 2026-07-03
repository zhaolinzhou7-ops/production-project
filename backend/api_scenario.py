"""方案 API: 从 DB 求解并保存、模拟 (停机/冻结)、对比、报工。

长求解走后台线程 + run_id 轮询, 避免 HTTP 超时;
测试可用 sync=true 同步等待。
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import crud, scenario as scenario_mod
from .db import get_session, open_session
from .models import ObjectiveWeights, SolverParams, TimeWindow
from .reschedule import Conflict, solve_with_freeze
from .scenario import ScenarioCompare, ScenarioDetail, ScenarioSummary
from .scheduler import solve

router = APIRouter(prefix="/api", tags=["scenario"])

# run_id -> {"status": running/done/failed/conflict, ...}
_runs: dict[str, dict] = {}
_runs_lock = threading.Lock()


class DowntimeOverride(BaseModel):
    machine_id: str
    start: datetime
    end: datetime
    reason: str = ""


class ScenarioSolveRequest(BaseModel):
    name: str = Field(..., min_length=1)
    kind: str = Field(default="baseline", pattern="^(baseline|simulation)$")
    base_scenario_id: int | None = None
    schedule_start: datetime | None = None
    time_limit_seconds: float = Field(default=20.0, gt=0)
    weights: ObjectiveWeights | None = None
    solver_params: SolverParams | None = None
    # 模拟项
    extra_downtimes: list[DowntimeOverride] = Field(default_factory=list)
    freeze_progress: bool = Field(
        default=False, description="按报工记录冻结已开工/完工工序"
    )


class RunStatus(BaseModel):
    run_id: str
    status: str  # running / done / failed / conflict
    scenario_id: int | None = None
    error: str | None = None
    conflicts: list[Conflict] = Field(default_factory=list)


def _execute(run_id: str, body: ScenarioSolveRequest) -> None:
    session = open_session()
    try:
        request = crud.load_schedule_request(
            session,
            schedule_start=body.schedule_start,
            weights=body.weights or ObjectiveWeights(),
            time_limit_seconds=body.time_limit_seconds,
        )
        request.solver_params = body.solver_params

        extra: dict[str, list[TimeWindow]] = {}
        for d in body.extra_downtimes:
            s = crud.minutes_from(request.schedule_start, d.start)
            e = crud.minutes_from(request.schedule_start, d.end)
            if e > s:
                extra.setdefault(d.machine_id, []).append(TimeWindow(start=s, end=e))

        frozen = (
            scenario_mod.build_frozen_from_progress(session, request)
            if body.freeze_progress else {}
        )
        now = crud.minutes_from(
            request.schedule_start, datetime.now()
        ) if body.freeze_progress else 0

        if frozen or extra:
            result, conflicts = solve_with_freeze(
                request, frozen, now=now, extra_downtimes=extra,
            )
            if conflicts:
                with _runs_lock:
                    _runs[run_id] = {
                        "status": "conflict",
                        "conflicts": [c.model_dump() for c in conflicts],
                    }
                return
        else:
            result = solve(request)

        if result.status in ("INFEASIBLE", "MODEL_INVALID", "UNKNOWN"):
            with _runs_lock:
                _runs[run_id] = {
                    "status": "failed",
                    "error": f"求解失败: {result.status}",
                }
            return

        summary = scenario_mod.save_scenario(
            session, name=body.name, kind=body.kind, result=result,
            schedule_start=request.schedule_start,
            base_scenario_id=body.base_scenario_id,
            frozen_ids=set(frozen),
        )
        session.commit()
        with _runs_lock:
            _runs[run_id] = {"status": "done", "scenario_id": summary.id}
    except Exception as e:  # noqa: BLE001 - 后台线程兜底上报
        session.rollback()
        with _runs_lock:
            _runs[run_id] = {"status": "failed", "error": str(e)}
    finally:
        session.close()


@router.post("/scenarios/solve", response_model=RunStatus)
def solve_scenario(body: ScenarioSolveRequest, sync: bool = Query(False)):
    run_id = uuid.uuid4().hex[:12]
    with _runs_lock:
        _runs[run_id] = {"status": "running"}
    if sync:
        _execute(run_id, body)
    else:
        threading.Thread(target=_execute, args=(run_id, body), daemon=True).start()
    with _runs_lock:
        state = dict(_runs[run_id])
    return RunStatus(run_id=run_id, **state)


@router.get("/runs/{run_id}", response_model=RunStatus)
def get_run(run_id: str):
    with _runs_lock:
        state = _runs.get(run_id)
    if state is None:
        raise HTTPException(404, f"求解任务 {run_id} 不存在")
    return RunStatus(run_id=run_id, **state)


@router.get("/scenarios", response_model=list[ScenarioSummary])
def list_scenarios(session: Session = Depends(get_session)):
    return scenario_mod.list_scenarios(session)


@router.get("/scenarios/compare", response_model=ScenarioCompare)
def compare(a: int, b: int, session: Session = Depends(get_session)):
    cmp = scenario_mod.compare_scenarios(session, a, b)
    if cmp is None:
        raise HTTPException(404, "方案不存在")
    return cmp


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetail)
def get_scenario(scenario_id: int, session: Session = Depends(get_session)):
    detail = scenario_mod.get_scenario(session, scenario_id)
    if detail is None:
        raise HTTPException(404, f"方案 {scenario_id} 不存在")
    return detail


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int, session: Session = Depends(get_session)):
    if not scenario_mod.delete_scenario(session, scenario_id):
        raise HTTPException(404, f"方案 {scenario_id} 不存在")
    return {"deleted": scenario_id}


class ProgressBody(BaseModel):
    state: str = Field(..., pattern="^(pending|started|done)$")
    actual_start: datetime | None = None
    actual_machine_id: str | None = None


@router.post("/operations/{operation_id}/progress")
def report_progress(
    operation_id: str, body: ProgressBody, session: Session = Depends(get_session)
):
    try:
        scenario_mod.set_progress(
            session, operation_id, body.state, body.actual_start,
            body.actual_machine_id,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"operation_id": operation_id, "state": body.state}
