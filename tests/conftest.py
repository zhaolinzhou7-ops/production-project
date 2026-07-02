"""共享 fixture: 内存 SQLite 会话与演示数据。"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.db import create_db_engine  # noqa: E402
from backend.schemas import MachineDTO, OperationDTO, OrderDTO  # noqa: E402


@pytest.fixture()
def session() -> Session:
    engine = create_db_engine("sqlite:///:memory:")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    s = factory()
    yield s
    s.close()
    engine.dispose()


@pytest.fixture()
def sample_machines() -> list[MachineDTO]:
    return [
        MachineDTO(id="M1", name="CNC 车床",
                   setup_times={"A": {"B": 30}, "B": {"A": 20}}),
        MachineDTO(id="M2", name="加工中心",
                   setup_times={"A": {"B": 15}, "B": {"A": 15}}),
    ]


@pytest.fixture()
def sample_order() -> OrderDTO:
    return OrderDTO(
        id="J1", name="轴承座", due_date=datetime(2026, 7, 10, 17, 0), priority=3,
        operations=[
            OperationDTO(seq=0, name="粗车", family="A",
                         machines={"M1": 40, "M2": 50}),
            OperationDTO(seq=1, name="精铣", family="A", machines={"M2": 35}),
        ],
    )
