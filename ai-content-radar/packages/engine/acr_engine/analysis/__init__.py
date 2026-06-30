"""模块2/3/4：爆款规律、同质化、评论情绪分析。"""
from .title_patterns import analyze_titles, TitlePatternReport  # noqa: F401
from .homogeneity import cluster_tracks, HomogeneityReport      # noqa: F401
from .sentiment import analyze_comments, SentimentRadar         # noqa: F401
