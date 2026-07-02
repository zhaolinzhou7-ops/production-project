"""数据库引擎与会话管理 (SQLite + SQLAlchemy 2.0)。

默认数据库文件: <项目根>/data/aps.db, 可用环境变量 APS_DB_URL 覆盖。
SQLite 需显式开启外键约束 (PRAGMA foreign_keys=ON)。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .orm import Base

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_URL = os.environ.get("APS_DB_URL", f"sqlite:///{DATA_DIR / 'aps.db'}")

_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def _enable_foreign_keys(dbapi_conn, _record) -> None:
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def create_db_engine(url: str = DEFAULT_URL) -> Engine:
    """建引擎并建表。SQLite 文件目录不存在时自动创建。"""
    path = url.removeprefix("sqlite:///")
    kwargs: dict = {}
    if url.startswith("sqlite:///") and path != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    elif path == ":memory:":
        # 内存库必须共享单一连接, 否则每个连接/线程各自一个空库 (测试用)
        kwargs["poolclass"] = StaticPool
    # check_same_thread=False: FastAPI 线程池 + M4 后台求解线程需要跨线程使用连接
    engine = create_engine(url, connect_args={"check_same_thread": False}, **kwargs)
    event.listens_for(engine, "connect")(_enable_foreign_keys)
    Base.metadata.create_all(engine)
    return engine


def init_app_db(url: str = DEFAULT_URL) -> Engine:
    """初始化全局引擎 (应用启动时调用一次)。"""
    global _engine, _session_factory
    _engine = create_db_engine(url)
    _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Iterator[Session]:
    """FastAPI 依赖: 每请求独立 session, 成功提交、异常回滚。"""
    if _session_factory is None:
        init_app_db()
    session = _session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
