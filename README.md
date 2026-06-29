# 自动排产系统 (Automatic Production Scheduling)

面向**离散制造**的柔性作业车间 (Flexible Job Shop, FJSP) 自动排产系统。基于
[Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
约束求解器，将订单按工序自动分配到合格机台并排定先后，兼顾**最短完工时间、按时交付、
减少换型、设备利用率**四个目标。

## 功能特性

- **柔性机台分配**：一道工序可指定多台合格机台，求解器自动择优分配。
- **工序优先级约束**：同一订单内工序按 `sequence` 严格遵守先后顺序。
- **顺序相关换型时间**：不同产品族切换在各机台上有不同换型耗时，相邻工序自动计入。
- **多目标加权优化**：makespan / 拖期 / 换型 / 空闲四项加权求和，权重可在界面实时调整。
- **甘特图可视化**：SVG 甘特图按机台展示工序与换型段，并给出订单交付情况与设备利用率。

## 技术栈

| 层 | 技术 |
|----|------|
| 排产引擎 | Python + OR-Tools CP-SAT |
| 后端 API | FastAPI + Uvicorn |
| 前端 | 原生 HTML / CSS / JS (SVG 甘特图，无构建依赖) |
| 数据模型 | Pydantic v2 |

## 目录结构

```
backend/
  models.py        # 领域模型 (Machine / Operation / Order / 结果)
  scheduler.py     # CP-SAT 排产引擎
  sample_data.py   # 演示样例数据
  main.py          # FastAPI 服务与路由
frontend/
  index.html       # 排产控制台页面
  app.js           # 调用 API + 渲染甘特图/KPI
  styles.css
tests/
  test_scheduler.py
run.sh             # 一键启动
```

## 快速开始

```bash
pip install -r requirements.txt    # 安装依赖
./run.sh                           # 启动服务
# 浏览器打开 http://127.0.0.1:8000
# 点击「加载样例数据」-> 调整权重 -> 「开始排产」
```

运行测试：

```bash
python3 -m pytest tests/ -q
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health`   | 健康检查 |
| GET  | `/api/sample`   | 返回演示用排产请求数据 |
| POST | `/api/schedule` | 提交 `ScheduleRequest`，返回 `ScheduleResult` |

排产请求示例 (`POST /api/schedule`)：

```json
{
  "machines": [
    {"id": "M1", "name": "CNC 车床",
     "setup_times": {"A": {"A": 0, "B": 30}, "B": {"A": 20, "B": 0}}}
  ],
  "orders": [
    {"id": "J1", "name": "轴承座", "due_date": 300, "priority": 3,
     "operations": [
       {"id": "J1-0", "name": "粗车", "sequence": 0, "family": "A",
        "eligible_machines": {"M1": 40, "M2": 50}}
     ]}
  ],
  "weights": {"makespan": 1, "tardiness": 5, "changeover": 1, "idle": 0.5},
  "time_limit_seconds": 10
}
```

## 排产模型说明

求解器为每个 `(工序, 合格机台)` 组合建立一个**可选区间变量**，约束恰好选中一台机台执行；
同一订单工序遵守先后顺序，同一机台工序两两不重叠，并按产品族转移矩阵插入换型时间。
目标函数为：

```
minimize  w_makespan·makespan
        + w_tardiness·Σ(优先级·拖期)
        + w_changeover·总换型时间
        - w_idle·总占用时间        # 占用越多 => 利用率越高
```

调高某项权重即向该目标倾斜，可在界面多次排产对比不同策略的结果。
