# 08 · 完整项目代码结构

Monorepo，三应用 + 一内核 + 基础设施，遵循六边形架构。

```
ai-content-radar/
├── README.md                       # 产品总览 + 快速开始
│
├── packages/                       # ★ 可复用内核（与框架解耦）
│   └── engine/                     # acr-engine：零三方依赖，可独立测试
│       ├── pyproject.toml
│       └── acr_engine/
│           ├── __init__.py
│           ├── models.py           # 领域模型 ContentItem/Comment/TrackStat
│           ├── pipeline.py         # 端到端闭环编排（洞察→生产）
│           ├── collect/            # 模块1 采集中心
│           │   └── normalize.py    #   多平台字段映射 + 去重
│           ├── analysis/           # 模块2/3/4
│           │   ├── lexicon.py      #   领域词库（钩子/流派/情绪）
│           │   ├── title_patterns.py  # 模块2 爆款规律
│           │   ├── homogeneity.py  #   模块3 同质化/红海地图
│           │   └── sentiment.py    #   模块4 评论情绪/需求雷达
│           ├── opportunity/        # 模块5
│           │   └── scoring.py      #   Opportunity Score + 蓝海发现
│           ├── generation/         # 模块6/7/8/9
│           │   ├── topics.py       #   模块6 选题生成器
│           │   ├── novel.py        #   模块7 小说(世界观/大纲/章节/一致性)
│           │   ├── script.py       #   模块8 分镜脚本
│           │   └── prompts.py      #   模块9 视频提示词(多模型适配)
│           ├── prediction/         # 模块10
│           │   └── virality.py     #   增长预测 + 0-100 评分
│           └── llm/                # 多模型 Provider 抽象
│               └── base.py         #   LLMProvider 端口 + MockProvider
│
├── apps/
│   ├── api/                        # FastAPI 应用（HTTP 编排）
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── app/
│   │       ├── main.py             # 入口：中间件 + 路由装配
│   │       ├── core/config.py      # 12-Factor 配置
│   │       ├── api/v1/router.py    # 十大模块 REST 端点
│   │       ├── schemas/analysis.py # Pydantic DTO
│   │       ├── models/orm.py       # SQLAlchemy ORM
│   │       ├── db/                 # 会话/迁移装配
│   │       └── services/           # 应用服务（落库、采集编排、鉴权）
│   │
│   ├── worker/                     # Celery 异步层
│   │   └── worker/
│   │       ├── celery_app.py       # Celery + Beat 定时
│   │       └── tasks.py            # 采集/分析/生成/闭环任务
│   │
│   └── web/                        # Next.js 14 控制台
│       ├── package.json
│       ├── next.config.mjs
│       ├── tsconfig.json
│       └── src/
│           ├── app/
│           │   ├── layout.tsx      # 导航骨架
│           │   └── page.tsx        # 总览 Dashboard（一键闭环）
│           ├── components/         # 图表/卡片/表格（按页扩展）
│           └── lib/api.ts          # 后端 v1 客户端
│
├── infra/                          # 基础设施
│   ├── docker-compose.yml          # API+Worker+Web+PG+Redis+Qdrant
│   └── postgres/init.sql           # 初始化 DDL
│
├── tests/
│   └── test_engine.py              # 11 个引擎单测（python3 -m unittest）
│
└── docs/                           # 8 份设计交付物
    ├── 01-architecture.md
    ├── 02-database-design.md
    ├── 03-api-design.md
    ├── 04-ui-prototypes.md
    ├── 05-roadmap.md
    ├── 06-mvp.md
    ├── 07-enterprise.md
    └── 08-project-structure.md
```

## 模块 → 代码 映射速查

| 产品模块 | 引擎实现 | API 端点 | 数据表 |
|----------|----------|----------|--------|
| 1 采集 | `collect/normalize.py` | `/collect/normalize` | `contents` |
| 2 爆款规律 | `analysis/title_patterns.py` | `/hot/analyze` | `contents` |
| 3 同质化 | `analysis/homogeneity.py` | `/homogeneity/analyze` | `tracks` |
| 4 评论情绪 | `analysis/sentiment.py` | `/sentiment/analyze` | `comments` |
| 5 蓝海机会 | `opportunity/scoring.py` | `/opportunity/discover` | `opportunities` |
| 6 选题 | `generation/topics.py` | `/topics/generate` | `topics` |
| 7 小说 | `generation/novel.py` | `/novel/bible` | `novel_chapters` |
| 8 分镜 | `generation/script.py` | `/storyboard/generate` | `storyboards/shots` |
| 9 视频提示词 | `generation/prompts.py` | `/storyboard/generate` | `video_prompts` |
| 10 增长预测 | `prediction/virality.py` | `/virality/predict` | `scores` |
| 闭环 | `pipeline.py` | `/pipeline/run` | `projects` |

## 约定
- **业务规则只进 `packages/engine`**；`apps/*` 不写算法，只做 IO/编排/展示。
- 新增平台 = 加一张 `FIELD_MAP`；新增模型 = 实现一个 `LLMProvider`；
  新增评分模型 = 复用 `ViralityInput` 契约——均无需改调用方。
- 测试优先覆盖内核（纯函数、确定性、零依赖），CI 秒级反馈。
```bash
python3 -m unittest discover tests -v   # 全绿
```
