import { KEYS, readTable } from './db'
import { todayISO, addDays } from '../core/dateUtils'
import { listHabits, doneToday } from './habits'
import { readObject } from './db'
import type { StudyState } from '../types'

/**
 * 家长周报。
 *
 * 写点评时刻意避开两种常见毛病:
 * - 一味吹捧(「宝宝真棒」)—— 家长看不出到底怎么样,失去参考价值;
 * - 拿数字施压(「本周落后 30%」)—— 家长焦虑会传导给孩子。
 * 所以:如实说变化、给出可能原因、给一条具体可执行的建议,句号。
 */
interface DatedRow {
  date: string
  total: number
  correct: number
}

export interface WeeklyReport {
  /** 本周(最近 7 天) */
  answered: number
  correct: number
  days: number
  /** 上一周(第 8–14 天) */
  prevAnswered: number
  prevDays: number
  /** 本周新掌握的卡片数(近似:按最后复习时间落在本周且已 mastered) */
  newMastered: number
  /** 习惯完成率(本周) */
  habitRate: number
  /** 错题本积压条数 */
  errorBacklog: number
  comment: string
  advice: string[]
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

export function buildWeekly(childId: string): WeeklyReport {
  const today = todayISO()
  const w0 = addDays(today, -6)
  const p1 = addDays(today, -13)
  const p0 = addDays(today, -7)

  const rows: DatedRow[] = [
    ...readTable<DatedRow>(KEYS.sessions),
    ...readTable<DatedRow>(KEYS.drills),
  ]

  let answered = 0
  let correct = 0
  let prevAnswered = 0
  const dayset = new Set<string>()
  const prevDayset = new Set<string>()
  for (const r of rows) {
    if (inRange(r.date, w0, today)) {
      answered += r.total || 0
      correct += r.correct || 0
      dayset.add(r.date)
    } else if (inRange(r.date, p1, p0)) {
      prevAnswered += r.total || 0
      prevDayset.add(r.date)
    }
  }

  const states = readTable<StudyState>(KEYS.states).filter((s) => s.childId === childId)
  const weekStartMs = new Date(`${w0}T00:00:00`).getTime()
  const newMastered = states.filter(
    (s) => s.status === 'mastered' && (s.lastReviewed ?? 0) >= weekStartMs,
  ).length

  // 习惯完成率:本周每天「做到的条数 / 清单条数」的平均
  const habits = listHabits()
  const log = readObject<Record<string, string[]>>('habitLog', {})
  let habitRate = 0
  if (habits.length > 0) {
    let sum = 0
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, -i)
      const ids = d === today ? doneToday() : (log[d] ?? [])
      sum += ids.filter((id) => habits.some((h) => h.id === id)).length / habits.length
    }
    habitRate = Math.round((sum / 7) * 100)
  }

  const errorDeck = readTable<{ id: string; childId?: string; source?: string; itemType?: string }>(
    KEYS.decks,
  ).find((d) => d.childId === childId && d.source === 'wrong')
  const errorBacklog = errorDeck
    ? readTable<{ deckId: string }>(KEYS.cards).filter((c) => c.deckId === errorDeck.id).length
    : 0

  return {
    answered,
    correct,
    days: dayset.size,
    prevAnswered,
    prevDays: prevDayset.size,
    newMastered,
    habitRate,
    errorBacklog,
    comment: comment({ answered, prevAnswered, days: dayset.size, prevDays: prevDayset.size, correct }),
    advice: advice({ answered, correct, habitRate, errorBacklog, days: dayset.size }),
  }
}

function comment(p: {
  answered: number
  prevAnswered: number
  days: number
  prevDays: number
  correct: number
}): string {
  if (p.answered === 0) return '这周还没有练习记录。不用着急,挑一个孩子喜欢的内容包重新开始就好。'
  const rate = p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0
  const parts: string[] = []
  parts.push(`这周练了 ${p.days} 天、共 ${p.answered} 题,正确率 ${rate}%。`)

  if (p.prevAnswered === 0) {
    parts.push('这是第一周有完整记录,先把「每天都碰一下」这件事稳住,量以后自然会上来。')
  } else {
    const diff = p.answered - p.prevAnswered
    const pct = Math.round((Math.abs(diff) / p.prevAnswered) * 100)
    if (diff > 0 && pct >= 20) parts.push(`比上周多了 ${pct}%,状态在往上走。`)
    else if (diff < 0 && pct >= 20) {
      parts.push(`比上周少了 ${pct}% —— 可能是这周事情多,不必当成退步,下周恢复节奏即可。`)
    } else parts.push('和上周基本持平,节奏是稳的。')
  }

  if (rate >= 90) parts.push('正确率偏高,说明题目对他来说有点简单了,可以在内容库里加个新包。')
  else if (rate < 60) parts.push('正确率偏低,可能是内容超前了,先把已有的练熟再加新的。')

  if (p.days >= 6) parts.push('几乎每天都在练,这一点比做多少题都重要。')
  return parts.join('')
}

function advice(p: {
  answered: number
  correct: number
  habitRate: number
  errorBacklog: number
  days: number
}): string[] {
  const out: string[] = []
  if (p.errorBacklog >= 8) {
    out.push(`错题本积了 ${p.errorBacklog} 条,这周挑 5 条重做一遍,比学新内容更划算。`)
  }
  if (p.habitRate > 0 && p.habitRate < 50) {
    out.push('习惯完成率不到一半 —— 通常是安排得太多。先砍到 3 条最要紧的,做稳了再加。')
  }
  if (p.days <= 2 && p.answered > 0) {
    out.push('这周只练了两天以内。固定在某个时间点(比如晚饭后)会比「想起来才练」有效得多。')
  }
  if (out.length === 0) out.push('目前节奏不错,保持就好,不用加码。')
  return out.slice(0, 2)
}
