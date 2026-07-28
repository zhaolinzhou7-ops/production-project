import {
  listAnecdotes,
  listExams,
  listGrowth,
  listRecords,
  traitProfile,
} from './records'
import { getStats } from './progress'
import { getPoints } from './study'
import { KEYS, readTable } from './db'
import { levelOf } from '../core/levels'
import { RECORD_MODULES, getRecordModule } from '../core/recordModules'
import { bmiOf } from '../core/bodyMetrics'
import { todayISO } from '../core/dateUtils'

/**
 * 成长时间线与年度报告 —— 都是**算出来的视图**,不存任何新数据。
 *
 * 分散在各处的记录(长高了、考了试、拿了奖、读完一本书、闪光时刻)
 * 单看是一条条流水;串成一条时间线,才是「这孩子长大的过程」。
 */
export interface TimelineItem {
  date: string
  icon: string
  title: string
  detail: string
  /** 用来上色分类 */
  kind: 'growth' | 'exam' | 'anecdote' | 'record'
}

export function buildTimeline(childId: string, limit = 80): TimelineItem[] {
  const items: TimelineItem[] = []

  // 身高体重:只在有身高时记一条,否则时间线会被日常称重刷屏
  for (const g of listGrowth(childId)) {
    const parts: string[] = []
    if (g.heightCm) parts.push(`${g.heightCm} cm`)
    if (g.weightKg) parts.push(`${g.weightKg} kg`)
    if (g.headCm) parts.push(`头围 ${g.headCm} cm`)
    if (parts.length === 0) continue
    items.push({
      date: g.date,
      icon: '📏',
      title: '量了身高体重',
      detail: parts.join(' · '),
      kind: 'growth',
    })
  }

  for (const { exam, scores } of listExams(childId)) {
    const best = scores
      .slice()
      .sort((a, b) => b.score / (b.fullScore || 100) - a.score / (a.fullScore || 100))[0]
    items.push({
      date: exam.date,
      icon: '📝',
      title: exam.name || exam.examType,
      detail: best ? `${best.subject} ${best.score}${best.fullScore ? `/${best.fullScore}` : ''} 等 ${scores.length} 科` : '记录了一次考试',
      kind: 'exam',
    })
  }

  for (const a of listAnecdotes(childId)) {
    items.push({
      date: a.date,
      icon: a.kind === 'shine' ? '✨' : '🌱',
      title: a.kind === 'shine' ? '闪光时刻' : '成长时刻',
      detail: a.traits.length > 0 ? `${a.content}(${a.traits.join('·')})` : a.content,
      kind: 'anecdote',
    })
  }

  for (const def of RECORD_MODULES) {
    for (const r of listRecords(childId, def.module)) {
      items.push({
        date: r.date,
        icon: def.icon,
        title: def.label,
        detail: def.summarize(r.fields),
        kind: 'record',
      })
    }
  }

  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit)
}

// ---------------------------------------------------------------- 年度报告

export interface AnnualReport {
  year: number
  /** 有没有足够的数据值得生成报告 */
  hasData: boolean
  heightGain: number | null
  weightGain: number | null
  bmiLatest: number | null
  examCount: number
  bestSubject: string
  booksRead: number
  bookTitles: string[]
  awards: string[]
  gradings: string[]
  shineCount: number
  topTraits: string[]
  shinePicks: Array<{ date: string; content: string }>
  studiedDays: number
  masteredCards: number
  level: string
  /** 一段自动生成的中文总结 */
  summary: string
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}

/** 哪些年份有数据可看 —— 年份选择器用 */
export function availableYears(childId: string): number[] {
  const years = new Set<number>()
  for (const it of buildTimeline(childId, 9999)) years.add(yearOf(it.date))
  years.add(yearOf(todayISO()))
  return [...years].filter((y) => y > 1970).sort((a, b) => b - a)
}

export function buildAnnualReport(childId: string, year: number): AnnualReport {
  const inYear = (iso: string) => yearOf(iso) === year

  // 长高了多少:取年内最早和最晚各一条有身高的记录相减
  const growth = listGrowth(childId).filter((g) => inYear(g.date)).slice().reverse() // 时间正序
  const heights = growth.filter((g) => typeof g.heightCm === 'number')
  const weights = growth.filter((g) => typeof g.weightKg === 'number')
  const heightGain =
    heights.length >= 2
      ? Math.round(((heights[heights.length - 1].heightCm as number) - (heights[0].heightCm as number)) * 10) / 10
      : null
  const weightGain =
    weights.length >= 2
      ? Math.round(((weights[weights.length - 1].weightKg as number) - (weights[0].weightKg as number)) * 10) / 10
      : null
  const lastBoth = growth.filter((g) => g.heightCm && g.weightKg).pop()
  const bmiLatest = lastBoth ? bmiOf(lastBoth.heightCm as number, lastBoth.weightKg as number) : null

  // 考试:挑一个「得分率最高」的科目当亮点
  const exams = listExams(childId).filter((e) => inYear(e.exam.date))
  let bestSubject = ''
  let bestRate = -1
  for (const { scores } of exams) {
    for (const s of scores) {
      const rate = s.score / (s.fullScore && s.fullScore > 0 ? s.fullScore : 100)
      if (rate > bestRate) {
        bestRate = rate
        bestSubject = s.subject
      }
    }
  }

  const books = listRecords(childId, 'reading').filter((r) => inYear(r.date))
  const bookTitles = books.map((b) => String(b.fields.title || '')).filter(Boolean)

  const awardDef = getRecordModule('award')
  const awards = listRecords(childId, 'award')
    .filter((r) => inYear(r.date))
    .map((r) => (awardDef ? awardDef.summarize(r.fields) : ''))
    .filter(Boolean)

  const gradingDef = getRecordModule('grading')
  const gradings = listRecords(childId, 'grading')
    .filter((r) => inYear(r.date))
    .map((r) => (gradingDef ? gradingDef.summarize(r.fields) : ''))
    .filter(Boolean)

  const anecdotes = listAnecdotes(childId).filter((a) => inYear(a.date))
  const shines = anecdotes.filter((a) => a.kind === 'shine')
  const topTraits = traitProfile(childId).slice(0, 5).map((t) => `${t.trait}×${t.count}`)

  const stats = getStats(childId)
  const pts = getPoints()
  const lv = levelOf(pts.xp)

  // 年内「学过东西的天数」:练习组和口算都算,同一天只记一次
  const days = new Set<string>()
  for (const row of readTable<{ childId: string; date: string }>(KEYS.sessions)) {
    if (row && row.childId === childId && inYear(row.date)) days.add(row.date)
  }
  for (const row of readTable<{ childId: string; date: string }>(KEYS.drills)) {
    if (row && row.childId === childId && inYear(row.date)) days.add(row.date)
  }
  const studiedDays = days.size

  const report: AnnualReport = {
    year,
    hasData: false,
    heightGain,
    weightGain,
    bmiLatest,
    examCount: exams.length,
    bestSubject,
    booksRead: books.length,
    bookTitles: bookTitles.slice(0, 12),
    awards,
    gradings,
    shineCount: shines.length,
    topTraits,
    shinePicks: shines.slice(0, 3).map((a) => ({ date: a.date, content: a.content })),
    studiedDays,
    masteredCards: stats.mastered,
    level: `${lv.cur.emoji} ${lv.cur.name}`,
    summary: '',
  }
  report.hasData =
    heightGain !== null ||
    exams.length > 0 ||
    books.length > 0 ||
    awards.length > 0 ||
    gradings.length > 0 ||
    anecdotes.length > 0 ||
    studiedDays > 0
  report.summary = summarize(report)
  return report
}

/**
 * 自动写一段中文总结。
 *
 * 刻意写得克制:有什么说什么,没有的不编;不给孩子下评语,只陈述发生过的事。
 * 这段话是给孩子看的 —— 语气是「你这一年做到了这些」,不是家长的考评。
 */
function summarize(r: AnnualReport): string {
  if (!r.hasData) return `${r.year} 年还没记下什么。随手记一条身高、一本读完的书,到年底就有故事了。`

  const bits: string[] = []
  if (r.heightGain !== null && r.heightGain > 0) bits.push(`长高了 ${r.heightGain} 厘米`)
  if (r.weightGain !== null && r.weightGain > 0) bits.push(`长重了 ${r.weightGain} 公斤`)
  if (r.booksRead > 0) bits.push(`读完了 ${r.booksRead} 本书`)
  if (r.studiedDays > 0) bits.push(`有 ${r.studiedDays} 天在这里学过东西`)
  if (r.masteredCards > 0) bits.push(`掌握了 ${r.masteredCards} 张卡片`)

  const lines: string[] = []
  lines.push(`${r.year} 年,你${bits.length > 0 ? bits.join('、') : '开始记录自己的成长'}。`)

  if (r.examCount > 0) {
    lines.push(
      r.bestSubject
        ? `记录了 ${r.examCount} 次考试,${r.bestSubject}是这一年考得最好的一科。`
        : `记录了 ${r.examCount} 次考试。`,
    )
  }
  if (r.awards.length > 0) lines.push(`拿到了 ${r.awards.length} 个奖:${r.awards[0]}${r.awards.length > 1 ? ' 等' : ''}。`)
  if (r.gradings.length > 0) lines.push(`通过了 ${r.gradings.length} 次考级:${r.gradings[0]}${r.gradings.length > 1 ? ' 等' : ''}。`)
  if (r.shineCount > 0) {
    lines.push(
      r.topTraits.length > 0
        ? `爸爸妈妈记下了 ${r.shineCount} 个闪光时刻,最常看见的是「${r.topTraits[0].split('×')[0]}」。`
        : `爸爸妈妈记下了 ${r.shineCount} 个闪光时刻。`,
    )
  }
  lines.push(`现在的等级是 ${r.level}。明年继续。`)
  return lines.join('')
}
