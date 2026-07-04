import { db } from '../db/db'
import { toISODate } from './dateUtils'
import type { LevelStep } from '../types'

export interface TimelineItem {
  id: string
  kind: 'milestone' | 'portfolio' | 'diary' | 'levelup' | 'badge' | 'exam' | 'anecdote'
  date: string // ISO date used for ordering
  sortKey: number // secondary ordering within a day
  title: string
  desc?: string
  icon: string
  photos: string[]
  mood?: string
}

/** Derives level-up events from the ledger: each crossing of a ladder threshold, in time order. */
function deriveLevelUps(
  ledger: { delta: number; timestamp: number }[],
  ladder: LevelStep[],
): { level: LevelStep; timestamp: number }[] {
  const sorted = [...ledger].sort((a, b) => a.timestamp - b.timestamp)
  const thresholds = [...ladder].sort((a, b) => a.requiredXP - b.requiredXP)
  const events: { level: LevelStep; timestamp: number }[] = []
  let xp = 0
  let levelIdx = 0 // index of current level in thresholds
  for (const entry of sorted) {
    if (entry.delta <= 0) continue
    xp += entry.delta
    while (levelIdx + 1 < thresholds.length && xp >= thresholds[levelIdx + 1].requiredXP) {
      levelIdx++
      events.push({ level: thresholds[levelIdx], timestamp: entry.timestamp })
    }
  }
  return events
}

export async function buildTimeline(childId: string): Promise<TimelineItem[]> {
  const [milestones, portfolios, diaryEntries, ledger, unlocks, achievements, settings, exams, examScores, anecdotes] =
    await Promise.all([
      db.milestones.where('childId').equals(childId).toArray(),
      db.portfolios.where('childId').equals(childId).toArray(),
      db.diaryEntries.where('childId').equals(childId).toArray(),
      db.pointLedger.where('childId').equals(childId).toArray(),
      db.unlocks.where('childId').equals(childId).toArray(),
      db.achievements.toArray(),
      db.settings.get('singleton'),
      db.exams.where('childId').equals(childId).toArray(),
      db.examScores.where('childId').equals(childId).toArray(),
      db.anecdotes.where('childId').equals(childId).toArray(),
    ])

  const items: TimelineItem[] = []

  for (const m of milestones) {
    items.push({
      id: `milestone-${m.id}`,
      kind: 'milestone',
      date: m.date,
      sortKey: m.createdAt,
      title: m.title,
      desc: m.note,
      icon: '🏆',
      photos: m.photo ? [m.photo] : [],
    })
  }

  for (const p of portfolios) {
    items.push({
      id: `portfolio-${p.id}`,
      kind: 'portfolio',
      date: p.date,
      sortKey: p.createdAt,
      title: `${p.type}入档：${p.title}`,
      desc: p.desc,
      icon: '🎨',
      photos: p.photos,
    })
  }

  for (const d of diaryEntries) {
    items.push({
      id: `diary-${d.id}`,
      kind: 'diary',
      date: d.date,
      sortKey: d.createdAt,
      title: d.title || '家长寄语',
      desc: d.content,
      icon: '💌',
      photos: d.photos,
      mood: d.mood,
    })
  }

  if (settings) {
    for (const e of deriveLevelUps(ledger, settings.levelLadder)) {
      items.push({
        id: `levelup-${e.level.level}-${e.timestamp}`,
        kind: 'levelup',
        date: toISODate(new Date(e.timestamp)),
        sortKey: e.timestamp,
        title: `升级到 Lv.${e.level.level} ${e.level.title}`,
        icon: '⬆️',
        photos: [],
      })
    }
  }

  const scoresByExam = new Map<string, string[]>()
  for (const s of examScores) {
    if (!scoresByExam.has(s.examId)) scoresByExam.set(s.examId, [])
    scoresByExam.get(s.examId)!.push(`${s.subject} ${s.score}${s.fullScore ? `/${s.fullScore}` : ''}`)
  }
  for (const e of exams) {
    items.push({
      id: `exam-${e.id}`,
      kind: 'exam',
      date: e.date,
      sortKey: e.createdAt,
      title: e.name || `${e.examType}考试`,
      desc: (scoresByExam.get(e.id) ?? []).join(' · ') || undefined,
      icon: '📝',
      photos: [],
    })
  }

  for (const a of anecdotes) {
    items.push({
      id: `anecdote-${a.id}`,
      kind: 'anecdote',
      date: a.date,
      sortKey: a.createdAt,
      title: a.kind === 'shine' ? '闪光时刻' : '成长时刻',
      desc: a.content,
      icon: a.kind === 'shine' ? '✨' : '🌱',
      photos: a.photos,
    })
  }

  const achievementByCode = new Map(achievements.map((a) => [a.code, a]))
  for (const u of unlocks) {
    const a = achievementByCode.get(u.achievementCode)
    if (!a) continue
    items.push({
      id: `badge-${u.id}`,
      kind: 'badge',
      date: toISODate(new Date(u.unlockedAt)),
      sortKey: u.unlockedAt,
      title: `解锁徽章「${a.name}」`,
      desc: a.desc,
      icon: a.icon,
      photos: [],
    })
  }

  items.sort((a, b) => (a.date === b.date ? b.sortKey - a.sortKey : b.date.localeCompare(a.date)))
  return items
}
