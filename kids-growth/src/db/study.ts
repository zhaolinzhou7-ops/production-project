import { db } from './db'
import { newId } from '../lib/id'
import { getChildPointStats } from '../lib/points'
import { initialSrs, gradeCard, isDue, tuningFor } from '../lib/srs'
import { getPackMeta } from '../lib/learningContent'
import type {
  BuiltinCard,
  BuiltinFactCard,
  BuiltinHanziCard,
  BuiltinPicCard,
  BuiltinPoemCard,
  BuiltinWordCard,
} from '../lib/learningContent'
import { computeStreak } from '../lib/streak'
import { addDays, todayISO } from '../lib/dateUtils'
import { getAgeStage } from '../lib/ageStage'
import { dailyPointCap } from '../lib/pointCap'
import { adjustFor, nextLevel, type Adjust } from '../lib/adaptive'
import type { DeckSignal } from '../lib/recommend'
import type { OriginCard } from '../lib/redo'
import type {
  CardItemType,
  LearnCard,
  LearnDeck,
  PracticeMode,
  RedoSpec,
  ReviewGrade,
  StudyState,
} from '../types'

/** 每答对一张卡的积分 */
const POINTS_PER_CORRECT = 2

/**
 * 每天通过学习最多能赚的积分(防反复刷同一练习白拿分;练习记录不受限)。
 *
 * 为什么必须有:「再练一遍」可以无限次重来 —— 只要一直点同一组题,
 * 分数可以刷到任意高。坏处不是「作弊」,是**把整套激励系统废掉**:
 * 等级、贴纸、宠物、奖励兑换全挂在积分上,一旦发现分可以刷,
 * 「练一组题得 20 分」就不再有分量,后面所有的鼓励也一起失效。
 *
 * 上限按学段给(见 lib/pointCap),定得比「认真学一天」高一截,
 * 正常用永远碰不到;撞上之后不扣分、不报错,只是当天不再加分。
 */
export const DAILY_STUDY_POINTS_CAP = 100

/** 这个孩子今天的积分上限(按学段) */
async function capFor(childId: string): Promise<number> {
  const child = await db.children.get(childId)
  return child ? dailyPointCap(getAgeStage(child.birthdate)) : DAILY_STUDY_POINTS_CAP
}

/** 这个孩子当前的学段(取不到时按幼儿处理 —— 参数更保守,伤害更小) */
async function stageOf(childId: string): Promise<'toddler' | 'primary' | 'junior' | 'senior'> {
  const child = await db.children.get(childId)
  return child ? getAgeStage(child.birthdate) : 'toddler'
}

/** 今天已经通过学习赚到的积分 */
async function studyPointsToday(childId: string): Promise<number> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const rows = await db.pointLedger
    .where('childId')
    .equals(childId)
    .and((l) => l.reason === 'study' && l.delta > 0 && l.timestamp >= dayStart.getTime())
    .toArray()
  return rows.reduce((s, l) => s + l.delta, 0)
}

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
  if (itemType === 'fact') {
    const f = c as BuiltinFactCard
    return {
      ...base,
      front: f.q,
      back: f.a,
      audioText: f.q,
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
  if (existing) {
    // 内容包修订后,把已实例化卡组的卡片内容刷新到最新(SRS 进度保留)
    const rev = meta.rev ?? 1
    if ((existing.contentRev ?? 0) !== rev) await syncDeckContent(existing, rev)
    return existing.id
  }

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
      contentRev: meta.rev ?? 1,
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

/**
 * 把老卡组的卡片内容同步为内容包最新版:
 * 按 order 一一对应更新字段(卡片 id 不变 → SRS 进度/错词引用保留);
 * 内容包变多则补卡+初始 SRS 状态,变少则删多余卡及其状态。
 */
async function syncDeckContent(deck: LearnDeck, rev: number): Promise<void> {
  if (!deck.builtinKey) return
  const meta = getPackMeta(deck.builtinKey)
  if (!meta) return
  const pack = await meta.load()

  await db.transaction('rw', db.decks, db.cards, db.studyStates, async () => {
    const oldCards = await db.cards.where('deckId').equals(deck.id).sortBy('order')
    const fresh = pack.cards.map((c, i) => builtinCardToLearnCard(c, pack.itemType, deck.id, i))

    const common = Math.min(oldCards.length, fresh.length)
    for (let i = 0; i < common; i++) {
      const o = oldCards[i]
      const f = fresh[i]
      if (
        o.front !== f.front ||
        o.back !== f.back ||
        o.phonetic !== f.phonetic ||
        o.audioText !== f.audioText ||
        JSON.stringify(o.extra ?? null) !== JSON.stringify(f.extra ?? null)
      ) {
        await db.cards.update(o.id, {
          front: f.front,
          back: f.back,
          phonetic: f.phonetic,
          audioText: f.audioText,
          extra: f.extra,
          order: i,
        })
      }
    }

    if (fresh.length > oldCards.length && deck.childId) {
      const added = fresh.slice(oldCards.length)
      await db.cards.bulkAdd(added)
      const init = initialSrs()
      await db.studyStates.bulkAdd(
        added.map((card) => ({
          id: newId(),
          childId: deck.childId!,
          cardId: card.id,
          deckId: deck.id,
          ...init,
        })),
      )
    } else if (oldCards.length > fresh.length) {
      const removed = oldCards.slice(fresh.length)
      await db.cards.bulkDelete(removed.map((c) => c.id))
      for (const c of removed) {
        await db.studyStates.where('cardId').equals(c.id).delete()
      }
    }

    // 名称/图标也跟随内容包更新(卡组改名后老设备同步)
    await db.decks.update(deck.id, { contentRev: rev, name: pack.name, icon: meta.icon })
  })
}

export interface DueCard {
  card: LearnCard
  state: StudyState
}

/**
 * 每天至少给这么多题。
 *
 * 没有保底会出现这种情况:昨天练完的卡都排到了后天,今天打开一看
 * 「今天的都做完啦」—— 而孩子是**每天晚上**都要用的。连着两天没题做,
 * 这个习惯就断了,而习惯断掉比少复习几张卡严重得多。
 */
const DAILY_FLOOR = 6

/** 今天已经正式练过(非「再练一遍」)的卡组 */
async function practicedTodayDecks(childId: string, today: string): Promise<Set<string>> {
  const rows = await db.studySessions.where('[childId+date]').equals([childId, today]).toArray()
  return new Set(rows.filter((r) => !r.free).map((r) => r.deckId))
}

/**
 * 今天这一组能练哪些卡。
 *
 * 保底只在**今天还没练过这个卡组**时生效(topUp)—— 否则会变成没有尽头的
 * 跑步机:练完 6 张,它们排到明天,保底又补 6 张,永远练不完、
 * 也永远看不到「已清空」。孩子需要那个「今天的做完了」的时刻。
 */
function availableToday(
  states: StudyState[],
  today: string,
  limit: number,
  topUp = true,
): StudyState[] {
  const due = states.filter((s) => isDue(s, today))
  due.sort((a, b) => {
    /*
      **错过的排最前面。**

      SRS 已经把答错的卡排到第二天,所以它们会回来 —— 但回来之后混在
      二十张卡中间,孩子往往在还没做到它之前就已经累了。而「上次没记住的」
      恰恰是这一组里最该被做到的那几张。
      所以先按「错过几次」倒序,再按老规矩(新卡垫底、到期早的优先)。
    */
    const la = a.lapses || 0
    const lb = b.lapses || 0
    if (la !== lb) return lb - la
    if (a.status === 'new' && b.status !== 'new') return 1
    if (b.status === 'new' && a.status !== 'new') return -1
    return a.due.localeCompare(b.due)
  })
  const floor = topUp ? Math.min(DAILY_FLOOR, states.length) : 0
  if (due.length >= floor) return due.slice(0, limit)
  // 还差多少,就从没到期的里面挑「最快要到期」的补上
  const rest = states.filter((s) => !isDue(s, today)).sort((a, b) => a.due.localeCompare(b.due))
  return [...due, ...rest.slice(0, floor - due.length)].slice(0, limit)
}

/**
 * 取一个卡组今天要练的卡:错过的排最前,再是到期的,不够就用保底补足。
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

  const done = await practicedTodayDecks(childId, today)
  const chosen = availableToday(states, today, limit, !done.has(deckId))

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

/**
 * 今天该卡组的应练数量(用于首页展示)。
 *
 * 必须和 getSessionCards 用**同一套规则**,否则首页显示「还有 6 题」、
 * 点进去却是空的 —— 这种不一致比少一个功能更让人不信任。
 */
export async function countDue(childId: string, deckId: string): Promise<number> {
  const today = todayISO()
  const states = await db.studyStates
    .where('[childId+deckId]')
    .equals([childId, deckId])
    .toArray()
  const done = await practicedTodayDecks(childId, today)
  return availableToday(states, today, Number.MAX_SAFE_INTEGER, !done.has(deckId)).length
}

/** 单张卡评分后更新 SRS(不加分,加分在会话结束统一结算) */
export async function applyGrade(stateId: string, grade: ReviewGrade): Promise<void> {
  const state = await db.studyStates.get(stateId)
  if (!state) return
  /*
    间隔参数按学段取。原先所有年龄共用 SM-2 的原始参数(1→3→8→20 天),
    而那是**给成年人背单词调的**。4–6 岁的遗忘曲线陡得多:一个词隔 8 天
    再见面,对他基本等于一个新词,前面两次练习等于白做。
    幼儿档改成 1→2→4→7,并把难度系数上限压到 2.0。
  */
  const upd = gradeCard(state, grade, tuningFor(await stageOf(state.childId)))
  await db.studyStates.update(stateId, { ...upd, lastReviewed: Date.now() })
}

export interface SessionResult {
  correct: number
  total: number
  pointsAwarded: number
  newBalance: number
  newXp: number
  /** 因触发每日学习积分上限而被少发/不发积分 */
  capped: boolean
}

/** 会话结束:记录 session、按答对数加分。返回结算数据供庆祝页。 */
export async function finishSession(params: {
  childId: string
  deckId: string
  mode: PracticeMode
  total: number
  correct: number
  durationSec: number
  /** 「再练一遍」:不计入「今天练过了」,也不参与难度升降 */
  free?: boolean
}): Promise<SessionResult> {
  const { childId, deckId, mode, total, correct, durationSec, free } = params
  const rawPoints = correct * POINTS_PER_CORRECT
  const cap = await capFor(childId)

  const result = await db.transaction('rw', db.studySessions, db.pointLedger, async () => {
    const earnedToday = await studyPointsToday(childId)
    const points = Math.max(0, Math.min(rawPoints, cap - earnedToday))
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
      free: free || undefined,
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

    return { balanceAfter, xpAfter: stats.xp + points, points }
  })

  return {
    correct,
    total,
    pointsAwarded: result.points,
    newBalance: result.balanceAfter,
    newXp: result.xpAfter,
    capped: result.points < rawPoints,
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
  const rawPoints = correct * POINTS_PER_CORRECT_MATH
  // 口算和练习共用同一个每日上限 —— 否则换个入口照样能刷
  const cap = await capFor(childId)

  const result = await db.transaction('rw', db.drillResults, db.pointLedger, async () => {
    const earnedToday = await studyPointsToday(childId)
    const points = Math.max(0, Math.min(rawPoints, cap - earnedToday))
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
    return { balanceAfter, xpAfter: stats.xp + points, points }
  })

  return {
    correct,
    total,
    pointsAwarded: result.points,
    newBalance: result.balanceAfter,
    newXp: result.xpAfter,
    capped: result.points < rawPoints,
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
  entry: { front: string; back: string; subject?: string; photo?: string; redo?: RedoSpec },
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
        /*
          redo 决定这道错题**将来怎么重做**(选择题 / 输入)。
          干扰项必须和当初做错时是同一批,所以在这里就存下来 ——
          等到重做时再现算,那就是另出了一道题。
        */
        ...(entry.redo ? { redo: entry.redo } : {}),
      },
      order: count,
    })
    await db.studyStates.add({ id: newId(), childId, cardId, deckId, ...initialSrs() })
  })
  return cardId
}

/** 练习答错时自动收进错题本(按题干去重,已有同题不重复加) */
export async function autoAddErrorCard(
  childId: string,
  entry: { front: string; back: string; subject?: string; redo?: RedoSpec },
): Promise<void> {
  const deckId = await ensureErrorDeck(childId)
  const front = entry.front.trim()
  const dup = await db.cards
    .where('deckId')
    .equals(deckId)
    .filter((c) => c.front === front)
    .count()
  if (dup > 0) return
  await addErrorCard(childId, entry)
  await trimErrorDeck(childId)
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

// ============ 难度自适应:每个卡组自己的档位 ============

/**
 * 难度档存在 localStorage,按 deckId 索引。
 *
 * 存在**卡组**上而不是全局:识字可能已经很熟,英语还在入门 ——
 * 一个全局难度会同时把两边都调错。deck 本身就是按孩子实例化的,
 * 所以按 deckId 索引天然也是按孩子分开的。
 */
const LEVEL_KEY = 'kids-growth-deck-level'

function readLevels(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(LEVEL_KEY) ?? '{}') as Record<string, number>
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function deckLevel(deckId: string): number {
  const v = readLevels()[deckId]
  return typeof v === 'number' ? v : 2 // 默认从「正常」起步
}

function setDeckLevel(deckId: string, level: number): void {
  try {
    localStorage.setItem(LEVEL_KEY, JSON.stringify({ ...readLevels(), [deckId]: level }))
  } catch {
    /* 存不下也不该影响做题 */
  }
}

/**
 * 一组做完之后,按最近几组的正确率决定升降档。
 * 返回变化方向,供界面告诉家长「变难了 / 变简单了」。
 */
export async function tuneDeckLevel(childId: string, deckId: string): Promise<Adjust> {
  /*
    「最近几组」按**写入顺序**倒着取,不按 createdAt 排序。

    同一毫秒完成两组时 createdAt 会打平,排序就成了随机的 —— 那样
    「最近一组」可能取到更早的那一组,难度会朝反方向调。
    会话是顺序追加的,倒着数天然就是从新到旧,不需要任何时间戳。
  */
  const all = await db.studySessions.where('childId').equals(childId).toArray()
  const recent: Array<{ total: number; correct: number }> = []
  for (let i = all.length - 1; i >= 0 && recent.length < 4; i--) {
    const r = all[i]
    if (!r || r.deckId !== deckId || r.free) continue
    recent.push({ total: r.total || 0, correct: r.correct || 0 })
  }

  const adjust = adjustFor(recent)
  if (adjust !== 'keep') setDeckLevel(deckId, nextLevel(deckLevel(deckId), adjust))
  return adjust
}

// ============ 今天推荐练什么 ============

/** 给 lib/recommend 用的信号:每组的到期量、薄弱程度、多久没碰 */
export async function deckSignals(childId: string): Promise<DeckSignal[]> {
  const today = todayISO()
  const decks = await listChildDecks(childId)
  const states = await db.studyStates.where('childId').equals(childId).toArray()
  const sessions = await db.studySessions.where('childId').equals(childId).toArray()
  const done = await practicedTodayDecks(childId, today)

  const lastByDeck = new Map<string, string>()
  for (const s of sessions) {
    const cur = lastByDeck.get(s.deckId)
    if (!cur || s.date > cur) lastByDeck.set(s.deckId, s.date)
  }

  const out: DeckSignal[] = []
  for (const d of decks) {
    const mine = states.filter((s) => s.deckId === d.id)
    if (mine.length === 0) continue
    const last = lastByDeck.get(d.id)
    const daysSince = last
      ? Math.max(0, Math.round((Date.parse(today) - Date.parse(last)) / 86400000))
      : -1
    out.push({
      id: d.id,
      name: d.name,
      itemType: d.itemType,
      due: availableToday(mine, today, Number.MAX_SAFE_INTEGER, !done.has(d.id)).length,
      lapses: mine.reduce((n, s) => n + (s.lapses || 0), 0),
      daysSince,
      total: mine.length,
    })
  }
  return out
}

// ============ 今日评分 ============

/** 今天各板块做了多少 —— 喂给 lib/scoreCard */
export async function todayByArea(
  childId: string,
): Promise<Array<{ key: string; done: number; correct: number }>> {
  const today = todayISO()
  const sessions = await db.studySessions.where('[childId+date]').equals([childId, today]).toArray()
  const drills = await db.drillResults.where('childId').equals(childId).toArray()
  const todayDrills = drills.filter((d) => d.date === today)
  const checkIns = await db.checkIns.where('[childId+date]').equals([childId, today]).toArray()

  const sum = (rows: Array<{ total: number; correct: number }>) => ({
    done: rows.reduce((n, r) => n + (r.total || 0), 0),
    correct: rows.reduce((n, r) => n + (r.correct || 0), 0),
  })

  const practice = sum(sessions)
  const math = sum(todayDrills)
  const habitDone = checkIns.filter((c) => c.status === 'done').length
  return [
    { key: 'practice', ...practice },
    { key: 'math', ...math },
    { key: 'habit', done: habitDone, correct: habitDone },
  ]
}

/**
 * 昨天的分数 —— 评分卡要「和昨天的自己比」,所以每天存一条。
 * 存 localStorage 而不是建表:它只有一个数字,而且丢了也只是少一次对比。
 */
const SCORE_KEY = 'kids-growth-daily-score'

function readScores(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(SCORE_KEY) ?? '{}') as Record<string, number>
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export function yesterdayScore(): number {
  const y = addDays(todayISO(), -1)
  const v = readScores()[y]
  return typeof v === 'number' ? v : -1
}

export function recordTodayScore(score: number): void {
  try {
    const all = readScores()
    all[todayISO()] = score
    // 只留最近 14 天,不让它无限长
    const keep = Object.keys(all)
      .sort()
      .slice(-14)
    const trimmed: Record<string, number> = {}
    for (const k of keep) trimmed[k] = all[k]
    localStorage.setItem(SCORE_KEY, JSON.stringify(trimmed))
  } catch {
    /* 忽略 */
  }
}

/** 今天有多少张「以前答错过」的卡到期 —— 首页用来提示「先补这几张」 */
export async function wrongDueToday(childId: string): Promise<number> {
  const today = todayISO()
  const states = await db.studyStates.where('childId').equals(childId).toArray()
  return states.filter((s) => (s.lapses || 0) > 0 && isDue(s, today)).length
}

/**
 * 错题本的条数上限。
 *
 * 一晚上连着错三十道是完全可能的。没有上限的话,错题本会先变成一份
 * 两百条的清单,然后被彻底放弃 —— 而**被放弃的错题本比没有错题本更糟**,
 * 它会让家长以为「这套系统在管错题」,实际上没人再打开它。
 *
 * 到顶之后**丢最老的**:最近错的那些正是他现在的弱点,
 * 而三周前错的那道题,要么早就会了,要么会再错一次重新进来。
 */
const ERROR_DECK_MAX = 60

async function trimErrorDeck(childId: string): Promise<void> {
  const deckId = await ensureErrorDeck(childId)
  const cards = (await db.cards.where('deckId').equals(deckId).toArray()).sort(
    (a, b) => a.order - b.order,
  )
  if (cards.length <= ERROR_DECK_MAX) return
  const drop = cards.slice(0, cards.length - ERROR_DECK_MAX).map((c) => c.id)
  const states = await db.studyStates.where('[childId+deckId]').equals([childId, deckId]).toArray()
  const dropStates = states.filter((st) => drop.includes(st.cardId)).map((st) => st.id)
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await db.cards.bulkDelete(drop)
    // 卡丢掉时学习状态要一起清,否则会留下一堆孤儿记录
    await db.studyStates.bulkDelete(dropStates)
  })
}

/**
 * 重做答对 → **立刻移出错题本**。
 *
 * 原先是「连对两次才毕业」,而且只在进错题本页时结算。想法是稳妥,
 * 实际效果是:孩子辛辛苦苦做完一轮,列表一条没少 —— 他看不到自己
 * 「消灭掉」了什么,那件事本身就没意思了。
 *
 * 4 岁半的孩子需要的是**立刻看见结果**。做对一道它就没了,列表变短一格,
 * 这才是他愿意再做一轮的理由。蒙对了也不要紧:同一道题下次再错会重新进来。
 */
export async function retireErrorCard(childId: string, cardId: string): Promise<boolean> {
  const deckId = await ensureErrorDeck(childId)
  const card = await db.cards.get(cardId)
  if (!card || card.deckId !== deckId) return false
  await deleteCard(cardId)
  return true
}

/**
 * 按题干/答案回内容包里找到「这道错题原来是哪张卡」。
 *
 * 老错题只存了题干和答案,没记当初是哪种练法、也没记那张图。
 * 但原卡通常还在孩子的某个卡组里 —— 找到它就能恢复出图、英文和内容类型,
 * 重做时才能保持原来那种形式(该点图的还是点图)。
 */
export async function findOriginCard(
  childId: string,
  front: string,
  back: string,
): Promise<OriginCard | undefined> {
  const errDeck = await ensureErrorDeck(childId)
  const decks = (await db.decks.where('childId').equals(childId).toArray()).filter(
    (d) => d.id !== errDeck,
  )
  if (decks.length === 0) return undefined
  const byId = new Map(decks.map((d) => [d.id, d]))
  const cards = (await db.cards.toArray()).filter((c) => byId.has(c.deckId))

  const f = String(front ?? '').trim()
  const b = String(back ?? '').trim()
  const hit = cards.find((c) => {
    if (c.front === f && c.back === b) return true
    // 老错题的题干可能被包装过(「认字:好」「🐱 这是什么?」),所以也按「答案+题干包含」匹配
    if (c.back === b && f.includes(c.front)) return true
    if (c.front === f) return true
    return false
  })
  if (!hit) return undefined

  const deck = byId.get(hit.deckId)
  if (!deck) return undefined
  const ext = (hit.extra ?? {}) as { emoji?: string; en?: string }
  return {
    front: hit.front,
    back: hit.back,
    emoji: ext.emoji,
    en: ext.en,
    itemType: deck.itemType,
    siblings: cards
      .filter((c) => c.deckId === hit.deckId && c.id !== hit.id)
      .map((c) => {
        const e = (c.extra ?? {}) as { emoji?: string; en?: string }
        return { front: c.front, back: c.back, emoji: e.emoji, en: e.en }
      }),
  }
}

/**
 * 明天有多少张卡到期 —— 结算页用它给一句「明天有 N 个在等你」。
 *
 * 一次学习结束的那一刻,是决定「明天他还会不会来」的关键点。
 * 一句具体的预告比「明天见」有效得多 ——
 * 它把明天从「又要学习」变成「有东西在等我」。
 */
export async function dueTomorrow(childId: string): Promise<number> {
  const tomorrow = addDays(todayISO(), 1)
  const states = await db.studyStates.where('childId').equals(childId).toArray()
  return states.filter((s) => s.status !== 'new' && s.due <= tomorrow).length
}

/**
 * 错题「毕业」:重做连着答对两次就移出错题本。
 *
 * 为什么必须有:原先错题只进不出。一个每天做题的孩子,两个月就能攒出
 * 两三百道 —— 家长打开一看,再也不会点第二次。**一个只增不减的错题本,
 * 最后一定会被放弃**,那前面自动收集做得再好也没用。
 *
 * 门槛定在「连对两次」而不是一次:错题里有相当一部分当初就是蒙错的,
 * 一次答对说明不了什么;连着两次答对(中间还隔着 SRS 安排的天数),
 * 才算真的记住了。
 */
export async function graduateErrorCards(childId: string): Promise<number> {
  const deckId = await ensureErrorDeck(childId)
  const states = await db.studyStates.where('[childId+deckId]').equals([childId, deckId]).toArray()
  const done = states.filter((s) => (s.reps ?? 0) >= 2)
  if (done.length === 0) return 0
  await db.transaction('rw', db.cards, db.studyStates, async () => {
    await db.cards.bulkDelete(done.map((s) => s.cardId))
    await db.studyStates.bulkDelete(done.map((s) => s.id))
  })
  return done.length
}

/** 今天有多少道错题要重做 —— 首页拿它提示,不然错题本没人会主动点 */
export async function errorDueToday(childId: string): Promise<number> {
  const deckId = await ensureErrorDeck(childId)
  const today = todayISO()
  const states = await db.studyStates.where('[childId+deckId]').equals([childId, deckId]).toArray()
  return states.filter((s) => isDue(s, today)).length
}
