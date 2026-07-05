import { db } from '../db/db'
import { toISODate } from './dateUtils'
import type { LevelStep } from '../types'

export interface TimelineItem {
  id: string
  kind: 'milestone' | 'portfolio' | 'diary' | 'levelup' | 'badge' | 'exam' | 'anecdote' | 'talent' | 'study'
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
  const [milestones, portfolios, diaryEntries, ledger, unlocks, achievements, settings, exams, examScores, anecdotes, talentRecords, studyStates, decks, allCards] =
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
      db.records
        .where('childId')
        .equals(childId)
        .filter((r) => r.module === 'grading' || r.module === 'award')
        .toArray(),
      db.studyStates.where('childId').equals(childId).toArray(),
      db.decks.toArray(),
      db.cards.toArray(),
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

  for (const r of talentRecords) {
    const isGrading = r.module === 'grading'
    const title = isGrading
      ? `考级：${r.fields.project ?? ''} ${r.fields.level ?? ''}`.trim()
      : `获奖：${r.fields.contest ?? ''}`.trim()
    const desc = isGrading
      ? [r.fields.result, r.fields.org].filter(Boolean).join(' · ') || undefined
      : [r.fields.scope, r.fields.prize].filter(Boolean).join(' · ') || undefined
    items.push({
      id: `talent-${r.id}`,
      kind: 'talent',
      date: r.date,
      sortKey: r.createdAt,
      title,
      desc,
      icon: isGrading ? '🏅' : '🏆',
      photos: r.photos,
    })
  }

  // 学习里程碑:背会古诗(逐首) + 掌握词汇/汉字(阈值)
  const itemTypeByDeck = new Map(decks.map((d) => [d.id, d.itemType]))
  const cardById = new Map(allCards.map((c) => [c.id, c]))
  const mastered = studyStates
    .filter((s) => s.status === 'mastered' && s.lastReviewed != null)
    .sort((a, b) => (a.lastReviewed ?? 0) - (b.lastReviewed ?? 0))

  // 背会的古诗,逐首上时间线
  for (const s of mastered) {
    if (itemTypeByDeck.get(s.deckId) !== 'poem') continue
    const card = cardById.get(s.cardId)
    if (!card) continue
    items.push({
      id: `poem-${s.id}`,
      kind: 'study',
      date: toISODate(new Date(s.lastReviewed!)),
      sortKey: s.lastReviewed!,
      title: `背会古诗《${card.front}》`,
      icon: '📜',
      photos: [],
    })
  }

  // 词汇/汉字掌握量阈值里程碑
  const THRESHOLDS = [10, 50, 100, 200, 500, 1000]
  for (const [type, label] of [
    ['word', '单词'],
    ['hanzi', '汉字'],
  ] as const) {
    const seq = mastered.filter((s) => itemTypeByDeck.get(s.deckId) === type)
    for (const th of THRESHOLDS) {
      if (seq.length >= th) {
        const at = seq[th - 1]
        items.push({
          id: `vocab-${type}-${th}`,
          kind: 'study',
          date: toISODate(new Date(at.lastReviewed!)),
          sortKey: at.lastReviewed!,
          title: `掌握 ${th} 个${label}`,
          icon: type === 'word' ? '🔤' : '🈷️',
          photos: [],
        })
      }
    }
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
