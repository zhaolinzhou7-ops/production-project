// 后端 API 客户端 —— 统一封装 v1 接口（对应十大模块）。
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  hot: (items: unknown[]) => post("/hot/analyze", { items }),
  homogeneity: (items: unknown[]) => post("/homogeneity/analyze", { items }),
  sentiment: (comments: unknown[]) => post("/sentiment/analyze", { comments }),
  opportunity: (payload: unknown) => post("/opportunity/discover", payload),
  topics: (payload: unknown) => post("/topics/generate", payload),
  novel: (payload: unknown) => post("/novel/bible", payload),
  storyboard: (payload: unknown) => post("/storyboard/generate", payload),
  virality: (payload: unknown) => post("/virality/predict", payload),
  pipeline: (payload: unknown) => post("/pipeline/run", payload),
};
