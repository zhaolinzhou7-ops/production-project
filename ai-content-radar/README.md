# AI Content Radar（AI 爆款内容雷达）

> 利用 AI 自动分析全网短视频内容，发现同质化竞争、挖掘内容空白市场，
> 并自动生成差异化选题、小说、短剧脚本、分镜与视频制作提示词——
> **实现从市场洞察到内容生产的全自动闭环。**

## 一句话价值

> 大多数创作者失败不是因为不会做内容，而是**不知道做什么内容**。
> Content Radar 用数据告诉你「做什么」，再用 AI 帮你「怎么做」。

## 闭环全景

```
全网采集 → 爆款规律 → 同质化(红海) → 评论情绪 → 蓝海机会
                                              │
              内容评分 ← 分镜+提示词 ← 短剧/小说 ← 选题工厂 ←┘
```

## 十大模块

| # | 模块 | 引擎实现 | 产出 |
|---|------|----------|------|
| 1 | 内容采集中心 | `collect/normalize.py` | 统一内容库 |
| 2 | 爆款分析引擎 | `analysis/title_patterns.py` | 《爆款规律报告》 |
| 3 | 同质化分析 | `analysis/homogeneity.py` | 红海赛道地图 |
| 4 | 评论情绪分析 | `analysis/sentiment.py` | 用户需求雷达图 |
| 5 | 蓝海机会发现 | `opportunity/scoring.py` | 《蓝海机会报告》(Opportunity Score) |
| 6 | AI 选题生成器 | `generation/topics.py` | 100 个差异化选题 |
| 7 | 小说生成系统 | `generation/novel.py` | 世界观/大纲/章节(人物一致) |
| 8 | 短剧生成系统 | `generation/script.py` | 分镜脚本 |
| 9 | AI 视频提示词 | `generation/prompts.py` | Veo/Runway/Kling/即梦… 提示词 |
| 10 | 增长预测系统 | `prediction/virality.py` | 0-100 内容评分 + 爆款概率 |

## 仓库结构（Monorepo）

```
ai-content-radar/
├── packages/engine/        # ★ 纯算法内核（零三方依赖，可独立测试）
│   └── acr_engine/
│       ├── collect/        # 模块1
│       ├── analysis/       # 模块2/3/4
│       ├── opportunity/    # 模块5
│       ├── generation/     # 模块6/7/8/9
│       ├── prediction/     # 模块10
│       ├── llm/            # 多模型 Provider 抽象
│       └── pipeline.py     # 端到端闭环编排
├── apps/
│   ├── api/                # FastAPI（HTTP 编排，业务下沉到 engine）
│   ├── worker/             # Celery 异步任务 + 定时调度
│   └── web/                # Next.js 14 控制台
├── infra/                  # docker-compose / Postgres DDL
├── tests/                  # 引擎单元测试（python3 -m unittest）
└── docs/                   # ★ 8 份设计交付物
```

## 设计文档（8 份交付物）

1. [系统架构](docs/01-architecture.md)
2. [数据库设计](docs/02-database-design.md)
3. [API 设计](docs/03-api-design.md)
4. [页面原型](docs/04-ui-prototypes.md)
5. [开发路线图](docs/05-roadmap.md)
6. [MVP 方案](docs/06-mvp.md)
7. [企业级升级方案](docs/07-enterprise.md)
8. [完整项目代码结构](docs/08-project-structure.md)

## 快速开始

### 1. 跑通算法内核（零依赖，30 秒）

```bash
cd ai-content-radar
python3 -m unittest discover tests -v        # 11 个用例全绿
python3 -m demo                               # 见下方一键闭环 demo
```

一键闭环（无需任何 API Key，使用 MockProvider）：

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, "packages/engine")
from datetime import datetime, timedelta
from acr_engine.models import ContentItem, Comment, Platform
from acr_engine.pipeline import run_pipeline
now = datetime.utcnow()
items = [ContentItem(Platform.DOUYIN, f"d{i}", title=f"开局无敌：退婚打脸{i}",
         caption="未婚妻悔婚 系统签到", likes=800+i*10, duration_sec=33,
         published_at=now-timedelta(days=i)) for i in range(12)]
r = run_pipeline(items, [Comment("d0","节奏快 杀伐果断",likes=50)], n_topics=100)
print("蓝海TOP1:", r.blue_oceans[0]["name"], r.blue_oceans[0]["score"])
print("内容评分:", r.virality["score"])
PY
```

### 2. 全栈启动（Docker）

```bash
cd ai-content-radar/infra
docker compose up --build
# API 文档:  http://localhost:8000/docs
# 控制台:    http://localhost:3000
```

接入真实大模型：在 `infra/.env` 设置 `DEFAULT_LLM_PROVIDER=openai`（或 `anthropic`/`gemini`）
及对应 `*_API_KEY` 即可，无需改动业务代码。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | Next.js 14 · TypeScript · Tailwind |
| 后端 | Python 3.11 · FastAPI · Pydantic v2 |
| 算法内核 | 纯 Python（零依赖，便于测试/复用） |
| 数据库 | PostgreSQL 16 |
| 向量库 | Qdrant |
| 任务调度 | Celery · Redis（Beat 定时） |
| 大模型 | OpenAI · Claude · Gemini · 本地 Embedding（Provider 可插拔） |
| 部署 | Docker · Linux · 云服务器 |

## 设计原则

- **六边形架构**：业务规则集中在 `packages/engine`（零依赖、可测试），
  `apps/*` 只做 IO/编排——这让算法在 CI、Notebook、Serverless 中都能复用。
- **可插拔**：LLM Provider、采集器、聚类算法都是端口，可替换不改调用方。
- **可解释**：评分/竞争指数/机会分都是可复核的统计量，而非黑箱。
- **企业级**：多租户、RBAC、审计日志、工作流编排、RAG、自动化测试内建。
