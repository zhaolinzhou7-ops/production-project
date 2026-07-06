import { KEYS, readTable, writeTable, readObject, writeObject } from './db'
import { newId } from '../core/id'
import { initialSrs, gradeCard, isDue } from '../core/srs'
import { getPackMeta } from '../core/learningContent'
import type {
  BuiltinCard,
  BuiltinHanziCard,
  BuiltinPoemCard,
  BuiltinWordCard,
} from '../core/learningContent'
import { todayISO } from '../core/dateUtils'
import type {
  CardItemType,
  LearnCard,
  LearnDeck,
  PracticeMode,
  ReviewGrade,
  StudyState,
} from '../types'

const POINTS_PER_CORRECT = 2

export interface PointStats {
  balance: number
  xp: number
}

/** 当前孩子 id(小程序单用户,首个运行自动建一个默认档案) */
export function getCurrentChildId(): string {
  let id = readObject<string>(KEYS.childId, '')
  if (!id) {
    id = newId()
    writeObject(KEYS.childId, id)
  }
  return id
}

export function getPoints(): PointStats {
  return readObject<PointStats>(KEYS.points, { balance: 0, xp: 0 })
}

function addPoints(delta: number): PointStats {
  const cur = getPoints()
  const next = { balance: cur.balance + delta, xp: delta > 0 ? cur.xp + delta : cur.xp }
  writeObject(KEYS.points, next)
  return next
}

function builtinCardToLearnCard(
  c: BuiltinCard,
  itemType: CardItemType,
  deckId: string,
  order: number,
): LearnCard {
  const base = { id: newId(), deckId, order }
  if (itemType === 'poem') {
    const p = c as BuiltinPoemCard
    return {
      ...base,
      front: p.title,
      back: p.lines.join('\n'),
      audioText: p.lines.join('，'),
      extra: { author: p.author, dynasty: p.dynasty, lines: p.lines },
    }
  }
  if (itemType === 'hanzi') {
    const h = c as BuiltinHanziCard
    return {
      ...base,
      front: h.c,
      back: h.py,
      phonetic: h.py,
      audioText: h.c,
      extra: h.w ? { word: h.w } : undefined,
    }
  }
  const w = c as BuiltinWordCard
  return {
    ...base,
    front: w.w,
    back: w.tr,
    phonetic: w.ph || undefined,
    audioText: w.w,
    extra: w.pos ? { pos: w.pos } : undefined,
  }
}

/** 确保某内置卡组已为该孩子实例化(建 deck + cards + 每卡 SRS 初始状态)。幂等。返回 deckId。 */
export function ensureBuiltinDeck(childId: string, builtinKey: string): string {
  const decks = readTable<LearnDeck>(KEYS.decks)
  const existing = decks.find((d) => d.childId === childId && d.builtinKey === builtinKey)
  if (existing) return existing.id

  const meta = getPackMeta(builtinKey)
  if (!meta) throw new Error(`未知内容包:${builtinKey}`)
  const pack = meta.load()
  const deckId = newId()
  const now = Date.now()

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
  decks.push(deck)
  writeTable(KEYS.decks, decks)

  const cards = readTable<LearnCard>(KEYS.cards)
  const states = readTable<StudyState>(KEYS.states)
  const init = initialSrs()
  pack.cards.forEach((c, i) => {
    const card = builtinCardToLearnCard(c, pack.itemType, deckId, i)
    cards.push(card)
    states.push({ id: newId(), childId, cardId: card.id, deckId, ...init })
  })
  writeTable(KEYS.cards, cards)
  writeTable(KEYS.states, states)
  return deckId
}

export function listChildDecks(childId: string): LearnDeck[] {
  return readTable<LearnDeck>(KEYS.decks)
    .filter((d) => d.childId === childId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function countDue(childId: string, deckId: string): number {
  const today = todayISO()
  return readTable<StudyState>(KEYS.states).filter(
    (s) => s.childId === childId && s.deckId === deckId && isDue(s, today),
  ).length
}

export interface DueCard {
  card: LearnCard
  state: StudyState
}

/** 取一个卡组今天要练的卡(到期优先,new 补足),limit 控制题量。 */
export function getSessionCards(childId: string, deckId: string, limit = 12): DueCard[] {
  const today = todayISO()
  const states = readTable<StudyState>(KEYS.states).filter(
    (s) => s.childId === childId && s.deckId === deckId,
  )
  const due = states.filter((s) => isDue(s, today))
  due.sort((a, b) => {
    if (a.status === 'new' && b.status !== 'new') return 1
    if (b.status === 'new' && a.status !== 'new') return -1
    return a.due.localeCompare(b.due)
  })
  const chosen = due.slice(0, limit)
  const cardsById = new Map(readTable<LearnCard>(KEYS.cards).map((c) => [c.id, c]))
  const out: DueCard[] = []
  for (const s of chosen) {
    const card = cardsById.get(s.cardId)
    if (card) out.push({ card, state: s })
  }
  return out
}

/** 所有卡(用于会话中取干扰项 / 诗句池) */
export function getDeckCards(deckId: string): LearnCard[] {
  return readTable<LearnCard>(KEYS.cards).filter((c) => c.deckId === deckId)
}

export function getDeck(deckId: string): LearnDeck | undefined {
  return readTable<LearnDeck>(KEYS.decks).find((d) => d.id === deckId)
}

/** 单卡评分后更新 SRS(加分在会话结束统一结算) */
export function applyGrade(stateId: string, grade: ReviewGrade): void {
  const states = readTable<StudyState>(KEYS.states)
  const idx = states.findIndex((s) => s.id === stateId)
  if (idx < 0) return
  const upd = gradeCard(states[idx], grade)
  states[idx] = { ...states[idx], ...upd, lastReviewed: Date.now() }
  writeTable(KEYS.states, states)
}

export interface SessionResult {
  correct: number
  total: number
  pointsAwarded: number
  newBalance: number
  newXp: number
}

/** 会话结束:记录 session、按答对数加分。 */
export function finishSession(params: {
  childId: string
  deckId: string
  mode: PracticeMode
  total: number
  correct: number
  durationSec: number
}): SessionResult {
  const { childId, deckId, mode, total, correct, durationSec } = params
  const points = correct * POINTS_PER_CORRECT
  const sessions = readTable(KEYS.sessions)
  sessions.push({
    id: newId(),
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
  writeTable(KEYS.sessions, sessions)
  const after = addPoints(points)
  return {
    correct,
    total,
    pointsAwarded: points,
    newBalance: after.balance,
    newXp: after.xp,
  }
}
