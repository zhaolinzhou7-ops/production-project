"""模块7 · 小说生成系统 —— 世界观圣经(Bible) + 大纲 + 章节。

为保证"人物一致性"，引入一个轻量的 StoryState（人物卡 + 设定），每次
生成章节都把它注入 prompt，并在生成后回写更新。这是无需向量库即可保证
一致性的工程基线；线上可叠加 RAG（把 Bible 存入 Qdrant 检索）。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..llm import LLMProvider, LLMMessage, get_provider


@dataclass
class Character:
    name: str
    role: str            # 主角/对手/导师...
    traits: list[str] = field(default_factory=list)
    arc: str = ""        # 成长弧线


@dataclass
class NovelBible:
    title: str
    track: str
    worldview: str
    power_system: str                 # 成长体系
    factions: list[str] = field(default_factory=list)
    characters: list[Character] = field(default_factory=list)
    outline: list[str] = field(default_factory=list)   # 章节大纲

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "track": self.track,
            "worldview": self.worldview,
            "power_system": self.power_system,
            "factions": self.factions,
            "characters": [c.__dict__ for c in self.characters],
            "outline": self.outline,
        }


_SYSTEM = (
    "你是顶级网文主编，擅长设计高爽点、强一致性的长篇连载。"
    "输出结构化、可直接进入生产的设定与大纲。"
)


def generate_novel_bible(
    title: str,
    track: str,
    *,
    cross: str | None = None,
    n_chapters: int = 100,
    provider: LLMProvider | None = None,
) -> NovelBible:
    """生成世界观圣经 + N 章大纲。

    无 Key（MockProvider）时也会产出确定性、结构完整的骨架，保证流水线连通。
    """
    provider = provider or get_provider("mock")
    theme = f"{track}{' × ' + cross if cross else ''}"

    worldview = _ask(
        provider,
        f"为《{title}》设计 {theme} 题材的世界观（地理/历史/核心矛盾），200字内。",
    )
    power_system = _ask(
        provider,
        f"为 {theme} 设计清晰可升级的成长体系（境界/等级/资源），150字内。",
    )

    # 主要人物卡（保证一致性的最小集合）
    characters = [
        Character("主角", "主角", ["杀伐果断", "智商在线", "扮猪吃虎"], "废材→无敌"),
        Character("宿敌", "对手", ["傲慢", "背景深厚"], "压制→被反杀"),
        Character("导师", "导师", ["神秘", "亦正亦邪"], "引路→隐退"),
    ]
    factions = ["主角势力", "敌对豪门", "中立宗门", "隐世古族"]

    # 章节大纲：用三幕节奏切分
    outline = _build_outline(provider, title, theme, n_chapters)

    return NovelBible(
        title=title,
        track=track,
        worldview=worldview,
        power_system=power_system,
        factions=factions,
        characters=characters,
        outline=outline,
    )


def generate_chapter(
    bible: NovelBible,
    chapter_index: int,
    *,
    provider: LLMProvider | None = None,
    words: int = 2000,
) -> str:
    """生成单章正文。把 Bible（人物 + 设定）注入以保持一致性。"""
    provider = provider or get_provider("mock")
    outline_point = (
        bible.outline[chapter_index] if 0 <= chapter_index < len(bible.outline) else "推进主线"
    )
    char_brief = "; ".join(f"{c.name}({c.role}):{'/'.join(c.traits)}" for c in bible.characters)
    prompt = (
        f"小说《{bible.title}》第{chapter_index + 1}章。\n"
        f"世界观：{bible.worldview}\n成长体系：{bible.power_system}\n"
        f"人物（务必保持一致）：{char_brief}\n本章大纲：{outline_point}\n"
        f"要求：约{words}字，钩子开场，结尾留悬念。"
    )
    return _ask(provider, prompt, max_tokens=words)


def _build_outline(provider, title, theme, n) -> list[str]:
    acts = [
        ("起", "立人设、抛金手指、第一次打脸"),
        ("承", "扩展势力、连环冲突、阶段性升级"),
        ("转", "强敌压境、盟友背叛、跌入谷底"),
        ("合", "绝境翻盘、清算宿敌、登顶收束"),
    ]
    per = max(1, n // len(acts))
    outline: list[str] = []
    for ai, (act, desc) in enumerate(acts):
        for k in range(per):
            idx = ai * per + k + 1
            if idx > n:
                break
            outline.append(f"第{idx}章[{act}] {desc}（节点{k + 1}）")
    # 补齐尾部
    while len(outline) < n:
        outline.append(f"第{len(outline) + 1}章[合] 大结局铺垫")
    return outline[:n]


def _ask(provider: LLMProvider, user: str, *, max_tokens: int = 512) -> str:
    return provider.complete(
        [LLMMessage("system", _SYSTEM), LLMMessage("user", user)],
        temperature=0.8,
        max_tokens=max_tokens,
    )
