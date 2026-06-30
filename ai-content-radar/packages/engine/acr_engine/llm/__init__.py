"""多模型 LLM Provider 抽象。

Provider 是一个端口（Protocol），具体实现可以是 OpenAI / Claude / Gemini /
本地模型 / Mock。引擎只依赖 `LLMProvider.complete()`，方便：
  - 离线/CI 用 MockProvider（确定性、零网络）；
  - 线上按成本/质量在多模型间路由（见 router.py 思路）。
"""
from .base import LLMProvider, LLMMessage, MockProvider, get_provider  # noqa: F401
