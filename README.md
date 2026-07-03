# 智能排产系统 (航空零部件 · 柔性作业车间)

面向**航空零部件离散制造**的智能排产系统。基于
[Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
约束求解器, 将订单按工序自动分配到合格机台并排定先后, 兼顾**最短完工时间、
按时交付、减少换型、设备利用率**四个目标, 支持数百订单规模、班次日历、
外协工序、急单/停机模拟与冻结重排。

## 功能特性

**排产引擎**
- 柔性机台分配 + 工序顺序约束 + 顺序相关换型 (AddCircuit 建模, 支持大规模)
- 多目标加权优化: makespan / 加权拖期 / 换型总量 / 机台空闲
- 贪心启发式初始解 (完整 hint), 超时兜底返回可行方案 (HEURISTIC)
- 滚动时域分解: 候选对数超阈值自动按交期分批求解

**航空特有约束**
- 班次/工作日历 (周班次规则 + 节假日/加班例外), 停机计划; 工序不可中断,
  自动避开不可用窗; 换型允许落在停机时段
- 外协工序 (热处理/表面处理等固定周期, 不占内部机台, 独立泳道展示)
- 第二资源约束 (工装/专用人员, AddCumulative 容量限制)

**数据管理**
- SQLite 持久化 (SQLAlchemy 2.0), 机台/订单/工艺路线/日历/资源界面维护
- Excel 模板导入 (全有或全无, 逐行错误报告) 与模板下载

**动态重排**
- 报工 (pending/started/done) -> 冻结已开工工序增量重排
- 急单插入 / 新增停机模拟, 与基准方案对比 (订单交期 diff + KPI)
- 冲突预检: 停机窗撞冻结工序等问题返回结构化清单, 而非黑盒 INFEASIBLE
- 方案持久化 + 后台求解 (run_id 轮询)

**报表预警**
- 交期红黄绿预警看板 (富余不足 8h 为黄)
- 准交率 / 设备利用率 KPI, 方案结果导出 Excel (明细/交付/利用三表)

## 技术栈

| 层 | 技术 |
|----|------|
| 排产引擎 | Python + OR-Tools CP-SAT |
| 后端 API | FastAPI + Uvicorn + SQLAlchemy 2.0 (SQLite) |
| Excel | openpyxl |
| 前端 | 原生 HTML / CSS / JS (SVG 甘特图, 无构建依赖) |
| 数据模型 | Pydantic v2 |

## 目录结构

```
backend/
  models.py         # 领域模型 (Machine/Operation/Order/TimeWindow/Resource/结果)
  scheduler.py      # CP-SAT 排产引擎 (Circuit 换型 + 日历哑区间 + Cumulative)
  heuristic.py      # 贪心启发式 (hint / 兜底 / 时域收紧)
  decompose.py      # 滚动时域分解
  calendar_utils.py # 班次日历展开与校验
  reschedule.py     # 冻结增量重排 + 冲突预检
  scenario.py       # 方案持久化/对比, 报工
  reports.py        # KPI 与交期预警
  db.py / orm.py / crud.py / schemas.py / excel_io.py   # 数据层
  api_data.py / api_scenario.py / api_reports.py        # API 路由
  main.py           # FastAPI 服务入口
frontend/
  index.html        # 四页签: 排产 / 基础数据 / 方案 / 报表
  gantt.js          # 共享甘特组件 (停机底纹/外协泳道/冻结虚线/日期轴)
  app.js / data.js / scenarios.js / reports.js / api.js / styles.css
tests/              # 61+ 测试 (求解器/数据层/API/重排/报表; slow 标记大规模用例)
scripts/benchmark.py  # 规模基准
run.sh              # 一键启动
```

## 快速开始

```bash
pip install -r requirements.txt    # 安装依赖
./run.sh                           # 启动服务
# 浏览器打开 http://127.0.0.1:8000
```

典型流程:
1. **基础数据**页: 下载 Excel 模板 -> 填入机台/换型矩阵/订单/工艺路线/日历/资源 -> 上传导入 (或界面逐条维护);
2. **排产**页: 「从数据库加载」-> 调整权重 -> 「开始排产」, 甘特图带停机底纹与外协泳道;
3. **方案**页: 求解并保存基准方案; 插急单 (基础数据页新增 rush 订单)、模拟停机、冻结已报工工序后再求解, 与基准对比交期影响;
4. **报表**页: 选方案生成交期预警看板与 KPI, 导出 Excel。

运行测试:

```bash
python3 -m pytest tests/ -q -m "not slow"   # 快速回归
python3 -m pytest tests/ -q                 # 含大规模用例 (约 2 分钟)
python3 scripts/benchmark.py 20             # 规模基准
```

## 主要 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/schedule` | 无状态排产 (向后兼容) |
| GET  | `/api/data/schedule-request` | 从 DB 组装排产请求 (绝对时间->相对分钟) |
| CRUD | `/api/machines` `/api/orders` `/api/calendars` `/api/resources` | 基础数据 |
| PUT  | `/api/machines/{id}/downtimes` | 停机计划 |
| GET/POST | `/api/import/template` `/api/import/excel` | Excel 模板/导入 |
| POST | `/api/scenarios/solve` | 求解并保存方案 (后台线程, run_id 轮询; 支持 extra_downtimes / freeze_progress) |
| GET  | `/api/scenarios` `/api/scenarios/{id}` `/api/scenarios/compare?a=&b=` | 方案列表/详情/对比 |
| POST | `/api/operations/{id}/progress` | 报工 (冻结重排依据) |
| GET  | `/api/reports/kpi` `/api/reports/delivery-risk` | KPI / 交期预警 |
| GET  | `/api/export/scenario/{id}.xlsx` | 方案结果导出 |

## 排产模型说明

求解器为每个 `(工序, 合格机台)` 组合建立**可选区间变量**, 恰好选中一台执行;
同订单工序有先后, 同机台 NoOverlap 不重叠。换型时间用**每机台一个 AddCircuit
回路**建模: 选中弧 `i→j` 即约束 `start_j ≥ end_i + setup(族i→族j)`, 换型总量
为选中弧的线性和。班次外/停机时间是固定哑区间; 外协工序只有
`end = start + 周期` 的时间约束; 第二资源用 AddCumulative 限容量。

目标函数 (加权最小化):

```
minimize  w_makespan·makespan
        + w_tardiness·Σ(优先级·拖期)
        + w_changeover·总换型时间
        + w_idle·Σ(机台首末工序间空闲)
```

时间语义: 数据库存绝对时间 (datetime), 求解器内部只用相对分钟 (int),
换算仅发生在 API/DB 边界 (`schedule_start` 为 t=0 锚点)。
