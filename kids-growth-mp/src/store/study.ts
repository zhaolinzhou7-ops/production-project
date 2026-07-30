import { KEYS, readTable, writeTable, readObject, writeObject } from './db'
import { newId } from '../core/id'
import { initialSrs, gradeCard, isDue } from '../core/srs'
import { getPackMeta } from '../core/learningContent'
import type {
  BuiltinCard,
  BuiltinFactCard,
  BuiltinHanziCard,
  BuiltinPicCard,
  BuiltinPoemCard,
  BuiltinWordCard,
} from '../core/learningContent'
import { todayISO } from '../core/dateUtils'
import { computeStreak } from '../core/streak'
import type {
  AgeStage,
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

/**
 * 直接增减成长值(习惯打卡用)。
 * 取消打卡要能扣回去 —— 否则反复勾选就能刷分。xp 不会被扣成负数。
 */
export function adjustPoints(delta: number): PointStats {
  const cur = getPoints()
  const next = {
    balance: cur.balance + delta,
    xp: Math.max(0, cur.xp + delta),
  }
  writeObject(KEYS.points, next)
  return next
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
    return { ...base, front: f.q, back: f.a, audioText: f.q }
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
    contentRev: meta.rev ?? 1,
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

/**
 * 把已装的卡组同步到内容包的最新版本。
 *
 * 为什么需要:内容包会更新(补词、改错、加内容)。如果只在「第一次装」时写入,
 * 老用户设备上永远是旧内容。这里按 order 就地更新每张卡的正反面,
 * **卡片 id 不变** —— 所以 SRS 的复习进度完整保留;多出来的补上,少了的删掉。
 */
export function syncDeckContent(childId: string, builtinKey: string): void {
  const meta = getPackMeta(builtinKey)
  if (!meta) return
  const rev = meta.rev ?? 1
  const decks = readTable<LearnDeck>(KEYS.decks)
  const di = decks.findIndex((d) => d.childId === childId && d.builtinKey === builtinKey)
  if (di < 0) return
  if ((decks[di].contentRev ?? 1) >= rev) return

  const pack = meta.load()
  const cards = readTable<LearnCard>(KEYS.cards)
  const states = readTable<StudyState>(KEYS.states)
  const deckId = decks[di].id
  const mine = cards.filter((c) => c.deckId === deckId).sort((a, b) => a.order - b.order)

  pack.cards.forEach((raw, i) => {
    const fresh = builtinCardToLearnCard(raw, pack.itemType, deckId, i)
    const old = mine[i]
    if (old) {
      // 就地覆盖内容,保留 id → 复习进度不受影响
      const ci = cards.findIndex((c) => c.id === old.id)
      if (ci >= 0) cards[ci] = { ...fresh, id: old.id }
    } else {
      cards.push(fresh)
      states.push({ id: newId(), childId, cardId: fresh.id, deckId, ...initialSrs() })
    }
  })

  // 内容变少了:多出来的卡连同进度一起删掉
  if (mine.length > pack.cards.length) {
    const drop = new Set(mine.slice(pack.cards.length).map((c) => c.id))
    for (let i = cards.length - 1; i >= 0; i--) if (drop.has(cards[i].id)) cards.splice(i, 1)
    for (let i = states.length - 1; i >= 0; i--) if (drop.has(states[i].cardId)) states.splice(i, 1)
  }

  decks[di] = { ...decks[di], contentRev: rev, name: pack.name, icon: meta.icon }
  writeTable(KEYS.decks, decks)
  writeTable(KEYS.cards, cards)
  writeTable(KEYS.states, states)
}

/**
 * 清理历史遗留的坏数据。
 *
 * 这个项目迭代过很多版,早期版本写进去的记录可能缺字段(比如没有 itemType、
 * icon 或 childId)。这类记录渲染出来会是空节点或异常节点,表现为莫名其妙的
 * 运行时报错 —— 而「清空本地数据后就好了」正是这种情况的典型症状。
 * 启动时静默修一遍,用户不需要知道发生过什么。
 */
export function sanitizeData(childId: string): void {
  const KNOWN: CardItemType[] = ['word', 'poem', 'hanzi', 'wrong', 'pic', 'fact']

  // ---- 第一步:卡组本身 ----
  const decks = readTable<LearnDeck>(KEYS.decks)
  const goodDecks: LearnDeck[] = []
  const deckIds = new Set<string>()
  let changed = false
  for (const d of decks) {
    if (!d || !d.id || !KNOWN.includes(d.itemType) || deckIds.has(d.id)) {
      changed = true
      continue
    }
    deckIds.add(d.id)
    goodDecks.push({
      ...d,
      childId: d.childId ?? childId,
      name: d.name || '未命名卡组',
      icon: d.icon || '📘',
      subject: d.subject || '学习',
      createdAt: d.createdAt || Date.now(),
    })
  }

  // ---- 第二步:卡片 ----
  // 会话页拿到一张 front 为空的卡就会渲染出空节点,再往下算选项时又会取到
  // undefined —— 这正是「返回一次或清一次数据才好」的那类偶发报错。
  // 孤儿卡(所属卡组已经不在了)、重复 id 一并清掉。
  const cards = readTable<LearnCard>(KEYS.cards)
  const goodCards: LearnCard[] = []
  const cardIds = new Set<string>()
  for (const c of cards) {
    if (!c || !c.id || !c.deckId || cardIds.has(c.id) || !deckIds.has(c.deckId)) {
      changed = true
      continue
    }
    if (typeof c.front !== 'string' || c.front.length === 0) {
      changed = true
      continue
    }
    cardIds.add(c.id)
    // back 允许为空(看图卡等),但必须是字符串,否则渲染时会炸
    goodCards.push(typeof c.back === 'string' ? c : { ...c, back: '' })
  }

  // ---- 第三步:SRS 状态 ----
  // 指向已删卡片的状态会让「待学数」虚高:首页显示有 20 张要学,
  // 进去却只有 3 张,或者干脆取不到卡片而报错。
  const states = readTable<StudyState>(KEYS.states)
  const goodStates: StudyState[] = []
  const stateIds = new Set<string>()
  for (const s of states) {
    if (!s || !s.id || stateIds.has(s.id)) {
      changed = true
      continue
    }
    if (!deckIds.has(s.deckId) || !cardIds.has(s.cardId)) {
      changed = true
      continue
    }
    stateIds.add(s.id)
    goodStates.push(s)
  }

  if (!changed) return
  writeTable(KEYS.decks, goodDecks)
  writeTable(KEYS.cards, goodCards)
  writeTable(KEYS.states, goodStates)
}

/** 当前学段(幼儿/小学/初中):决定首页展示与「内容库」里能选哪些包 */
export function getStage(): AgeStage {
  return readObject<AgeStage>('stage', 'primary')
}

export function setStage(stage: AgeStage): void {
  writeObject('stage', stage)
}

/** 该孩子已加过哪些内置包 */
export function addedPackKeys(childId: string): Set<string> {
  return new Set(
    readTable<LearnDeck>(KEYS.decks)
      .filter((d) => d.childId === childId && d.builtinKey)
      .map((d) => d.builtinKey as string),
  )
}

/** 移除一个内置卡组(连同卡片与学习进度) */
export function removeBuiltinDeck(childId: string, builtinKey: string): void {
  const decks = readTable<LearnDeck>(KEYS.decks)
  const deck = decks.find((d) => d.childId === childId && d.builtinKey === builtinKey)
  if (!deck) return
  writeTable(
    KEYS.decks,
    decks.filter((d) => d.id !== deck.id),
  )
  writeTable(
    KEYS.cards,
    readTable<LearnCard>(KEYS.cards).filter((c) => c.deckId !== deck.id),
  )
  writeTable(
    KEYS.states,
    readTable<StudyState>(KEYS.states).filter((s) => s.deckId !== deck.id),
  )
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

/**
 * 一次扫描算出**所有**卡组的待学数。
 *
 * 首页原先对每个卡组各调一次 countDue —— 7 个卡组就把 1400 条状态扫 7 遍。
 * 这里改成扫一遍分桶,首页只调这一个。
 */
export function countDueByDeck(childId: string): Record<string, number> {
  const today = todayISO()
  const out: Record<string, number> = {}
  for (const s of readTable<StudyState>(KEYS.states)) {
    if (s.childId !== childId) continue
    if (!isDue(s, today)) continue
    out[s.deckId] = (out[s.deckId] ?? 0) + 1
  }
  return out
}

export interface DueCard {
  card: LearnCard
  state: StudyState
}

/** 取一个卡组今天要练的卡(到期优先,new 补足),limit 控制题量。 */
/**
 * 取一组要练的卡。
 *
 * `freePractice = true` 时**忽略「到期」这件事**,从整个卡组里随机抽。
 *
 * 为什么必须有这个口子:间隔重复会把答对的卡排到几天甚至几周之后,
 * 于是孩子今天想再练一遍,程序告诉他「今天学完了」——
 * 这是把一个为「记得牢」设计的算法,当成了「不准多练」的门禁。
 * 孩子主动想练的时候拦住他,是这套系统能犯的最糟糕的错误之一。
 *
 * 随便练的那一组照常给分、照常喂宠物,但**不动 SRS 的间隔**
 * (见 finishSession 的 freePractice),否则反复刷会把复习节奏搅乱。
 */
export function getSessionCards(
  childId: string,
  deckId: string,
  limit = 12,
  freePractice = false,
): DueCard[] {
  const today = todayISO()
  const states = readTable<StudyState>(KEYS.states).filter(
    (s) => s.childId === childId && s.deckId === deckId,
  )
  if (freePractice) {
    // 随机抽,每次进来题目不一样 —— 同一组反复做才不会腻
    const pool = [...states]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = pool[i]
      pool[i] = pool[j]
      pool[j] = t
    }
    const cardsById0 = new Map(readTable<LearnCard>(KEYS.cards).map((c) => [c.id, c]))
    const out0: DueCard[] = []
    for (const st of pool) {
      const card = cardsById0.get(st.cardId)
      if (card) out0.push({ card, state: st })
      if (out0.length >= limit) break
    }
    return out0
  }
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

/** 这个卡组一共有多少张卡 —— 首页「再练一遍」要显示总量 */
export function countDeckCards(deckId: string): number {
  return readTable<LearnCard>(KEYS.cards).filter((c) => c && c.deckId === deckId).length
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

// ============ 口算(数学) ============

const POINTS_PER_CORRECT_MATH = 1

export function finishDrill(params: {
  childId: string
  kind: string
  total: number
  correct: number
  durationSec: number
}): SessionResult {
  const { childId, kind, total, correct, durationSec } = params
  const points = correct * POINTS_PER_CORRECT_MATH
  const drills = readTable(KEYS.drills)
  drills.push({
    id: newId(),
    childId,
    kind,
    date: todayISO(),
    total,
    correct,
    durationSec,
    createdAt: Date.now(),
  })
  writeTable(KEYS.drills, drills)
  const after = addPoints(points)
  return { correct, total, pointsAwarded: points, newBalance: after.balance, newXp: after.xp }
}

// ============ 错题本(手动录入,跨学科) ============

const ERROR_DECK_NAME = '错题本'

export function ensureErrorDeck(childId: string): string {
  const decks = readTable<LearnDeck>(KEYS.decks)
  const existing = decks.find((d) => d.childId === childId && d.source === 'wrong' && d.itemType === 'wrong')
  if (existing) return existing.id
  const deckId = newId()
  decks.push({
    id: deckId,
    childId,
    subject: '错题',
    name: ERROR_DECK_NAME,
    icon: '📕',
    source: 'wrong',
    itemType: 'wrong',
    createdAt: Date.now(),
  })
  writeTable(KEYS.decks, decks)
  return deckId
}

export function addErrorCard(
  childId: string,
  entry: { front: string; back: string; subject?: string },
): string {
  const deckId = ensureErrorDeck(childId)
  const cards = readTable<LearnCard>(KEYS.cards)
  const count = cards.filter((c) => c.deckId === deckId).length
  const states = readTable<StudyState>(KEYS.states)
  const cardId = newId()
  cards.push({
    id: cardId,
    deckId,
    front: entry.front.trim(),
    back: entry.back.trim(),
    extra: entry.subject ? { subject: entry.subject } : undefined,
    order: count,
  })
  states.push({ id: newId(), childId, cardId, deckId, ...initialSrs() })
  writeTable(KEYS.cards, cards)
  writeTable(KEYS.states, states)
  return cardId
}

/**
 * 答错自动进错题本(按题干去重)。
 *
 * 教学上这一步很关键:孩子答错的当下最有印象,但过后既不会自己记录、
 * 也想不起来错过什么。自动收进来,再由 SRS 安排重做,错题才真的被消化。
 */
export function autoAddErrorCard(
  childId: string,
  entry: { front: string; back: string; subject?: string },
): void {
  const front = entry.front.trim()
  if (!front) return
  const deckId = getErrorDeckId(childId)
  if (deckId) {
    const dup = readTable<LearnCard>(KEYS.cards).some(
      (c) => c.deckId === deckId && c.front === front,
    )
    if (dup) return
  }
  addErrorCard(childId, entry)
}

export function getErrorDeckId(childId: string): string | undefined {
  return readTable<LearnDeck>(KEYS.decks).find(
    (d) => d.childId === childId && d.source === 'wrong' && d.itemType === 'wrong',
  )?.id
}

export function listErrorCards(childId: string): LearnCard[] {
  const deckId = getErrorDeckId(childId)
  if (!deckId) return []
  return readTable<LearnCard>(KEYS.cards)
    .filter((c) => c.deckId === deckId)
    .sort((a, b) => a.order - b.order)
}

export function deleteCard(cardId: string): void {
  const cards = readTable<LearnCard>(KEYS.cards).filter((c) => c.id !== cardId)
  const states = readTable<StudyState>(KEYS.states).filter((s) => s.cardId !== cardId)
  writeTable(KEYS.cards, cards)
  writeTable(KEYS.states, states)
}

// ============ 防沉迷 / 连续天数 ============

interface DailyTime {
  date: string
  seconds: number
}

/** 累加今日学习秒数(用于护眼/防沉迷提醒) */
export function addStudyTime(seconds: number): void {
  const today = todayISO()
  const cur = readObject<DailyTime>('studyTime', { date: today, seconds: 0 })
  const next = cur.date === today ? { date: today, seconds: cur.seconds + seconds } : { date: today, seconds }
  writeObject('studyTime', next)
}

export function getTodayStudyMinutes(): number {
  const today = todayISO()
  const cur = readObject<DailyTime>('studyTime', { date: today, seconds: 0 })
  return cur.date === today ? Math.round(cur.seconds / 60) : 0
}

/** 连续学习天数(会话 + 口算) */
export function getStudyStreak(): number {
  const sessions = readTable<{ date: string }>(KEYS.sessions)
  const drills = readTable<{ date: string }>(KEYS.drills)
  const dates = new Set<string>([...sessions.map((s) => s.date), ...drills.map((d) => d.date)])
  return computeStreak(dates, todayISO())
}

// ---------------------------------------------------------------- 自定义词本

/**
 * 建一个自己的词本(学校发的单词表、这周要默写的词……)。
 * source 标成 'custom',内容包同步时不会碰它。
 */
export function createCustomDeck(childId: string, name: string): string {
  const deckId = newId()
  const deck: LearnDeck = {
    id: deckId,
    childId,
    subject: '英语',
    name: name || '我的词本',
    icon: '📗',
    source: 'custom',
    itemType: 'word',
    createdAt: Date.now(),
  }
  writeTable(KEYS.decks, [...readTable<LearnDeck>(KEYS.decks), deck])
  return deckId
}

export interface ParsedWord {
  w: string
  tr: string
}

/**
 * 解析批量粘贴的单词表。
 *
 * 家长手上的词表格式五花八门:空格分隔、Tab、中英文逗号、破折号……
 * 与其要求他们改格式,不如全都认。每行一个词,分隔符之前是英文、之后是中文。
 */
export function parseWordList(text: string): ParsedWord[] {
  const out: ParsedWord[] = []
  const seen = new Set<string>()
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    let w = ''
    let tr = ''
    // 首选:从**第一个汉字**处切开。这比按分隔符切可靠得多 ——
    // 「ice cream 冰淇淋」按空格切会切成「ice」,按汉字切才是完整词组。
    const cjk = line.search(/[一-龥]/)
    if (cjk > 0) {
      w = line.slice(0, cjk).replace(/[\s\t,，:：\-—]+$/, '').trim()
      tr = line.slice(cjk).trim()
    } else if (cjk < 0) {
      // 整行没有汉字(释义也是英文):退回按显式分隔符切
      const m = line.match(/^([A-Za-z][A-Za-z\s'-]*?)\s*[\t,，:：\-—]+\s*(.+)$/)
      if (m) {
        w = m[1].trim()
        tr = m[2].trim()
      }
    }
    // cjk === 0 表示整行以汉字开头,没有英文可取,直接跳过
    if (!w || !tr) continue
    if (!/^[A-Za-z]/.test(w)) continue
    const key = w.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ w, tr })
  }
  return out
}

/** 把解析好的单词加进某个词本(自动建 SRS 初始状态)。返回真正新增的条数。 */
export function addWordsToDeck(childId: string, deckId: string, words: ParsedWord[]): number {
  const cards = readTable<LearnCard>(KEYS.cards)
  const states = readTable<StudyState>(KEYS.states)
  const have = new Set(
    cards.filter((c) => c.deckId === deckId).map((c) => c.front.toLowerCase()),
  )
  let order = cards.filter((c) => c.deckId === deckId).length
  const init = initialSrs()
  let added = 0
  for (const { w, tr } of words) {
    if (have.has(w.toLowerCase())) continue
    have.add(w.toLowerCase())
    const card: LearnCard = {
      id: newId(),
      deckId,
      front: w,
      back: tr,
      audioText: w,
      order: order++,
    }
    cards.push(card)
    states.push({ id: newId(), childId, cardId: card.id, deckId, ...init })
    added++
  }
  if (added > 0) {
    writeTable(KEYS.cards, cards)
    writeTable(KEYS.states, states)
  }
  return added
}

/** 删掉一个自定义词本(连卡片和复习状态一起) */
export function deleteCustomDeck(deckId: string): void {
  writeTable(
    KEYS.decks,
    readTable<LearnDeck>(KEYS.decks).filter((d) => d.id !== deckId),
  )
  writeTable(
    KEYS.cards,
    readTable<LearnCard>(KEYS.cards).filter((c) => c.deckId !== deckId),
  )
  writeTable(
    KEYS.states,
    readTable<StudyState>(KEYS.states).filter((s) => s.deckId !== deckId),
  )
}

export function listCustomDecks(childId: string): LearnDeck[] {
  return readTable<LearnDeck>(KEYS.decks).filter(
    (d) => d && d.childId === childId && d.source === 'custom',
  )
}

// ---------------------------------------------------------------- 每日目标

/** 每天想练多少题。默认 20 —— 幼儿园孩子的注意力大约就是这个量。 */
export function getDailyGoal(): number {
  const n = readObject<number>('dailyGoal', 20)
  return typeof n === 'number' && n > 0 ? n : 20
}

export function setDailyGoal(n: number): void {
  writeObject('dailyGoal', Math.max(5, Math.min(200, Math.round(n))))
}

/** 今天已经练了多少题(练习组 + 口算都算) */
export function todayAnswered(childId: string): number {
  const today = todayISO()
  let n = 0
  for (const s of readTable<{ childId: string; date: string; total: number }>(KEYS.sessions)) {
    if (s && s.childId === childId && s.date === today) n += s.total || 0
  }
  for (const d of readTable<{ childId: string; date: string; total: number }>(KEYS.drills)) {
    if (d && d.childId === childId && d.date === today) n += d.total || 0
  }
  return n
}
