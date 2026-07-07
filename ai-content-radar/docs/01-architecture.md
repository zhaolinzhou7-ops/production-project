# 01 · 系统架构

## 1. 架构总览

采用**六边形架构（端口与适配器）+ 事件驱动**：算法内核 `acr_engine`
位于核心、零外部依赖；采集、存储、LLM、Web 都是可替换的适配器。

```mermaid
flowchart TB
    subgraph Clients[客户端]
        WEB[Next.js 控制台]
        API_C[开放 API / 第三方]
    end

    subgraph Edge[接入层]
        GW[API Gateway / Nginx<br/>限流·鉴权·CORS]
    end

    subgraph App[应用层 apps/api · FastAPI]
        AUTH[Auth / RBAC]
        REST[REST v1 路由<br/>十大模块]
        ORCH[工作流编排器]
    end

    subgraph Core[领域内核 packages/engine · 零依赖]
        COLLECT[collect 采集归一化]
        ANALYSIS[analysis 爆款/同质化/情绪]
        OPP[opportunity 蓝海评分]
        GEN[generation 选题/小说/分镜/提示词]
        PRED[prediction 增长预测]
        PIPE[pipeline 闭环编排]
    end

    subgraph Async[异步层 apps/worker · Celery]
        BEAT[Beat 定时]
        TASKS[采集/分析/生成任务]
    end

    subgraph Data[数据层]
        PG[(PostgreSQL<br/>结构化)]
        QD[(Qdrant<br/>向量)]
        RD[(Redis<br/>队列/缓存)]
        OBJ[(对象存储<br/>视频/图片)]
    end

    subgraph External[外部能力]
        CRAWL[采集器<br/>抖音/快手/小红书/B站/YT]
        LLM[LLM Providers<br/>OpenAI/Claude/Gemini]
        VIDEO[视频生成<br/>Veo/Runway/Kling/即梦]
    end

    WEB & API_C --> GW --> AUTH --> REST --> ORCH
    ORCH --> Core
    ORCH -->|enqueue| RD --> TASKS
    BEAT --> TASKS
    TASKS --> Core
    TASKS --> CRAWL
    Core --> LLM
    Core -. 提示词 .-> VIDEO
    App & Async --> PG & QD & OBJ
    Core --> QD
```

## 2. 数据流：从洞察到生产

```mermaid
sequenceDiagram
    participant U as 运营
    participant API as FastAPI
    participant W as Celery Worker
    participant E as acr_engine
    participant DB as Postgres/Qdrant
    participant L as LLM

    Note over W: 每日 03:00 定时
    W->>E: collect.normalize + dedup（多平台原始数据）
    E-->>DB: 落统一内容库 + 写向量
    W->>E: analyze_titles / cluster_tracks / analyze_comments
    W->>E: discover_blue_oceans（高需求·低供给）
    E-->>DB: 落赛道快照 + 蓝海机会
    U->>API: 选定蓝海赛道，请求选题
    API->>E: generate_topics(track, cross)
    E-->>U: 100 个差异化选题（含创新指数/竞争度）
    U->>API: 选定选题 → 生产
    API->>W: enqueue run_pipeline_task
    W->>E: novel/storyboard/prompts（注入一致性人物卡）
    E->>L: complete()（可降级 MockProvider）
    W->>E: predict_virality → 0-100 内容评分
    E-->>DB: 落 Project（bible/storyboard/prompts/score）
    DB-->>U: 控制台展示成片素材包
```

## 3. 分层职责

| 层 | 目录 | 职责 | 依赖 |
|----|------|------|------|
| 领域内核 | `packages/engine` | 全部业务规则与算法 | **无三方依赖** |
| 应用层 | `apps/api` | HTTP、鉴权、编排、DTO 转换 | engine + FastAPI |
| 异步层 | `apps/worker` | 采集/分析/生成的长任务、定时 | engine + Celery |
| 表现层 | `apps/web` | 可视化、交互、报告下载 | API |
| 数据层 | PG/Qdrant/Redis/OBJ | 持久化、向量检索、队列、素材 | - |

**关键收益**：内核零依赖 ⇒ 同一份算法可在 FastAPI、Celery、Jupyter、
Serverless、CI 中无差别运行，并被 11 个单元测试覆盖。

## 4. 多 Agent 协同

工作流编排器把生产拆为可协同的 Agent，经黑板（Project.payload）共享上下文：

```mermaid
flowchart LR
    INSIGHT[洞察 Agent<br/>选定蓝海] --> TOPIC[选题 Agent]
    TOPIC --> WRITER[小说 Agent<br/>RAG+一致性]
    WRITER --> DIRECTOR[分镜 Agent]
    DIRECTOR --> PROMPT[提示词 Agent]
    PROMPT --> CRITIC[评分 Agent]
    CRITIC -->|评分<阈值| TOPIC
    CRITIC -->|达标| OUT[素材包出库]
```

- **共享记忆**：RAG 知识库（Qdrant）保存世界观 Bible、人物卡、历史爆款样本。
- **反馈闭环**：评分 Agent 不达标时回退重选/重写，形成自优化循环。

## 5. RAG 知识库

```mermaid
flowchart LR
    SRC[爆款样本 / 世界观 / 人物卡 / 行业知识] --> EMB[Embedding<br/>本地模型或 API]
    EMB --> QD[(Qdrant 集合)]
    QGEN[生成请求] --> RET[向量检索 Top-K]
    QD --> RET --> CTX[拼装上下文] --> LLM[LLM 生成]
```

集合划分：`hot_samples`（爆款语料）、`story_bible`（设定/人物，保证一致性）、
`domain_kb`（行业知识）。详见 02-数据库设计。

## 6. 非功能性

| 维度 | 方案 |
|------|------|
| 可观测 | 结构化日志 + OpenTelemetry trace + Prometheus 指标 |
| 弹性 | Worker 水平扩缩；任务幂等 + 重试 + 死信队列 |
| 安全 | JWT + RBAC + 行级多租户隔离 + 审计日志 |
| 成本 | LLM 多模型路由（按难度选模型）+ 结果缓存 + 批处理 |
| 合规 | 采集遵守平台条款/robots；数据脱敏；可溯源 |
