"""ACR Engine — AI Content Radar 的纯算法内核。

本包刻意保持**零三方依赖**（仅用 Python 标准库），目的是：

1. 让全部分析 / 评分 / 生成算法可被独立单元测试，不需要数据库、
   网络或任何 AI Key 即可在 CI 中运行；
2. 让 FastAPI（apps/api）、Celery worker（apps/worker）只做"编排 + IO"，
   把业务规则下沉到这里，符合六边形架构（端口与适配器）。

模块划分对应产品的十大功能模块：

    collect      模块1  内容采集中心（解析 / 归一化 / 去重）
    analysis     模块2/3/4  爆款规律 / 同质化 / 评论情绪
    opportunity  模块5  蓝海机会发现（Opportunity Score）
    generation   模块6/7/8/9  选题 / 小说 / 短剧 / 视频提示词
    prediction   模块10 增长预测（0-100 内容评分）
    llm          多模型 Provider 抽象（OpenAI / Claude / Gemini / Mock）
"""

__version__ = "0.1.0"

from .models import ContentItem, Comment  # noqa: F401
