import type { ReactNode } from "react";

export const metadata = {
  title: "AI Content Radar · AI 爆款内容雷达",
  description: "从市场洞察到内容生产的全自动闭环",
};

const NAV = [
  { href: "/", label: "总览 Dashboard" },
  { href: "/hotspots", label: "爆款规律" },
  { href: "/homogeneity", label: "红海赛道地图" },
  { href: "/opportunities", label: "蓝海机会" },
  { href: "/topics", label: "选题工厂" },
  { href: "/studio", label: "内容生产" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", display: "flex" }}>
        <aside style={{ width: 220, minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", padding: 16 }}>
          <h2 style={{ fontSize: 18 }}>📡 Content Radar</h2>
          <nav style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}>
                {n.label}
              </a>
            ))}
          </nav>
        </aside>
        <main style={{ flex: 1, padding: 24, background: "#f8fafc", minHeight: "100vh" }}>{children}</main>
      </body>
    </html>
  );
}
