"""LLM Provider 端口与内置实现。

线上 Provider（OpenAI/Claude/Gemini）放在 apps/api 侧注入真实 SDK；
引擎只保证契约和一个可离线运行的 MockProvider。
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class LLMMessage:
    role: str   # "system" | "user" | "assistant"
    content: str


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    def complete(
        self,
        messages: list[LLMMessage],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        ...


class MockProvider:
    """确定性 Mock：用 prompt 的 hash 产生稳定占位文本。

    用于：单元测试、本地无 Key 演示、生成模块的兜底降级。
    不联网、可重现。
    """

    name = "mock"

    def complete(
        self,
        messages: list[LLMMessage],
        *,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str:
        joined = "\n".join(f"{m.role}:{m.content}" for m in messages)
        digest = hashlib.sha256(joined.encode("utf-8")).hexdigest()[:8]
        user = next((m.content for m in reversed(messages) if m.role == "user"), "")
        return f"[mock:{digest}] 基于输入生成的占位内容 :: {user[:60]}"


# 简单的 Provider 注册表（线上由 DI 容器替换）
_REGISTRY: dict[str, LLMProvider] = {"mock": MockProvider()}


def register_provider(provider: LLMProvider) -> None:
    _REGISTRY[provider.name] = provider


def get_provider(name: str = "mock") -> LLMProvider:
    return _REGISTRY.get(name, _REGISTRY["mock"])
