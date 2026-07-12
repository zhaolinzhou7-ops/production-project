import { db } from './db'
import { newId } from '../lib/id'
import { getChildPointStats } from '../lib/points'
import { initialSrs, gradeCard, isDue } from '../lib/srs'
import { getPackMeta } from '../lib/learningContent'
import type {
  BuiltinCard,
  BuiltinHanziCard,
  BuiltinPicCard,
  BuiltinPoemCard,
  BuiltinWordCard,
} from '../lib/learningContent'
import { computeStreak } from '../lib/streak'
import { addDays, todayISO } from '../lib/dateUtils'
import type { CardItemType, LearnCard, LearnDeck, PracticeMode, ReviewGrade, StudyState } from '../types'

/** 每答对一张卡的积分 */
const POINTS_PER_CORRECT = 2

/** 错词本卡组名称(每个孩子一个,存答错的单词) */
const WRONG_DECK_NAME = '错词本'

/** 把内容包里的一条(按 itemType 不同结构)转成通用 LearnCard */
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
  if (itemType === 'pic') {
    const p = c as BuiltinPicCard
    return {
      ...base,
      front: p.front,
      back: p.en,
      audioText: p.say ?? p.front,
      extra: { emoji: p.emoji, en: p.en },
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

    const cards: LearnCard[] = pack.cards.map((c, i) =>
      builtinCardToLearnCard(c, pack.itemType, deckId, i),
    )
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

/** 自由练习:不看到期排期,从卡组随机抽一组(不改 SRS,想练多少组都行) */
export async function getFreeSessionCards(
  childId: string,
  deckId: string,
  limit = 12,
): Promise<DueCard[]> {
  const states = await db.studyStates
    .where('[childId+deckId]')
    .equals([childId, deckId])
    .toArray()
  const shuffled = [...states]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const chosen = shuffled.slice(0, limit)
  const cards = await db.cards.bulkGet(chosen.map((s) => s.cardId))
  const out: DueCard[] = []
  chosen.forEach((state, i) => {
    const card = cards[i]
    if (card) out.push({ card, state })
  })
  return out
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

/** 每答对一道口算题的积分 */
const POINTS_PER_CORRECT_MATH = 1

/** 口算练习结束:记录 drillResults、按答对数加分。返回结算数据。 */
export async function finishDrill(params: {
  childId: string
  kind: string
  total: number
  correct: number
  durationSec: number
}): Promise<SessionResult> {
  const { childId, kind, total, correct, durationSec } = params
  const points = correct * POINTS_PER_CORRECT_MATH

  const result = await db.transaction('rw', db.drillResults, db.pointLedger, async () => {
    const stats = await getChildPointStats(childId)
    const balanceAfter = stats.balance + points
    const drillId = newId()
    await db.drillResults.add({
      id: drillId,
      childId,
      kind,
      date: todayISO(),
      total,
      correct,
      durationSec,
      createdAt: Date.now(),
    })
    if (points > 0) {
      await db.pointLedger.add({
        id: newId(),
        childId,
        delta: points,
        reason: 'study',
        refType: undefined,
        refId: drillId,
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

// ============ 错词本 ============

/** 确保该孩子的错词本卡组存在(单词类型,便于用真人音源重练)。返回 deckId。幂等。 */
export async function ensureWrongDeck(childId: string): Promise<string> {
  const existing = await db.decks
    .where('childId')
    .equals(childId)
    .filter((d) => d.source === 'wrong' && d.itemType === 'word')
    .first()
  if (existing) return existing.id

  const deckId = newId()
  const deck: LearnDeck = {
    id: deckId,
    childId,
    subject: '英语',
    name: WRONG_DECK_NAME,
    icon: '❗',
    source: 'wrong',
    itemType: 'word',
    createdAt: Date.now(),
  }
  await db.decks.add(deck)
  return deckId
}

/**
 * 把一张答错的单词卡收进错词本(按单词去重)。已在错词本或已掌握的不再重复加入。
 * 传入原卡的展示字段而非引用,避免耦合来源卡组。
 */
export async function addWrongCard(
  childId: string,
  src: Pick<LearnCard, 'front' | 'back' | 'phonetic' | 'audioText' | 'extra'>,
): Promise<void> {
  const wrongDeckId = await ensureWrongDeck(childId)
  const dup = await db.cards
    .where('deckId')
    .equals(wrongDeckId)
    .filter((c) => c.front === src.front)
    .first()
  if (dup) return

  const count = await db.cards.where('deckId').equals(wrongDeckId).count()
  const cardId = newId()
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await db.cards.add({
      id: cardId,
      deckId: wrongDeckId,
      front: src.front,
      back: src.back,
      phonetic: src.phonetic,
      audioText: src.audioText ?? src.front,
      extra: src.extra,
      order: count,
    })
    await db.studyStates.add({
      id: newId(),
      childId,
      cardId,
      deckId: wrongDeckId,
      ...initialSrs(),
    })
  })
}

// ============ 全学科错题本(手动录入,跨学科) ============

/** 错题本卡组名称(每个孩子一个,存手动录入的各学科错题) */
const ERROR_DECK_NAME = '错题本'

/** 确保该孩子的(跨学科)错题本卡组存在。返回 deckId。幂等。 */
export async function ensureErrorDeck(childId: string): Promise<string> {
  const existing = await db.decks
    .where('childId')
    .equals(childId)
    .filter((d) => d.source === 'wrong' && d.itemType === 'wrong')
    .first()
  if (existing) return existing.id

  const deckId = newId()
  await db.decks.add({
    id: deckId,
    childId,
    subject: '错题',
    name: ERROR_DECK_NAME,
    icon: '📕',
    source: 'wrong',
    itemType: 'wrong',
    createdAt: Date.now(),
  })
  return deckId
}

/** 手动录入一道错题(题干/答案,可选学科与照片)。返回 cardId。 */
export async function addErrorCard(
  childId: string,
  entry: { front: string; back: string; subject?: string; photo?: string },
): Promise<string> {
  const deckId = await ensureErrorDeck(childId)
  const count = await db.cards.where('deckId').equals(deckId).count()
  const cardId = newId()
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await db.cards.add({
      id: cardId,
      deckId,
      front: entry.front.trim(),
      back: entry.back.trim(),
      extra: {
        ...(entry.subject ? { subject: entry.subject } : {}),
        ...(entry.photo ? { photo: entry.photo } : {}),
      },
      order: count,
    })
    await db.studyStates.add({ id: newId(), childId, cardId, deckId, ...initialSrs() })
  })
  return cardId
}

/** 列出错题本中的卡片(用于家长/孩子端管理) */
export async function listErrorCards(childId: string): Promise<LearnCard[]> {
  const deckId = await ensureErrorDeck(childId)
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  return cards.sort((a, b) => a.order - b.order)
}

/** 删除一张错题卡(连同其 SRS 状态) */
export async function deleteCard(cardId: string): Promise<void> {
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await db.cards.delete(cardId)
    await db.studyStates.where('cardId').equals(cardId).delete()
  })
}

// ============ 自定义词本 / 卡组管理 ============

export interface CustomWordEntry {
  front: string
  back: string
  phonetic?: string
}

/** 新建一个自定义英语词本并写入词条(每词一张卡 + SRS 初始状态)。返回 deckId。 */
export async function createCustomWordDeck(
  childId: string,
  name: string,
  entries: CustomWordEntry[],
): Promise<string> {
  const deckId = newId()
  const now = Date.now()
  await db.transaction('rw', db.decks, db.cards, db.studyStates, async () => {
    const deck: LearnDeck = {
      id: deckId,
      childId,
      subject: '英语',
      name: name.trim() || '我的词本',
      icon: '📒',
      source: 'custom',
      itemType: 'word',
      createdAt: now,
    }
    await db.decks.add(deck)
    await addEntriesTx(deckId, childId, entries, 0)
  })
  return deckId
}

/** 往已有卡组追加词条(用于自定义词本继续加词)。返回新增数量。 */
export async function addEntriesToDeck(
  deckId: string,
  childId: string,
  entries: CustomWordEntry[],
): Promise<number> {
  const start = await db.cards.where('deckId').equals(deckId).count()
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await addEntriesTx(deckId, childId, entries, start)
  })
  return entries.length
}

async function addEntriesTx(
  deckId: string,
  childId: string,
  entries: CustomWordEntry[],
  startOrder: number,
): Promise<void> {
  const init = initialSrs()
  const cards: LearnCard[] = entries.map((e, i) => ({
    id: newId(),
    deckId,
    front: e.front.trim(),
    back: e.back.trim(),
    phonetic: e.phonetic?.trim() || undefined,
    audioText: e.front.trim(),
    order: startOrder + i,
  }))
  await db.cards.bulkAdd(cards)
  await db.studyStates.bulkAdd(
    cards.map((c) => ({ id: newId(), childId, cardId: c.id, deckId, ...init })),
  )
}

/** 解析用户粘贴的词表:每行「word 释义」或「word,释义」或「word 音标 释义」。 */
export function parseWordList(text: string): CustomWordEntry[] {
  const out: CustomWordEntry[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // 支持逗号/制表符/多空格分隔
    const parts = line.split(/\s*[,，\t]\s*|\s{2,}/).filter(Boolean)
    let front = ''
    let back = ''
    let phonetic: string | undefined
    if (parts.length >= 2) {
      front = parts[0]
      back = parts.slice(1).join(' ')
    } else {
      // 单空格分隔:第一个 token 作单词,其余作释义
      const sp = line.split(/\s+/)
      front = sp[0]
      back = sp.slice(1).join(' ')
    }
    // 若释义里以 /.../ 开头,拆出音标
    const m = back.match(/^\/([^/]+)\/\s*(.*)$/)
    if (m) {
      phonetic = m[1]
      back = m[2]
    }
    if (front && back) out.push({ front, back, phonetic })
  }
  return out
}

/** 删除一个卡组及其全部卡片、SRS 状态、会话记录(仅限 custom/wrong,内置不删)。 */
export async function deleteDeck(deckId: string): Promise<void> {
  await db.transaction(
    'rw',
    db.decks,
    db.cards,
    db.studyStates,
    db.studySessions,
    async () => {
      await db.decks.delete(deckId)
      await db.cards.where('deckId').equals(deckId).delete()
      await db.studyStates.where('deckId').equals(deckId).delete()
      await db.studySessions.where('deckId').equals(deckId).delete()
    },
  )
}

/** 列出该孩子的全部卡组 */
export async function listChildDecks(childId: string): Promise<LearnDeck[]> {
  const decks = await db.decks.where('childId').equals(childId).toArray()
  return decks.sort((a, b) => a.createdAt - b.createdAt)
}

// ============ 学习统计(家长学习管理页) ============

export interface WeakCard {
  front: string
  back: string
  lapses: number
}

export interface DeckStat {
  deckId: string
  name: string
  icon: string
  source: LearnDeck['source']
  total: number
  mastered: number
  due: number
}

export interface LearningStats {
  totalCards: number
  mastered: number
  learning: number
  fresh: number // 'new' 状态
  dueToday: number
  todayReviewed: number // 今日已练卡次(会话 total 之和)
  studyStreak: number
  totalSessions: number
  /** 近 14 天每天练习卡次 */
  curve: { date: string; count: number }[]
  weak: WeakCard[]
  decks: DeckStat[]
}

/** 汇总该孩子的学习数据,供家长管理页展示 */
export async function getLearningStats(childId: string): Promise<LearningStats> {
  const today = todayISO()
  const [states, sessions, drills, decks, cards] = await Promise.all([
    db.studyStates.where('childId').equals(childId).toArray(),
    db.studySessions.where('childId').equals(childId).toArray(),
    db.drillResults.where('childId').equals(childId).toArray(),
    listChildDecks(childId),
    db.cards.toArray(),
  ])

  const cardById = new Map(cards.map((c) => [c.id, c]))
  const deckIds = new Set(decks.map((d) => d.id))
  // 只统计仍归属该孩子现有卡组的状态
  const own = states.filter((s) => deckIds.has(s.deckId))

  const mastered = own.filter((s) => s.status === 'mastered').length
  const fresh = own.filter((s) => s.status === 'new').length
  const learning = own.filter((s) => s.status === 'learning' || s.status === 'review').length
  const dueToday = own.filter((s) => isDue(s, today)).length

  // 近 14 天曲线 + 今日练习量(单词/古诗/识字会话 + 口算题数)
  const curve: { date: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i)
    const sCount = sessions.filter((s) => s.date === d).reduce((sum, s) => sum + s.total, 0)
    const dCount = drills.filter((s) => s.date === d).reduce((sum, s) => sum + s.total, 0)
    curve.push({ date: d, count: sCount + dCount })
  }
  const todayReviewed = curve[curve.length - 1]?.count ?? 0
  const studyDates = new Set<string>([...sessions.map((s) => s.date), ...drills.map((s) => s.date)])
  const studyStreak = computeStreak(studyDates, today)

  // 薄弱词:遗忘次数多、尚未掌握,按 lapses 降序取前 12
  const weak: WeakCard[] = own
    .filter((s) => s.lapses >= 1 && s.status !== 'mastered')
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 12)
    .map((s) => {
      const c = cardById.get(s.cardId)
      return { front: c?.front ?? '?', back: c?.back ?? '', lapses: s.lapses }
    })

  // 每个卡组的分项统计
  const statesByDeck = new Map<string, StudyState[]>()
  for (const s of own) {
    const arr = statesByDeck.get(s.deckId) ?? []
    arr.push(s)
    statesByDeck.set(s.deckId, arr)
  }
  const deckStats: DeckStat[] = decks.map((d) => {
    const arr = statesByDeck.get(d.id) ?? []
    return {
      deckId: d.id,
      name: d.name,
      icon: d.icon,
      source: d.source,
      total: arr.length,
      mastered: arr.filter((s) => s.status === 'mastered').length,
      due: arr.filter((s) => isDue(s, today)).length,
    }
  })

  return {
    totalCards: own.length,
    mastered,
    learning,
    fresh,
    dueToday,
    todayReviewed,
    studyStreak,
    totalSessions: sessions.length,
    curve,
    weak,
    decks: deckStats,
  }
}

// ============ 每日目标(存于 settings.learnGoals,随备份一起保存) ============

const DEFAULT_DAILY_GOAL = 15

export async function getDailyGoal(childId: string): Promise<number> {
  const settings = await db.settings.get('singleton')
  return settings?.learnGoals?.[childId] ?? DEFAULT_DAILY_GOAL
}

export async function setDailyGoal(childId: string, goal: number): Promise<void> {
  const settings = await db.settings.get('singleton')
  if (!settings) return
  const learnGoals = { ...(settings.learnGoals ?? {}), [childId]: Math.max(1, Math.round(goal)) }
  await db.settings.update('singleton', { learnGoals })
}
