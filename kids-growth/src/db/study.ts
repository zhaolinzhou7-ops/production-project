import { db } from './db'
import { newId } from '../lib/id'
import { getChildPointStats } from '../lib/points'
import { initialSrs, gradeCard, isDue } from '../lib/srs'
import { getPackMeta } from '../lib/learningContent'
import { todayISO } from '../lib/dateUtils'
import type { LearnCard, LearnDeck, PracticeMode, ReviewGrade, StudyState } from '../types'

/** 每答对一张卡的积分 */
const POINTS_PER_CORRECT = 2

/**
 * 确保某内置卡组已为该孩子实例化(建 deck + cards + 每卡的 SRS 初始状态)。幂等。
 * 返回 deckId。
 */
export async function ensureBuiltinDeck(childId: string, builtinKey: string): Promise<string> {
  const meta = getPackMeta(builtinKey)
  if (!meta) throw new Error(`未知内容包:${builtinKey}`)

  const existing = await db.decks
    .where('childId')
    .equals(childId)
    .filter((d) => d.builtinKey === builtinKey)
    .first()
  if (existing) return existing.id

  const pack = await meta.load()
  const deckId = newId()
  const now = Date.now()

  await db.transaction('rw', db.decks, db.cards, db.studyStates, async () => {
    const deck: LearnDeck = {
      id: deckId,
      childId,
      subject: pack.subject,
      name: pack.name,
      icon: meta.icon,
      source: 'builtin',
      builtinKey,
      itemType: pack.itemType,
      createdAt: now,
    }
    await db.decks.add(deck)

    const cards: LearnCard[] = pack.cards.map((c, i) => ({
      id: newId(),
      deckId,
      front: c.w,
      back: c.tr,
      phonetic: c.ph || undefined,
      audioText: c.w,
      extra: c.pos ? { pos: c.pos } : undefined,
      order: i,
    }))
    await db.cards.bulkAdd(cards)

    const init = initialSrs()
    const states: StudyState[] = cards.map((card) => ({
      id: newId(),
      childId,
      cardId: card.id,
      deckId,
      ...init,
    }))
    await db.studyStates.bulkAdd(states)
  })

  return deckId
}

export interface DueCard {
  card: LearnCard
  state: StudyState
}

/**
 * 取一个卡组今天要练的卡(到期的 review/learning + 若干 new),按到期优先。
 * limit 控制单次会话题量。
 */
export async function getSessionCards(
  childId: string,
  deckId: string,
  limit = 12,
): Promise<DueCard[]> {
  const today = todayISO()
  const states = await db.studyStates
    .where('[childId+deckId]')
    .equals([childId, deckId])
    .toArray()

  const due = states.filter((s) => isDue(s, today))
  // 到期优先(due 早的在前),new 卡按 cardId 稳定排序补足
  due.sort((a, b) => {
    if (a.status === 'new' && b.status !== 'new') return 1
    if (b.status === 'new' && a.status !== 'new') return -1
    return a.due.localeCompare(b.due)
  })
  const chosen = due.slice(0, limit)

  const cardIds = chosen.map((s) => s.cardId)
  const cards = await db.cards.bulkGet(cardIds)
  const result: DueCard[] = []
  chosen.forEach((state, i) => {
    const card = cards[i]
    if (card) result.push({ card, state })
  })
  return result
}

/** 今天该卡组的应练数量(用于首页展示) */
export async function countDue(childId: string, deckId: string): Promise<number> {
  const today = todayISO()
  const states = await db.studyStates
    .where('[childId+deckId]')
    .equals([childId, deckId])
    .toArray()
  return states.filter((s) => isDue(s, today)).length
}

/** 单张卡评分后更新 SRS(不加分,加分在会话结束统一结算) */
export async function applyGrade(stateId: string, grade: ReviewGrade): Promise<void> {
  const state = await db.studyStates.get(stateId)
  if (!state) return
  const upd = gradeCard(state, grade)
  await db.studyStates.update(stateId, { ...upd, lastReviewed: Date.now() })
}

export interface SessionResult {
  correct: number
  total: number
  pointsAwarded: number
  newBalance: number
  newXp: number
}

/** 会话结束:记录 session、按答对数加分。返回结算数据供庆祝页。 */
export async function finishSession(params: {
  childId: string
  deckId: string
  mode: PracticeMode
  total: number
  correct: number
  durationSec: number
}): Promise<SessionResult> {
  const { childId, deckId, mode, total, correct, durationSec } = params
  const points = correct * POINTS_PER_CORRECT

  const result = await db.transaction('rw', db.studySessions, db.pointLedger, async () => {
    const stats = await getChildPointStats(childId)
    const balanceAfter = stats.balance + points

    const sessionId = newId()
    await db.studySessions.add({
      id: sessionId,
      childId,
      deckId,
      mode,
      date: todayISO(),
      total,
      correct,
      durationSec,
      pointsAwarded: points,
      createdAt: Date.now(),
    })

    if (points > 0) {
      await db.pointLedger.add({
        id: newId(),
        childId,
        delta: points,
        reason: 'study',
        refType: undefined,
        refId: sessionId,
        balanceAfter,
        timestamp: Date.now(),
      })
    }

    return { balanceAfter, xpAfter: stats.xp + points }
  })

  return {
    correct,
    total,
    pointsAwarded: points,
    newBalance: result.balanceAfter,
    newXp: result.xpAfter,
  }
}

/** 该孩子已掌握(mastered)的卡片总数,用于成就/统计 */
export async function countMastered(childId: string): Promise<number> {
  return db.studyStates
    .where('childId')
    .equals(childId)
    .filter((s) => s.status === 'mastered')
    .count()
}
