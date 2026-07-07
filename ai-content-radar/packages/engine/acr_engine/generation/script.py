"""模块8 · 短剧生成系统 —— 分镜脚本。

把一段剧情拆成 Shot（镜头）序列，每个镜头带：景别、机位运动、场景、
人物动作、对白、旁白、转场。结构化输出便于直接对接模块9 的视频提示词。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..llm import LLMProvider, LLMMessage, get_provider


@dataclass
class Shot:
    index: int
    shot_size: str       # 景别：大全/全/中/近/特写
    camera: str          # 机位运动：推/拉/摇/移/跟/升降
    scene: str           # 场景描述
    action: str          # 人物动作
    dialogue: str = ""   # 对白
    voiceover: str = ""  # 旁白
    transition: str = "硬切"  # 转场
    duration_sec: float = 3.0

    def to_dict(self) -> dict:
        return self.__dict__


@dataclass
class Storyboard:
    title: str
    logline: str
    shots: list[Shot] = field(default_factory=list)

    @property
    def total_duration(self) -> float:
        return sum(s.duration_sec for s in self.shots)

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "logline": self.logline,
            "total_duration": round(self.total_duration, 1),
            "shots": [s.to_dict() for s in self.shots],
        }


# 一个"打脸爽点"标准镜头节奏模板（黄金 30s 短剧）
_SHOT_TEMPLATE = [
    ("特写", "推", "悬念物件/表情", "主角低头隐忍", 2.5),
    ("中景", "跟", "冲突现场", "反派挑衅、众人围观", 3.0),
    ("近景", "摇", "对峙", "主角抬眼，眼神转冷", 2.5),
    ("全景", "移", "局势反转", "主角出手/亮出身份", 4.0),
    ("特写", "拉", "反派震惊脸", "反派后退、跌坐", 2.5),
    ("大全景", "升降", "气势收束", "主角转身离场", 3.5),
]


def generate_storyboard(
    title: str,
    logline: str,
    *,
    beats: list[str] | None = None,
    provider: LLMProvider | None = None,
) -> Storyboard:
    """生成分镜。beats 为剧情节拍；缺省用标准打脸节奏模板。

    无 Key 时基于模板产出确定性分镜；有 Key 时用 LLM 丰富对白/旁白。
    """
    provider = provider or get_provider("mock")
    shots: list[Shot] = []

    template = _SHOT_TEMPLATE
    if beats:
        # 把每个节拍映射到一个镜头，循环复用机位模板保证镜头语言多样
        template = [
            _SHOT_TEMPLATE[i % len(_SHOT_TEMPLATE)] for i in range(len(beats))
        ]

    for i, (size, cam, scene, action, dur) in enumerate(template):
        beat = beats[i] if beats and i < len(beats) else scene
        dialogue = _ask(provider, f"为短剧《{title}》镜头「{beat}」写一句有张力的对白(≤20字)")
        vo = _ask(provider, f"为镜头「{beat}」写一句旁白(≤16字)")
        shots.append(
            Shot(
                index=i + 1,
                shot_size=size,
                camera=cam,
                scene=beat,
                action=action,
                dialogue=dialogue,
                voiceover=vo,
                transition="叠化" if i % 3 == 2 else "硬切",
                duration_sec=dur,
            )
        )

    return Storyboard(title=title, logline=logline, shots=shots)


def _ask(provider: LLMProvider, user: str) -> str:
    return provider.complete(
        [LLMMessage("system", "你是短剧分镜导演，语言精炼有镜头感。"),
         LLMMessage("user", user)],
        temperature=0.7,
        max_tokens=64,
    )
