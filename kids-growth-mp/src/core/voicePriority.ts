/**
 * 家长录音的优先级。
 *
 * 现实是这样的:对话内容有几百句,而家长真正会坐下来录的大概二十句。
 * 如果让他自己从几百句里挑,结果通常是录了开头几段就放弃 ——
 * 而开头几段未必是孩子最常碰到的。
 *
 * 所以由程序排:哪十五句录了收益最大。排序依据(按权重从大到小):
 * 1. **重复出现**:同一句在多个场景里出现,录一次到处都能用
 * 2. **短句优先**:短句录起来快、孩子也更容易跟读,单位时间收益高
 * 3. **简单档优先**:4 岁半先碰到的是简单档,难档的先放着
 */

export interface Candidate {
  text: string
  /** 'easy' | 'medium' | 'hard' */
  level: string
  /** 出现在哪个场景(用于说明「这句在哪儿会用到」) */
  where: string
}

export interface RankedSentence {
  text: string
  /** 出现次数 */
  times: number
  /** 出现在哪些地方(去重,最多列三个) */
  where: string[]
  score: number
}

const LEVEL_WEIGHT: Record<string, number> = { easy: 3, medium: 2, hard: 1 }

/** 词数 —— 中英文都按空格切,中文句子会算成 1,正好也该优先 */
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export function rankForRecording(cands: Candidate[], limit = 15): RankedSentence[] {
  const byText = new Map<string, { times: number; where: string[]; levelBest: number }>()
  for (const c of cands) {
    const t = String(c.text ?? '').trim()
    if (!t) continue
    const cur = byText.get(t) ?? { times: 0, where: [], levelBest: 0 }
    cur.times += 1
    if (!cur.where.includes(c.where)) cur.where.push(c.where)
    cur.levelBest = Math.max(cur.levelBest, LEVEL_WEIGHT[c.level] ?? 1)
    byText.set(t, cur)
  }

  const out: RankedSentence[] = []
  for (const [text, v] of byText) {
    const n = wordCount(text)
    // 重复出现权重最大;短句次之(6 词以内基本满分);简单档再加一点
    const repeat = v.times * 10
    const short = Math.max(0, 12 - n) * 1.5
    const level = v.levelBest * 2
    out.push({ text, times: v.times, where: v.where.slice(0, 3), score: repeat + short + level })
  }
  out.sort((a, b) => (b.score === a.score ? a.text.localeCompare(b.text) : b.score - a.score))
  return out.slice(0, limit)
}
