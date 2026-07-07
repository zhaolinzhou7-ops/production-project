"""应用配置 —— 12-Factor，全部经环境变量注入。"""
from __future__ import annotations

from functools import lru_cache

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # 兜底：未装 pydantic-settings 时降级为最小实现
    import os

    class BaseSettings:  # type: ignore
        def __init__(self, **_: object) -> None:
            for k, v in self.__class__.__dict__.items():
                if not k.startswith("_") and not callable(v):
                    setattr(self, k, os.getenv(k.upper(), v))

    def SettingsConfigDict(**_: object) -> dict:  # type: ignore
        return {}


class Settings(BaseSettings):
    app_name: str = "AI Content Radar API"
    env: str = "dev"
    api_v1_prefix: str = "/api/v1"

    # 数据存储
    database_url: str = "postgresql+asyncpg://acr:acr@localhost:5432/acr"
    redis_url: str = "redis://localhost:6379/0"
    qdrant_url: str = "http://localhost:6333"

    # LLM Provider（按需注入真实 Key）
    default_llm_provider: str = "mock"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""

    # 安全
    jwt_secret: str = "change-me-in-prod"
    jwt_expire_minutes: int = 60 * 24

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")  # type: ignore


@lru_cache
def get_settings() -> Settings:
    return Settings()
