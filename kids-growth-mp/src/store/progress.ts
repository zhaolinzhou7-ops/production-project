import { KEYS, readTable, readObject, writeObject } from './db'
import { todayISO, addDays } from '../core/dateUtils'
import { earnedCodes, type AchievementCtx } from '../core/achievements'
import { STICKER_CATALOG } from '../core/stickers'
import { ownedStickers, getPet } from './fun'
import { levelOf, type LevelInfo } from '../core/levels'
import { getPoints, getStudyStreak } from './study'
import type { StudyState } from '../types'

// 成就 / 等级 / 学习统计。都是从既有记录算出来的,不额外存冗余数据,
// 只把「已经庆祝过的成就」和几个累计计数存下来。

const SEEN_ACH_KEY = 'seenAchievements'
const COUNTERS_KEY = 'counters'

interface Counters {
  /** 单组满分次数 */
  perfects: number
  /** 历史最高连对 */
  bestCombo: number
  /** 累计完成每日挑战的天数 */
  challengeDays: number
}

const EMPTY_COUNTERS: Counters = { perfects: 0, bestCombo: 0, challengeDays: 0 }

export function getCounters(): Counters {
  const c = readObject<Counters>(COUNTERS_KEY, EMPTY_COUNTERS)
  return { ...EMPTY_COUNTERS, ...c }
}

/** 一组练习结束时更新累计计数 */
export function noteSessionEnd(params: {
  correct: number
  total: number
  bestCombo: number
  challengeJustDone: boolean
}): void {
  const c = getCounters()
  writeObject(COUNTERS_KEY, {
    perfects: c.perfects + (params.total > 0 && params.correct === params.total ? 1 : 0),
    bestCombo: Math.max(c.bestCombo, params.bestCombo),
    challengeDays: c.challengeDays + (params.challengeJustDone ? 1 : 0),
  })
}

// ---------------------------------------------------------------- 统计

export interface LearningStats {
  /** 已掌握的卡片数 */
  mastered: number
  /** 学习中(见过但还没掌握) */
  learning: number
  /** 还没开始的 */
  fresh: number
  /** 累计练习组数(含口算) */
  sessions: number
  /** 累计口算题数 */
  mathDone: number
  /** 累计答题数与正确数 */
  answered: number
  correct: number
  /** 连续学习天数 */
  streak: number
  /** 近 14 天每天的题量 */
  curve: Array<{ date: string; n: number }>
  level: LevelInfo
  xp: number
}

interface SessionRow {
  date: string
  total: number
  correct: number
}
interface DrillRow {
  date: string
  total: number
  correct: number
}

export function getStats(childId: string): LearningStats {
  const states = readTable<StudyState>(KEYS.states).filter((s) => s.childId === childId)
  let mastered = 0
  let learning = 0
  let fresh = 0
  for (const s of states) {
    if (s.status === 'mastered') mastered++
    else if (s.status === 'new') fresh++
    else learning++
  }

  const sessions = readTable<SessionRow>(KEYS.sessions)
  const drills = readTable<DrillRow>(KEYS.drills)

  let answered = 0
  let correct = 0
  const byDate = new Map<string, number>()
  for (const r of [...sessions, ...drills]) {
    answered += r.total || 0
    correct += r.correct || 0
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + (r.total || 0))
  }

  const curve: Array<{ date: string; n: number }> = []
  const today = todayISO()
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i)
    curve.push({ date: d, n: byDate.get(d) ?? 0 })
  }

  const xp = getPoints().xp
  return {
    mastered,
    learning,
    fresh,
    sessions: sessions.length + drills.length,
    mathDone: drills.reduce((a, d) => a + (d.total || 0), 0),
    answered,
    correct,
    streak: getStudyStreak(),
    curve,
    level: levelOf(xp),
    xp,
  }
}

/** 最容易错的卡片(按 lapses 排序),给家长看薄弱点 */
export function weakCards(childId: string, limit = 10): Array<{ front: string; lapses: number }> {
  const states = readTable<StudyState>(KEYS.states).filter(
    (s) => s.childId === childId && s.lapses > 0,
  )
  const cards = new Map(
    readTable<{ id: string; front: string }>(KEYS.cards).map((c) => [c.id, c.front]),
  )
  return states
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit)
    .map((s) => ({ front: cards.get(s.cardId) ?? '(已删除)', lapses: s.lapses }))
}

// ---------------------------------------------------------------- 成就

export function achievementCtx(childId: string): AchievementCtx {
  const st = getStats(childId)
  const c = getCounters()
  const pet = getPet()
  return {
    sessions: st.sessions,
    mastered: st.mastered,
    streak: st.streak,
    perfects: c.perfects,
    bestCombo: c.bestCombo,
    stickers: ownedStickers().length,
    petsGrown: pet.graduated.length,
    mathDone: st.mathDone,
    challengeDays: c.challengeDays,
  }
}

export function earnedAchievements(childId: string): string[] {
  return earnedCodes(achievementCtx(childId), STICKER_CATALOG.length)
}

/**
 * 找出「刚拿到、还没庆祝过」的成就,并标记为已庆祝。
 * 结算页用它弹徽章 —— 只弹一次,不会每次结算都重复恭喜。
 */
export function claimNewAchievements(childId: string): string[] {
  const earned = earnedAchievements(childId)
  const seen = readObject<string[]>(SEEN_ACH_KEY, [])
  const fresh = earned.filter((c) => !seen.includes(c))
  if (fresh.length > 0) writeObject(SEEN_ACH_KEY, [...seen, ...fresh])
  return fresh
}

/**
 * 已经掌握的都有哪些。
 *
 * 这是家长真正想知道的那件事。积分、等级、连续天数是**动力设计**,
 * 回答不了「他到底会了多少」——而后者才是判断这个工具值不值得
 * 继续用下去的唯一依据。
 *
 * 按卡组分组给出,家长一眼能看到「英语会了 40 个,识字会了 12 个」。
 */
export function masteredByDeck(
  childId: string,
): Array<{ deck: string; count: number; sample: string[] }> {
  const states = readTable<StudyState>(KEYS.states).filter(
    (s) => s.childId === childId && s.status === 'mastered',
  )
  const cards = new Map(
    readTable<{ id: string; front: string; deckId: string }>(KEYS.cards).map((c) => [c.id, c]),
  )
  const deckNames = new Map(
    readTable<{ id: string; name: string }>(KEYS.decks).map((d) => [d.id, d.name]),
  )
  const byDeck = new Map<string, string[]>()
  for (const s of states) {
    const c = cards.get(s.cardId)
    if (!c) continue
    const name = deckNames.get(c.deckId) ?? '其它'
    const arr = byDeck.get(name) ?? []
    arr.push(c.front)
    byDeck.set(name, arr)
  }
  return [...byDeck.entries()]
    .map(([deck, fronts]) => ({ deck, count: fronts.length, sample: fronts.slice(0, 12) }))
    .sort((a, b) => b.count - a.count)
}
