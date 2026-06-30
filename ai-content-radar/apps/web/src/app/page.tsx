"use client";
import { useState } from "react";
import { api } from "@/lib/api";

// 总览页：一键跑通"洞察→生产"闭环演示。
export default function Dashboard() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function runDemo() {
    setLoading(true);
    try {
      const items = Array.from({ length: 10 }).map((_, i) => ({
        platform: "douyin",
        raw: {
          aweme_id: `demo${i}`,
          desc: `开局无敌：退婚打脸第${i}集`,
          digg_count: 800 + i * 20,
          duration: 33,
          create_time: 1751000000 - i * 86400,
          tags: "#修仙 #爽文",
        },
      }));
      const comments = [
        { text: "节奏快，杀伐果断，太爽了", likes: 50 },
        { text: "主角太圣母，拖剧情", likes: 20 },
        { text: "希望多一点打脸", likes: 10 },
      ];
      const r = await api.pipeline({ items, comments, n_topics: 100 });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>全自动闭环演示</h1>
      <p style={{ color: "#475569" }}>
        采集 → 爆款规律 → 同质化 → 情绪 → 蓝海机会 → 选题 → 小说/分镜/提示词 → 增长预测
      </p>
      <button onClick={runDemo} disabled={loading}
        style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: 0, borderRadius: 8, cursor: "pointer" }}>
        {loading ? "运行中…" : "▶ 运行闭环"}
      </button>

      {result && (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          <Card title="🔥 蓝海 TOP1" value={result.blue_oceans?.[0]?.name}
            sub={`机会分 ${result.blue_oceans?.[0]?.score}`} />
          <Card title="🎯 选中选题" value={result.chosen_topic?.title}
            sub={`创新指数 ${result.chosen_topic?.novelty}`} />
          <Card title="📊 内容评分" value={`${result.virality?.score} / 100`}
            sub={`爆款概率 ${(result.virality?.viral_probability * 100).toFixed(0)}%`} />
          <Card title="📚 小说大纲" value={`${result.novel_bible?.outline?.length} 章`} />
          <Card title="🎬 分镜" value={`${result.storyboard?.shots?.length} 镜`}
            sub={`时长 ${result.storyboard?.total_duration}s`} />
          <Card title="🖼 视频提示词" value={`${result.video_prompts?.length} 条`} />
        </div>
      )}
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value?: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
      <div style={{ fontSize: 13, color: "#64748b" }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{value ?? "-"}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
