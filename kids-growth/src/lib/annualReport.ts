import { db } from '../db/db'
import { toISODate } from './dateUtils'

export interface AnnualReport {
  year: number
  availableYears: number[]
  /** 年内第一条与最后一条身高(cm),≥2 条时给出增长 */
  height: { from?: number; to?: number; delta?: number } | null
  weight: { from?: number; to?: number; delta?: number } | null
  examCount: number
  /** 各科年内平均得分率(%),按科目 */
  subjectAvgRates: { subject: string; rate: number }[]
  booksRead: number
  topBooks: string[]
  badgesUnlocked: number
  checkinsDone: number
  xpEarned: number
  milestones: string[]
  shineCount: number
  shineHighlights: string[]
  portfolioCount: number
  diaryCount: number
}

const inYear = (dateISO: string, year: number) => dateISO.startsWith(`${year}-`)

export async function buildAnnualReport(childId: string, year?: number): Promise<AnnualReport | null> {
  const [growth, exams, examScores, records, unlocks, checkIns, ledger, milestones, anecdotes, portfolios, diaries] =
    await Promise.all([
      db.growthRecords.where('childId').equals(childId).toArray(),
      db.exams.where('childId').equals(childId).toArray(),
      db.examScores.where('childId').equals(childId).toArray(),
      db.records.where('childId').equals(childId).toArray(),
      db.unlocks.where('childId').equals(childId).toArray(),
      db.checkIns.where('childId').equals(childId).filter((c) => c.status === 'done').toArray(),
      db.pointLedger.where('childId').equals(childId).toArray(),
      db.milestones.where('childId').equals(childId).toArray(),
      db.anecdotes.where('childId').equals(childId).toArray(),
      db.portfolios.where('childId').equals(childId).toArray(),
      db.diaryEntries.where('childId').equals(childId).toArray(),
    ])

  // 有数据的年份集合
  const years = new Set<number>()
  const collect = (dateISO: string) => {
    const y = Number(dateISO.slice(0, 4))
    if (y >= 2000 && y <= 2100) years.add(y)
  }
  growth.forEach((r) => collect(r.date))
  exams.forEach((r) => collect(r.date))
  records.forEach((r) => collect(r.date))
  checkIns.forEach((r) => collect(r.date))
  milestones.forEach((r) => collect(r.date))
  anecdotes.forEach((r) => collect(r.date))
  portfolios.forEach((r) => collect(r.date))
  diaries.forEach((r) => collect(r.date))
  unlocks.forEach((u) => collect(toISODate(new Date(u.unlockedAt))))

  const availableYears = [...years].sort((a, b) => b - a)
  if (availableYears.length === 0) return null
  const y = year && years.has(year) ? year : availableYears[0]

  const series = (values: { date: string; v: number }[]) => {
    const sorted = values.filter((x) => inYear(x.date, y)).sort((a, b) => a.date.localeCompare(b.date))
    if (sorted.length === 0) return null
    const from = sorted[0].v
    const to = sorted[sorted.length - 1].v
    return sorted.length >= 2
      ? { from, to, delta: Math.round((to - from) * 10) / 10 }
      : { to }
  }

  const height = series(growth.filter((g) => g.heightCm).map((g) => ({ date: g.date, v: g.heightCm! })))
  const weight = series(growth.filter((g) => g.weightKg).map((g) => ({ date: g.date, v: g.weightKg! })))

  const yearExamIds = new Set(exams.filter((e) => inYear(e.date, y)).map((e) => e.id))
  const rateBySubject = new Map<string, number[]>()
  for (const s of examScores) {
    if (!yearExamIds.has(s.examId)) continue
    const rate = (s.score / (s.fullScore ?? 100)) * 100
    if (!rateBySubject.has(s.subject)) rateBySubject.set(s.subject, [])
    rateBySubject.get(s.subject)!.push(rate)
  }
  const subjectAvgRates = [...rateBySubject.entries()]
    .map(([subject, rates]) => ({
      subject,
      rate: Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10,
    }))
    .sort((a, b) => b.rate - a.rate)

  const yearReadings = records.filter((r) => r.module === 'reading' && inYear(r.date, y))
  const topBooks = [...yearReadings]
    .sort((a, b) => Number(b.fields.rating ?? 0) - Number(a.fields.rating ?? 0))
    .slice(0, 3)
    .map((r) => String(r.fields.title ?? ''))
    .filter(Boolean)

  const yearShine = anecdotes.filter((a) => a.kind === 'shine' && inYear(a.date, y))

  const yearStart = new Date(y, 0, 1).getTime()
  const yearEnd = new Date(y + 1, 0, 1).getTime()

  return {
    year: y,
    availableYears,
    height,
    weight,
    examCount: yearExamIds.size,
    subjectAvgRates,
    booksRead: yearReadings.length,
    topBooks,
    badgesUnlocked: unlocks.filter((u) => u.unlockedAt >= yearStart && u.unlockedAt < yearEnd).length,
    checkinsDone: checkIns.filter((c) => inYear(c.date, y)).length,
    xpEarned: ledger
      .filter((l) => l.delta > 0 && l.timestamp >= yearStart && l.timestamp < yearEnd)
      .reduce((sum, l) => sum + l.delta, 0),
    milestones: milestones.filter((m) => inYear(m.date, y)).map((m) => m.title),
    shineCount: yearShine.length,
    shineHighlights: yearShine.slice(0, 3).map((a) => a.content),
    portfolioCount: portfolios.filter((p) => inYear(p.date, y)).length,
    diaryCount: diaries.filter((d) => inYear(d.date, y)).length,
  }
}
