"""ACR Engine 单元测试 —— 纯标准库，`python3 -m unittest` 即可运行。

覆盖十大模块的核心算法：采集归一化、爆款规律、同质化、情绪、
蓝海评分、选题、小说/分镜/提示词生成、增长预测。
"""
import os
import sys
import unittest
from datetime import datetime, timedelta

# 让测试无需安装即可导入引擎包
ENGINE = os.path.join(os.path.dirname(__file__), "..", "packages", "engine")
sys.path.insert(0, os.path.abspath(ENGINE))

from acr_engine.models import ContentItem, Comment, Platform  # noqa: E402
from acr_engine.collect import normalize, dedup  # noqa: E402
from acr_engine.analysis import analyze_titles, cluster_tracks, analyze_comments  # noqa: E402
from acr_engine.opportunity import (  # noqa: E402
    opportunity_score, discover_blue_oceans, OpportunityInput,
)
from acr_engine.prediction import predict_virality, ViralityInput  # noqa: E402
from acr_engine.generation import (  # noqa: E402
    generate_topics, generate_novel_bible, generate_storyboard, generate_video_prompts,
)


def _item(title, likes=0, dur=30, dt=None, tags=None, caption=""):
    return ContentItem(
        platform=Platform.DOUYIN, external_id=title, title=title, caption=caption,
        likes=likes, duration_sec=dur, published_at=dt, tags=tags or [],
    )


class TestCollect(unittest.TestCase):
    def test_normalize_douyin(self):
        raw = {"aweme_id": "x1", "desc": "开局无敌", "digg_count": "1200",
               "duration": 30, "create_time": 1700000000, "tags": "#修仙 #爽文"}
        it = normalize("douyin", raw)
        self.assertEqual(it.external_id, "x1")
        self.assertEqual(it.likes, 1200)
        self.assertEqual(it.duration_sec, 30)
        self.assertIn("修仙", it.tags)
        self.assertIsInstance(it.published_at, datetime)

    def test_dedup_keeps_higher_engagement(self):
        a = _item("dup"); a.external_id = "k"; a.likes = 10
        b = _item("dup"); b.external_id = "k"; b.likes = 99
        out = dedup([a, b])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0].likes, 99)


class TestTitlePatterns(unittest.TestCase):
    def test_hook_lift(self):
        items = [_item("开局无敌的我", likes=1000) for _ in range(5)]
        items += [_item("平淡日常", likes=10) for _ in range(5)]
        rep = analyze_titles(items)
        self.assertEqual(rep.sample_size, 10)
        kws = {h.keyword for h in rep.top_hooks}
        self.assertTrue({"开局", "无敌"} & kws)
        top = rep.top_hooks[0]
        self.assertGreater(top.lift, 1.0)  # 高互动钩子词溢价 > 1


class TestHomogeneity(unittest.TestCase):
    def test_cluster_and_competition(self):
        now = datetime(2026, 6, 30)
        items = []
        for i in range(8):
            items.append(_item(f"退婚打脸{i}", likes=500,
                               dt=now - timedelta(days=i), caption="未婚妻悔婚"))
        for i in range(2):
            items.append(_item(f"系统签到{i}", likes=300,
                               dt=now - timedelta(days=i), caption="金手指面板"))
        rep = cluster_tracks(items, now=now)
        names = {t.name for t in rep.tracks}
        self.assertIn("退婚流", names)
        tui = next(t for t in rep.tracks if t.name == "退婚流")
        self.assertAlmostEqual(tui.share, 0.8, places=2)
        self.assertGreaterEqual(tui.competition_index, 0.0)
        self.assertLessEqual(tui.competition_index, 100.0)


class TestSentiment(unittest.TestCase):
    def test_radar(self):
        comments = [
            Comment("v", "节奏快，杀伐果断，太爽了", likes=50),
            Comment("v", "主角太圣母了，拖剧情", likes=30),
            Comment("v", "希望多一点打脸情节", likes=20),
        ]
        radar = analyze_comments(comments)
        self.assertEqual(radar.sample_size, 3)
        like_tags = {t for t, _ in radar.likes}
        dislike_tags = {t for t, _ in radar.dislikes}
        self.assertIn("节奏快", like_tags)
        self.assertIn("圣母", dislike_tags)
        self.assertTrue(radar.expectations)  # 命中"希望"


class TestOpportunity(unittest.TestCase):
    def test_score_monotonic(self):
        high = opportunity_score(OpportunityInput("a", demand=0.9, supply=0.1, growth=0.3))
        low = opportunity_score(OpportunityInput("b", demand=0.9, supply=0.9, growth=0.3))
        self.assertGreater(high, low)  # 供给越低分越高
        self.assertLessEqual(high, 100.0)

    def test_discover(self):
        oceans = discover_blue_oceans(
            base_tracks=["修仙"],
            track_supply={"修仙": 0.8},
            track_growth={"修仙": 0.2},
            top_k=5,
        )
        self.assertEqual(len(oceans), 5)
        self.assertTrue(all(0 <= o.score <= 100 for o in oceans))
        # 排序：分数降序
        self.assertEqual(oceans, sorted(oceans, key=lambda o: o.score, reverse=True))


class TestPrediction(unittest.TestCase):
    def test_strong_vs_weak(self):
        strong = predict_virality(ViralityInput(
            hook_strength=0.9, title_len=17, duration_sec=33, opening_3s_hook=True,
            novelty=0.8, track_competition=20, sentiment_fit=0.9, post_hour=20))
        weak = predict_virality(ViralityInput(
            hook_strength=0.1, title_len=40, duration_sec=300, opening_3s_hook=False,
            novelty=0.1, track_competition=95, sentiment_fit=0.1, post_hour=3))
        self.assertGreater(strong.score, weak.score)
        self.assertTrue(0 <= strong.score <= 100)
        self.assertGreater(strong.viral_probability, weak.viral_probability)
        self.assertTrue(weak.suggestions)


class TestGeneration(unittest.TestCase):
    def test_topics_count_and_diff(self):
        topics = generate_topics("修仙", cross="工业文明", n=100)
        self.assertEqual(len(topics), 100)
        self.assertEqual(len({t.title for t in topics}), 100)  # 去重
        self.assertTrue(all(0 <= t.novelty <= 1 for t in topics))
        # 跨界应整体抬升创新指数
        plain = generate_topics("修仙", n=50)
        self.assertGreater(
            sum(t.novelty for t in topics) / len(topics),
            sum(t.novelty for t in plain) / len(plain),
        )

    def test_novel_bible(self):
        bible = generate_novel_bible("逆天修仙", "修仙", cross="AI", n_chapters=100)
        self.assertEqual(len(bible.outline), 100)
        self.assertTrue(bible.worldview)
        self.assertTrue(bible.characters)

    def test_storyboard_and_prompts(self):
        sb = generate_storyboard("打脸名场面", "废材逆袭打脸豪门")
        self.assertTrue(sb.shots)
        self.assertGreater(sb.total_duration, 0)
        prompts = generate_video_prompts(sb.shots, targets=["veo", "kling"])
        self.assertEqual(len(prompts), len(sb.shots) * 2)
        self.assertTrue(all(p.prompt for p in prompts))


if __name__ == "__main__":
    unittest.main()
