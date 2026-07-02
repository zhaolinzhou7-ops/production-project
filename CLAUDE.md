# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An automatic production scheduling system (自动排产系统) for discrete manufacturing, solving the Flexible Job Shop Scheduling Problem (FJSP) with Google OR-Tools CP-SAT. A FastAPI backend exposes the solver over HTTP and serves a vanilla-JS frontend that renders results as an SVG Gantt chart.

All docstrings, comments, UI text, and the README are in **Chinese** — keep new comments and user-facing strings consistent with that.

## Commands

```bash
pip install -r requirements.txt        # install dependencies
./run.sh                               # start server at http://127.0.0.1:8000 (uvicorn backend.main:app)
python3 -m pytest tests/ -q            # run all tests
python3 -m pytest tests/test_scheduler.py::test_precedence_respected -q   # run a single test
```

Run pytest from the repo root — `tests/test_scheduler.py` inserts the repo root into `sys.path` to import the `backend` package. There is no linter, formatter config, or frontend build step.

Tests invoke the real CP-SAT solver with time limits (up to 8s per solve). The sample problem usually solves to optimality in well under a second, but harder inputs can run up to the time limit.

## Architecture

Request flow: `frontend/app.js` → `POST /api/schedule` (`backend/main.py`) → `ScheduleRequest` (Pydantic, `backend/models.py`) → `solve()` (`backend/scheduler.py`) → `ScheduleResult` → Gantt/KPI rendering in the browser.

- **`backend/models.py`** — Pydantic v2 domain models: `Machine`, `Operation`, `Order`, `ObjectiveWeights`, plus request/result schemas. These double as the API contract (FastAPI response models) and the solver's input. Validators enforce non-empty eligible machines and sort operations by `sequence` on construction.
- **`backend/scheduler.py`** — the CP-SAT model, all in one `solve()` function:
  - Each (operation, eligible machine) pair gets an **optional interval variable**; exactly one presence is true per operation, and the operation's global start/end are aligned to the chosen machine's interval via `OnlyEnforceIf`.
  - Precedence within an order uses the pre-sorted `operations` list; machines get `AddNoOverlap` plus **pairwise** sequence-dependent setup constraints (a `both`-selected bool and an `i_before_j` ordering bool per pair — this is O(n²) per machine, the main scaling bottleneck).
  - Objective = weighted sum of makespan, priority-weighted tardiness, and total changeover, **minus** total busy time (subtracting busy time rewards utilization). Weights are floats scaled by `SCALE = 100` to integers because CP-SAT needs an integer objective; `objective_value` in results is divided back by `SCALE`.
  - On INFEASIBLE/UNKNOWN the function returns an empty `ScheduleResult` with the status string rather than raising.
  - The per-operation `setup` field in results is back-filled *after* solving by replaying each machine's schedule in start-time order — it is not read from solver variables.
- **`backend/main.py`** — thin FastAPI layer: `/api/health`, `/api/sample` (returns `backend/sample_data.py` demo data), `/api/schedule`, and static serving of `frontend/` with `index.html` at `/`.
- **`frontend/`** — no framework, no dependencies. `app.js` posts the schedule request (weights and time limit read from form inputs) and renders the SVG Gantt chart, order table, and utilization KPIs directly.

## Conventions

- All times are **integer minutes** from t=0 (`due_date`, `release_time`, durations, setup times). There are no dates or timezones anywhere.
- Sequence-dependent changeover is modeled per machine as a product-family transition matrix `setup_times[from_family][to_family]`; missing entries and same-family transitions cost 0 (`Machine.setup_time`).
- When changing solver behavior, update or extend `tests/test_scheduler.py` — the tests verify structural properties of the output (precedence, no overlap incl. setup, machine eligibility, weight monotonicity) rather than exact schedules, since CP-SAT results can vary within the time limit.
