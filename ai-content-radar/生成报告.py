# -*- coding: utf-8 -*-
"""生成报告.py —— 一键生成《AI 爆款内容雷达》可视化成果报告(报告.html)。

小白用法(只需一步)：
    1) 安装 Python(见 使用指南.md)
    2) 在本文件夹打开终端，输入：  python3 生成报告.py
    3) 会生成「报告.html」，双击用浏览器打开即可看结果。

本脚本零依赖、不用联网、不用任何 AI 密钥(用内置 Mock 演算)。
"""
from __future__ import annotations

import html
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "packages", "engine"))

from acr_engine.models import ContentItem, Comment, Platform  # noqa: E402
from acr_engine.pipeline import run_pipeline  # noqa: E402


# ---------- 1. 造一批贴近真实的演示数据(多个赛道，报告更好看) ----------
def build_sample():
    now = datetime.utcnow()
    # 每个赛道给定：标题、文案关键词、基准点赞，以及"近7天/前7天"的发文数量，
    # 让不同赛道呈现不同的增长趋势(有的在涨、有的在退)，机会分才有区分度。
    # 字段：(标题, 文案关键词, 点赞, 近7天条数, 前7天条数)
    tracks = [
        ("退婚流·打脸豪门未婚妻", "退婚 悔婚 未婚妻 打脸", 900, 3, 6),   # 退：老套路，供给多
        ("重生归来改写结局", "重生 前世 回到 上一世", 1300, 4, 4),        # 平稳
        ("系统签到废材逆袭", "系统 签到 金手指 面板", 700, 5, 2),          # 涨
        ("无敌流一拳碾压全场", "无敌 碾压 一拳 秒杀", 1700, 6, 2),         # 大涨、热门
        ("废材觉醒天才陨落", "废材 觉醒 天才 逆袭", 520, 3, 1),            # 小众上升
        ("扮猪吃虎马甲曝光", "扮猪吃虎 隐藏 身份 深藏不露", 850, 2, 2),    # 平稳小众
    ]
    items = []
    idx = 0
    for title, caption, likes, recent_n, prev_n in tracks:
        # 近 7 天：均匀分布在 1-6 天
        for k in range(recent_n):
            days = 1 + (k * 5) // max(1, recent_n)
            items.append(ContentItem(
                platform=Platform.DOUYIN, external_id=f"d{idx}", title=f"{title}#{k+1}",
                caption=caption, likes=likes + k * 30, duration_sec=30 + (idx % 3) * 10,
                published_at=now - timedelta(days=days)))
            idx += 1
        # 前 7 天：分布在 8-13 天
        for k in range(prev_n):
            days = 8 + (k * 5) // max(1, prev_n)
            items.append(ContentItem(
                platform=Platform.DOUYIN, external_id=f"d{idx}", title=f"{title}(旧){k+1}",
                caption=caption, likes=likes - 40 + k * 20, duration_sec=30 + (idx % 3) * 10,
                published_at=now - timedelta(days=days)))
            idx += 1
    comments = [
        Comment("d0", "节奏快，杀伐果断，太爽了", likes=180),
        Comment("d0", "智商在线，封神，催更", likes=120),
        Comment("d0", "主角太圣母，拖剧情，差点弃了", likes=90),
        Comment("d0", "无脑降智，尴尬", likes=60),
        Comment("d0", "希望多一点打脸和反转", likes=75),
        Comment("d0", "建议加快节奏，别注水", likes=50),
    ]
    return items, comments


# ---------- 2. 一些把数据渲染成 HTML 的小工具 ----------
def esc(x) -> str:
    return html.escape(str(x))


def bar(pct: float, color: str) -> str:
    pct = max(0, min(100, pct))
    return (f'<div class="bar"><div class="bar-in" style="width:{pct:.0f}%;'
            f'background:{color}"></div></div>')


def table(headers, rows) -> str:
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = ""
    for r in rows:
        body += "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>"
    return f'<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


# ---------- 3. 组装整份报告 ----------
def render(result) -> str:
    r = result
    hot = r.hot_report
    homo = r.homogeneity
    sent = r.sentiment
    oceans = r.blue_oceans
    topics = r.topics
    chosen = r.chosen_topic
    bible = r.novel_bible
    sb = r.storyboard
    prompts = r.video_prompts
    v = r.virality

    gen_time = datetime.now().strftime("%Y-%m-%d %H:%M")

    # 顶部三张大卡
    cards = f"""
    <div class="cards">
      <div class="card"><div class="k">🔥 第一名蓝海机会</div>
        <div class="v">{esc(oceans[0]['name'])}</div>
        <div class="s">机会分 {esc(oceans[0]['score'])} / 100（越高越值得做）</div></div>
      <div class="card"><div class="k">🎯 系统推荐选题</div>
        <div class="v small">{esc(chosen['title'])}</div>
        <div class="s">创新指数 {esc(chosen['novelty'])}｜竞争度 {esc(chosen['competition'])}</div></div>
      <div class="card hl"><div class="k">📊 这条内容能火吗</div>
        <div class="v">{esc(v['score'])} <span class="unit">/100</span></div>
        <div class="s">预测爆款概率 {v['viral_probability']*100:.0f}%</div></div>
    </div>"""

    # 模块2 爆款钩子词
    hook_rows = [
        (esc(h["keyword"]), esc(h["label"]), esc(h["hits"]),
         f'{h["lift"]:.2f} 倍 ' + bar(min(100, h["lift"] * 40), "#f59e0b"))
        for h in hot["top_hooks"][:8]
    ]
    hooks_html = table(["钩子词", "含义", "出现次数", "爆款溢价(越高越吸量)"], hook_rows)
    best_dur = hot["best_duration"]["label"] if hot["best_duration"] else "-"

    # 模块3 红海赛道
    track_rows = [
        (esc(t["name"]), f'{t["share"]*100:.0f}% ' + bar(t["share"]*100, "#ef4444"),
         f'{t["growth_rate"]*100:+.0f}%',
         f'{t["competition_index"]:.0f} ' + bar(t["competition_index"], "#dc2626"))
        for t in homo["tracks"]
    ]
    tracks_html = table(["赛道/套路", "内容占比", "增长率", "竞争激烈度(越高越挤)"], track_rows)

    # 模块4 情绪
    likes_tags = "".join(f'<span class="tag good">👍 {esc(t["tag"])}</span>' for t in sent["likes"][:6])
    dislike_tags = "".join(f'<span class="tag bad">👎 {esc(t["tag"])}</span>' for t in sent["dislikes"][:6])
    expect_tags = "".join(f'<li>{esc(e["text"])}</li>' for e in sent["expectations"][:4])
    pos = sent["positive_score"] * 100

    # 模块5 蓝海机会
    ocean_rows = [
        (f'<b>#{i+1}</b>', esc(o["name"]),
         f'{o["score"]} ' + bar(o["score"], "#06b6d4"),
         f'{o["demand"]*100:.0f}%', f'{o["supply"]*100:.0f}%')
        for i, o in enumerate(oceans[:8])
    ]
    oceans_html = table(["排名", "跨界组合(蓝海)", "机会分", "需求", "供给(越低越好)"], ocean_rows)

    # 模块6 选题(取前 10 个展示)
    topic_rows = [
        (f'{i+1}', esc(t["title"]), esc(t["audience"]),
         f'{t["novelty"]:.2f}', f'{t["competition"]:.0f}')
        for i, t in enumerate(topics[:10])
    ]
    topics_html = table(["#", "选题标题", "目标人群", "创新指数", "竞争度"], topic_rows)

    # 模块7 小说
    chars = "".join(
        f'<li><b>{esc(c["name"])}</b>（{esc(c["role"])}）：'
        f'{esc("、".join(c["traits"]))}｜成长线：{esc(c["arc"])}</li>'
        for c in bible["characters"]
    )
    outline_preview = "".join(f'<li>{esc(o)}</li>' for o in bible["outline"][:6])

    # 模块8 分镜
    shot_rows = [
        (esc(s["index"]), esc(s["shot_size"]), esc(s["camera"]),
         esc(s["scene"]), esc(s["dialogue"]), f'{s["duration_sec"]}s')
        for s in sb["shots"]
    ]
    shots_html = table(["镜号", "景别", "运镜", "画面", "对白", "时长"], shot_rows)

    # 模块9 提示词(取前 4 条)
    prompt_rows = [
        (esc(p["target"]), f'<code>{esc(p["prompt"])}</code>')
        for p in prompts[:4]
    ]
    prompts_html = table(["目标模型", "可直接复制的提示词"], prompt_rows)

    # 模块10 建议
    tips = "".join(f'<li>{esc(t)}</li>' for t in v["suggestions"])

    return TEMPLATE.format(
        gen_time=gen_time, cards=cards,
        best_dur=esc(best_dur), sample=esc(hot["sample_size"]),
        avg_title=esc(hot["avg_title_len"]), hooks_html=hooks_html,
        tracks_html=tracks_html, likes_tags=likes_tags, dislike_tags=dislike_tags,
        expect_tags=expect_tags, pos=f"{pos:.0f}", neg=f"{100-pos:.0f}",
        oceans_html=oceans_html, n_topics=len(topics), topics_html=topics_html,
        novel_title=esc(bible["title"]), worldview=esc(bible["worldview"]),
        power=esc(bible["power_system"]), chars=chars,
        n_chapters=len(bible["outline"]), outline_preview=outline_preview,
        shots_html=shots_html, total_dur=esc(sb["total_duration"]),
        n_prompts=len(prompts), prompts_html=prompts_html,
        score=esc(v["score"]), prob=f'{v["viral_probability"]*100:.0f}', tips=tips,
    )


TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 爆款内容雷达 · 成果报告</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin:0; font-family: -apple-system, "Microsoft YaHei", sans-serif;
         background:#f1f5f9; color:#0f172a; }}
  .hero {{ background:linear-gradient(135deg,#1e3a8a,#2563eb 60%,#06b6d4);
          color:#fff; padding:36px 24px; }}
  .hero h1 {{ margin:0; font-size:28px; }}
  .hero p {{ margin:8px 0 0; opacity:.9; }}
  .wrap {{ max-width:1080px; margin:0 auto; padding:24px; }}
  .cards {{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-top:-40px; }}
  .card {{ background:#fff; border-radius:14px; padding:18px;
          box-shadow:0 6px 20px rgba(2,6,23,.10); }}
  .card.hl {{ background:linear-gradient(135deg,#0f172a,#1e3a8a); color:#fff; }}
  .card .k {{ font-size:13px; color:#64748b; }}
  .card.hl .k {{ color:#cbd5e1; }}
  .card .v {{ font-size:24px; font-weight:700; margin-top:8px; }}
  .card .v.small {{ font-size:15px; line-height:1.4; }}
  .card .v .unit {{ font-size:14px; font-weight:400; opacity:.7; }}
  .card .s {{ font-size:12px; color:#94a3b8; margin-top:6px; }}
  section {{ background:#fff; border-radius:14px; padding:20px 22px; margin-top:20px;
            box-shadow:0 2px 8px rgba(2,6,23,.05); }}
  section h2 {{ margin:0 0 4px; font-size:19px; }}
  section .desc {{ color:#64748b; font-size:13px; margin:0 0 14px; }}
  table {{ width:100%; border-collapse:collapse; font-size:13px; }}
  th,td {{ text-align:left; padding:8px 10px; border-bottom:1px solid #eef2f7;
          vertical-align:middle; }}
  th {{ color:#475569; background:#f8fafc; font-weight:600; }}
  tr:nth-child(even) td {{ background:#fcfdff; }}
  .bar {{ display:inline-block; width:90px; height:8px; background:#eef2f7;
         border-radius:6px; overflow:hidden; vertical-align:middle; margin-left:6px; }}
  .bar-in {{ height:100%; }}
  .tag {{ display:inline-block; padding:4px 10px; border-radius:20px; font-size:12px;
         margin:3px 4px 3px 0; }}
  .tag.good {{ background:#dcfce7; color:#166534; }}
  .tag.bad {{ background:#fee2e2; color:#991b1b; }}
  code {{ background:#f1f5f9; padding:2px 6px; border-radius:6px; font-size:12px;
         word-break:break-all; }}
  .flow {{ text-align:center; font-size:13px; color:#334155; margin-top:14px; }}
  .flow span {{ background:#e0f2fe; padding:5px 10px; border-radius:8px; margin:2px;
               display:inline-block; }}
  .foot {{ text-align:center; color:#94a3b8; font-size:12px; padding:24px; }}
  .big {{ font-size:44px; font-weight:800; color:#2563eb; }}
</style></head>
<body>
<div class="hero">
  <div class="wrap" style="padding-top:0;padding-bottom:0">
    <h1>📡 AI 爆款内容雷达 · 成果报告</h1>
    <p>从「全网洞察」到「内容生产」全自动跑通 —— 生成时间：{gen_time}</p>
  </div>
</div>
<div class="wrap">
  {cards}
  <div class="flow">
    <span>①采集</span>→<span>②爆款规律</span>→<span>③红海赛道</span>→<span>④用户情绪</span>
    →<span>⑤蓝海机会</span>→<span>⑥选题</span>→<span>⑦小说</span>→<span>⑧分镜</span>
    →<span>⑨视频提示词</span>→<span>⑩能不能火评分</span>
  </div>

  <section><h2>② 爆款规律</h2>
    <p class="desc">分析了 {sample} 条内容。最佳时长：<b>{best_dur}</b>，标题平均 {avg_title} 字。
    下面是"越靠上越吸量"的爆款钩子词。</p>{hooks_html}</section>

  <section><h2>③ 红海赛道地图（哪些太挤，别硬挤）</h2>
    <p class="desc">占比高、竞争激烈的就是"红海"。占比低但在增长的，才是机会。</p>{tracks_html}</section>

  <section><h2>④ 用户情绪 / 需求雷达</h2>
    <p class="desc">正面情绪占比 {pos}%，负面 {neg}%。看用户到底喜欢什么、讨厌什么。</p>
    <div>{likes_tags}</div><div style="margin-top:6px">{dislike_tags}</div>
    <p class="desc" style="margin-top:14px">用户还期待：</p><ul>{expect_tags}</ul></section>

  <section><h2>⑤ 蓝海机会（重点看这里！高需求 + 低供给）</h2>
    <p class="desc">系统把热门赛道和新维度做"跨界组合"，找出还没人挤、但有人想看的方向。</p>{oceans_html}</section>

  <section><h2>⑥ AI 选题工厂（共生成 {n_topics} 个，展示前 10）</h2>
    <p class="desc">针对第一名蓝海机会，自动生成差异化选题。创新指数越高、竞争度越低越好。</p>{topics_html}</section>

  <section><h2>⑦ 小说自动生成：《{novel_title}》</h2>
    <p class="desc"><b>世界观：</b>{worldview}</p>
    <p class="desc"><b>成长体系：</b>{power}</p>
    <p class="desc"><b>核心人物（系统会全程保持人设一致）：</b></p><ul>{chars}</ul>
    <p class="desc"><b>共 {n_chapters} 章大纲，前 6 章预览：</b></p><ul>{outline_preview}</ul></section>

  <section><h2>⑧ 短剧分镜脚本（总时长 {total_dur} 秒）</h2>
    <p class="desc">可直接交给拍摄/剪辑团队。</p>{shots_html}</section>

  <section><h2>⑨ AI 视频提示词（共 {n_prompts} 条，展示前 4）</h2>
    <p class="desc">复制粘贴到 Veo / Kling(可灵) / 即梦 等 AI 视频工具即可生成画面。</p>{prompts_html}</section>

  <section><h2>⑩ 这条内容能不能火？</h2>
    <p class="desc">综合评分（0-100）：</p>
    <div class="big">{score} <span style="font-size:18px;color:#94a3b8">/ 100</span></div>
    <p class="desc">预测爆款概率 {prob}%。系统给的改进建议：</p><ul>{tips}</ul></section>

  <div class="foot">本报告由 AI Content Radar 引擎自动生成 · 无需联网/无需密钥 · 数据为演示样例</div>
</div>
</body></html>"""


def main():
    items, comments = build_sample()
    result = run_pipeline(items, comments, n_topics=100)
    out_path = os.path.join(os.path.dirname(__file__), "报告.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(render(result))
    print("=" * 56)
    print("✅ 报告已生成！")
    print(f"   文件位置：{out_path}")
    print("   👉 双击「报告.html」用浏览器打开就能看结果。")
    print("=" * 56)


if __name__ == "__main__":
    main()
