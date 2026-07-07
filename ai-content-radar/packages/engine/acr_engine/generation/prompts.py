"""模块9 · AI 视频提示词系统。

把一个分镜 Shot 编译成各家视频/图像模型可直接使用的提示词，统一注入
"电影感 / 国风审美 / 高一致性 / 高质量镜头语言"风格基底，并按目标模型
的语法习惯做适配（Veo/Runway/Kling/即梦/Grok/GPT-Image）。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from .script import Shot

# 统一风格基底（保证跨镜头一致性）
STYLE_BASE = (
    "cinematic, Chinese aesthetic 国风, ultra-detailed, volumetric lighting, "
    "shallow depth of field, 8k, film grain, consistent character design"
)

# 各模型语法适配器
_TARGETS = {
    "veo": "镜头描述 + 运镜 + 时长，强调连贯运动",
    "runway": "image-to-video 风格，强调 motion brush 区域与相机路径",
    "kling": "中文自然语言，强调人物表情与动作连贯",
    "jimeng": "中文，国风审美，强调画面构图与色彩",  # 即梦
    "grok": "简洁英文 prompt，强调主体与氛围",
    "gpt_image": "英文，强调构图/光线/材质，适合关键帧",
}


@dataclass
class VideoPrompt:
    shot_index: int
    target: str
    prompt: str
    negative_prompt: str = "low quality, distorted face, extra fingers, inconsistent character"

    def to_dict(self) -> dict:
        return self.__dict__


def _camera_en(cam: str) -> str:
    return {
        "推": "slow push-in", "拉": "pull-out", "摇": "pan",
        "移": "tracking shot", "跟": "follow shot", "升降": "crane up",
    }.get(cam, "static")


def _size_en(size: str) -> str:
    return {
        "大全景": "extreme wide shot", "全景": "wide shot", "全": "wide shot",
        "中景": "medium shot", "近景": "medium close-up", "特写": "close-up",
    }.get(size, "medium shot")


def compile_prompt(shot: Shot, target: str, *, character_lock: str = "") -> VideoPrompt:
    """把单个镜头编译成指定模型的提示词。

    character_lock：人物一致性锚点（如固定外貌描述/seed 提示），跨镜头复用。
    """
    target = target.lower()
    size_en = _size_en(shot.shot_size)
    cam_en = _camera_en(shot.camera)
    lock = f", {character_lock}" if character_lock else ""

    core = (
        f"{size_en}, {cam_en}. Scene: {shot.scene}. Action: {shot.action}. "
        f"{STYLE_BASE}{lock}. Duration ~{shot.duration_sec:.0f}s."
    )
    if target in ("kling", "jimeng"):  # 中文模型给中文 prompt
        core = (
            f"{shot.shot_size}，{shot.camera}镜头。场景：{shot.scene}。"
            f"动作：{shot.action}。风格：电影感、国风审美、高质量镜头语言、"
            f"人物一致{('，' + character_lock) if character_lock else ''}。"
            f"时长约{shot.duration_sec:.0f}秒。"
        )
    return VideoPrompt(shot_index=shot.index, target=target, prompt=core)


def generate_video_prompts(
    shots: Iterable[Shot],
    targets: Iterable[str] | None = None,
    *,
    character_lock: str = "黑发少年，玄色长袍，剑眉星目",
) -> list[VideoPrompt]:
    """为一组镜头 × 一组目标模型批量生成提示词。"""
    targets = list(targets or ["veo", "kling", "jimeng"])
    out: list[VideoPrompt] = []
    for shot in shots:
        for t in targets:
            out.append(compile_prompt(shot, t, character_lock=character_lock))
    return out
