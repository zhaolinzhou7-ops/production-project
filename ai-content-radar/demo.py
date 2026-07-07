"""一键闭环演示：`python3 -m demo`（在 ai-content-radar/ 目录下运行）。

无需任何 API Key 或数据库——直接用引擎跑通「洞察→生产」全流程，
打印各模块产出，证明十大模块契约对齐、可串联。
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "packages", "engine"))

from acr_engine.models import ContentItem, Comment, Platform  # noqa: E402
from acr_engine.pipeline import run_pipeline  # noqa: E402


def build_sample():
    now = datetime.utcnow()
    items, titles = [], [
        "开局无敌：退婚当天我曝光身份", "重生归来，未婚妻悔婚打脸现场",
        "系统签到：废材觉醒逆袭", "扮猪吃虎被识破，全场震惊",
        "退婚流·杀伐果断的我", "重生之逆袭豪门",
    ]
    for i in range(12):
        items.append(ContentItem(
            platform=Platform.DOUYIN, external_id=f"d{i}",
            title=titles[i % len(titles)] + f" 第{i}集",
            caption="未婚妻悔婚 系统签到 金手指面板",
            likes=600 + i * 30, duration_sec=33,
            published_at=now - timedelta(days=i),
        ))
    comments = [
        Comment("d0", "节奏快，杀伐果断，太爽了", likes=120),
        Comment("d0", "主角太圣母，拖剧情，差点弃了", likes=40),
        Comment("d0", "希望多一点打脸和反转", likes=25),
        Comment("d0", "智商在线，封神", likes=60),
    ]
    return items, comments


def main():
    items, comments = build_sample()
    r = run_pipeline(items, comments, n_topics=100)

    print("=" * 60)
    print("📡 AI Content Radar · 全自动闭环演示")
    print("=" * 60)
    h = r.hot_report
    print(f"[模块2] 爆款规律: 样本 {h['sample_size']} 条, 最佳时长 "
          f"{h['best_duration']['label'] if h['best_duration'] else '-'}")
    top_hooks = ", ".join(f"{x['keyword']}(x{x['lift']})" for x in h["top_hooks"][:3])
    print(f"          高溢价钩子: {top_hooks}")

    print(f"[模块3] 红海赛道: " + ", ".join(
        f"{t['name']} 占比{t['share']:.0%} 竞争{t['competition_index']:.0f}"
        for t in r.homogeneity["tracks"][:3]))

    s = r.sentiment
    print(f"[模块4] 需求雷达: 喜欢={[t['tag'] for t in s['likes'][:3]]} "
          f"讨厌={[t['tag'] for t in s['dislikes'][:3]]}")

    print(f"[模块5] 蓝海TOP3:")
    for o in r.blue_oceans[:3]:
        print(f"          {o['name']:20s} 机会分 {o['score']}")

    print(f"[模块6] 选题: 生成 {len(r.topics)} 个 | 选中: {r.chosen_topic['title']}")
    print(f"[模块7] 小说: {len(r.novel_bible['outline'])} 章大纲, "
          f"{len(r.novel_bible['characters'])} 个一致性人物卡")
    print(f"[模块8] 分镜: {len(r.storyboard['shots'])} 镜, "
          f"总时长 {r.storyboard['total_duration']}s")
    print(f"[模块9] 视频提示词: {len(r.video_prompts)} 条 (Veo/Kling/即梦)")
    v = r.virality
    print(f"[模块10] 增长预测: 内容评分 {v['score']}/100, "
          f"爆款概率 {v['viral_probability']:.0%}")
    print("=" * 60)
    print("✅ 闭环跑通：从市场洞察到内容生产，全程无需人工。")


if __name__ == "__main__":
    main()
