import { KEYS, readTable, writeTable, readObject, writeObject } from './db'
import { newId } from '../core/id'
import { initialSrs, gradeCard, isDue, tuningFor } from '../core/srs'
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
import { stageFromBirthdate, defaultDailyGoal } from '../core/ageStage'
import { dailyPointCap, allowedAward } from '../core/pointCap'
import type { DeckSignal } from '../core/recommend'
import { adjustFor, nextLevel, type Adjust } from '../core/adaptive'
import { getProfile, saveProfile } from './records'
import { computeStreak } from '../core/streak'
import type {
  AgeStage,
  CardItemType,
  LearnCard,
  LearnDeck,
  PracticeMode,
  ReviewGrade,
  StudyState,
  RedoSpec,
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
 * 今天已经拿到多少分。
 *
 * 单独记一份,而不是从流水里算 —— 加分的入口有四个(练习、口算、
 * 习惯打卡、口语跟读),从流水反推容易漏掉其中一个,漏掉哪个哪个就能刷。
 */
interface DayPoints {
  date: string
  earned: number
}

export function earnedToday(): number {
  const d = readObject<DayPoints>('pointsToday', { date: todayISO(), earned: 0 })
  return d && d.date === todayISO() ? Math.max(0, d.earned) : 0
}

function noteEarned(delta: number): void {
  const cur = earnedToday()
  writeObject('pointsToday', { date: todayISO(), earned: Math.max(0, cur + delta) })
}

/** 今天还能再拿多少分(给界面显示用) */
export function pointsRoomToday(): number {
  return Math.max(0, dailyPointCap(getStage()) - earnedToday())
}

/**
 * 所有加分**必须**走这里。
 *
 * 这是唯一的收口:练习、口算、习惯、口语跟读四个入口都汇到这一个函数,
 * 每日上限才有意义 —— 只要漏掉一个,那个入口就能刷分。
 *
 * 返回**实际加了多少**(可能因为撞上上限而少于 delta),
 * 调用方据此决定要不要提示「今天的分已经拿满啦」。
 */
function award(delta: number, keepXpOnNegative: boolean): { stats: PointStats; actual: number } {
  const actual = allowedAward(delta, earnedToday(), dailyPointCap(getStage()))
  const cur = getPoints()
  const next = {
    balance: cur.balance + actual,
    xp: keepXpOnNegative && actual < 0 ? cur.xp : Math.max(0, cur.xp + actual),
  }
  writeObject(KEYS.points, next)
  if (actual !== 0) noteEarned(actual)
  return { stats: next, actual }
}

/**
 * 直接增减成长值(习惯打卡、口语跟读用)。
 * 取消打卡要能扣回去 —— 否则反复勾选就能刷分。xp 不会被扣成负数。
 */
export function adjustPoints(delta: number): PointStats {
  return award(delta, false).stats
}

/** 同上,但会告诉调用方「因为到上限,实际只加了这么多」 */
export function adjustPointsDetailed(delta: number): { stats: PointStats; actual: number } {
  return award(delta, false)
}

function addPoints(delta: number): PointStats {
  return award(delta, true).stats
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
    /*
      内置包被下架了(我把某个内容包从程序里删掉了),设备上那份要跟着清掉。

      不清的话它会变成一个「孤儿卡组」:首页照常列出来、点进去还能做,
      但内容库里找不到它、也没法移除 —— 用户只能靠清空全部数据来摆脱它。
      自定义词本和错题本没有 builtinKey,不受影响。
    */
    if (d.builtinKey && !getPackMeta(d.builtinKey)) {
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
/**
 * 当前学段。
 *
 * 优先级:家长手动指定 > 按生日推算 > 默认小学。
 *
 * 生日排在前面是有原因的 —— 它是一次录入、终身有效的事实,而「学段」是个
 * 会过期的快照:孩子明年上小学了没人会想起来去改它。挂在生日上,
 * 今天算今天的,他长大了程序自己知道。
 */
export function getStage(): AgeStage {
  const manual = readObject<string>('stageManual', '')
  if (manual === 'toddler' || manual === 'primary' || manual === 'junior' || manual === 'senior') {
    return manual
  }
  const byBirth = stageFromBirthdate(getProfile().birthdate, todayISO())
  if (byBirth) return byBirth
  return readObject<AgeStage>('stage', 'primary')
}

/**
 * 家长到底有没有告诉过我们孩子多大。
 *
 * 这个区别很要紧:不知道的时候 getStage() 会返回默认的 'primary',于是
 * 幼儿园的孩子拿到的是小学的内容包、口算直接从两位数加减起步。而这个默认值
 * 还会在清一次数据之后**悄悄复活** —— 孩子第二天打开发现题目全变难了,
 * 没有任何地方告诉他发生了什么。所以「还不知道」必须能被识别出来、
 * 并且在首页当面问一次。
 */
export function hasStage(): boolean {
  const manual = readObject<string>('stageManual', '')
  if (manual === 'toddler' || manual === 'primary' || manual === 'junior' || manual === 'senior') {
    return true
  }
  return !!stageFromBirthdate(getProfile().birthdate, todayISO())
}

/** 只写生日 —— 学段自己会跟着走,不用再单独存一份 */
export function setBirthdate(birthdate: string): void {
  const p = getProfile()
  saveProfile({ ...p, birthdate })
}

export function getBirthdate(): string {
  return getProfile().birthdate
}

/**
 * 手动指定学段 —— 只在家长明确要盖过生日推算时用
 * (比如孩子提前入学、或者想让他先练更简单的内容)。
 */
export function setStage(stage: AgeStage): void {
  writeObject('stageManual', stage)
  writeObject('stage', stage)
}

/** 取消手动指定,回到跟着生日走 */
export function clearStageOverride(): void {
  writeObject('stageManual', '')
}

/** 现在这个学段是家长手动定死的,还是跟着生日走的 */
export function isStageManual(): boolean {
  const v = readObject<string>('stageManual', '')
  return v === 'toddler' || v === 'primary' || v === 'junior' || v === 'senior'
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
/**
 * 每个卡组**每天至少**能练到几张。
 *
 * 为什么要有这个保底:间隔重复答对一次排到明天、两次排到 3 天后、三次排到
 * 8 天后……小卡组因此会出现「今天做完,接下来三四天打开全是已清空」。
 * 对一个每天都想学的孩子来说,「今天没你的题」是最打击人的一句话 ——
 * 他会以为这个 App today 没什么可做的,下次就不打开了。
 *
 * 所以:到期的不够时,用**最快要到期的**那些提前补上。提前复习不会破坏
 * 记忆效果(顶多让间隔涨得慢一点),而「天天有题做」保住的是习惯本身。
 * 卡组本身没那么多卡时,有几张给几张。
 */
const DAILY_FLOOR = 6

/**
 * 今天这个卡组实际能拿到的卡(到期的 + 不够时按最快到期补足)。
 * countDueByDeck 与 getSessionCards 都走它,保证首页显示的数字
 * 和真的点进去能做的题**永远一致** —— 否则会出现「写着待学 6,进去却没题」。
 */
/**
 * 今天已经「正经练过」的卡组(不含「再练一遍」)。
 *
 * 保底只在**今天还没练过这个卡组**时生效 —— 否则会变成没有尽头的跑步机:
 * 练完 6 张,它们排到明天,保底又补 6 张,永远练不完、也永远看不到「已清空」。
 * 孩子需要那个「今天的做完了」的时刻。
 */
function practicedTodayDecks(childId: string, today: string): Set<string> {
  const out = new Set<string>()
  for (const s of readTable<{ childId: string; deckId: string; date: string; free?: boolean }>(
    KEYS.sessions,
  )) {
    if (s && s.childId === childId && s.date === today && !s.free) out.add(s.deckId)
  }
  return out
}

function availableToday(states: StudyState[], today: string, limit: number, topUp = true): StudyState[] {
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

export function countDueByDeck(childId: string): Record<string, number> {
  const today = todayISO()
  const byDeck: Record<string, StudyState[]> = {}
  for (const s of readTable<StudyState>(KEYS.states)) {
    if (s.childId !== childId) continue
    ;(byDeck[s.deckId] = byDeck[s.deckId] ?? []).push(s)
  }
  const done = practicedTodayDecks(childId, today)
  const out: Record<string, number> = {}
  for (const deckId of Object.keys(byDeck)) {
    out[deckId] = availableToday(
      byDeck[deckId],
      today,
      Number.MAX_SAFE_INTEGER,
      !done.has(deckId),
    ).length
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
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/** 「再练一遍」最近出过的卡:按卡组记,用来让下一遍尽量换一批 */
const practicedKey = (childId: string, deckId: string) => `recent:${childId}:${deckId}`

function recentPracticed(childId: string, deckId: string): string[] {
  const v = readObject<string[]>(practicedKey(childId, deckId), [])
  return Array.isArray(v) ? v : []
}

/**
 * 记下这一遍出过的卡。
 *
 * 只保留「不到池子一半」的量 —— 记太多的话,小卡组会把整池子都标成「出过」,
 * 于是又退化成纯随机。留一半,既能避开刚做过的,又总有空间轮换。
 */
function rememberPracticed(childId: string, deckId: string, ids: string[], poolSize: number): void {
  const cap = Math.max(0, Math.floor(poolSize / 2))
  const merged = [...ids, ...recentPracticed(childId, deckId)].slice(0, cap)
  writeObject(practicedKey(childId, deckId), merged)
}

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
    /*
      随机抽还不够 —— 只随机的话,「再练一遍」很容易又把刚做过的那几张端上来。
      内容包越小越明显:一个只有 18 张卡的包,每组抽 12 张,
      连着练两遍必然有一大半是重样的,孩子的原话就是「怎么又是这些」。
      所以记住上一遍出过哪些卡,这一遍先从没出过的里面抽,
      实在不够了才回头用旧的(而且旧的也要打乱,不能按原顺序端上来)。
    */
    const seen = new Set(recentPracticed(childId, deckId))
    const fresh: StudyState[] = []
    const used: StudyState[] = []
    for (const s of states) (seen.has(s.cardId) ? used : fresh).push(s)
    const pool = [...shuffle(fresh), ...shuffle(used)]
    const cardsById0 = new Map(readTable<LearnCard>(KEYS.cards).map((c) => [c.id, c]))
    const out0: DueCard[] = []
    for (const st of pool) {
      const card = cardsById0.get(st.cardId)
      if (card) out0.push({ card, state: st })
      if (out0.length >= limit) break
    }
    rememberPracticed(
      childId,
      deckId,
      out0.map((d) => d.card.id),
      states.length,
    )
    return out0
  }
  // 到期的优先;今天还没练过这个卡组、且不够 DAILY_FLOOR 张时,提前拿最快到期的补上
  const chosen = availableToday(
    states,
    today,
    limit,
    !practicedTodayDecks(childId, today).has(deckId),
  )
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
  // 幼儿档用更短的间隔 —— 8 天后再见面对他等于新词(见 core/srs 的说明)
  const upd = gradeCard(states[idx], grade, tuningFor(getStage()))
  states[idx] = { ...states[idx], ...upd, lastReviewed: Date.now() }
  writeTable(KEYS.states, states)
}

export interface SessionResult {
  correct: number
  total: number
  pointsAwarded: number
  newBalance: number
  newXp: number
  /** 这一组有没有因为撞上每日上限而少给了分 */
  capped?: boolean
}

/** 会话结束:记录 session、按答对数加分。 */
export function finishSession(params: {
  childId: string
  deckId: string
  mode: PracticeMode
  total: number
  correct: number
  durationSec: number
  /** 是否「再练一遍」。随便练不算「今天这个卡组已经练过了」,见 availableToday */
  free?: boolean
}): SessionResult {
  const { childId, deckId, mode, total, correct, durationSec, free } = params
  const points = correct * POINTS_PER_CORRECT
  const sessions = readTable(KEYS.sessions)
  sessions.push({
    id: newId(),
    free: !!free,
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
  /*
    ⚠️ 报给界面的必须是**实际加进去的**分,不是打算加的分。
    撞上每日上限时,如果这里照旧报 points,结算页会显示「+20」
    而账上只多了 5 —— 孩子下次自己一算就发现对不上,
    那比不给分更伤:他会觉得这个程序在骗他。
  */
  const before = getPoints()
  const after = addPoints(points)
  const actual = after.balance - before.balance
  return {
    correct,
    total,
    pointsAwarded: actual,
    // 由这里判断「有没有被上限截住」—— 界面拿实际值再去比,永远比不出来
    capped: actual < points,
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
  // 同上:报实际加进去的分,否则撞上每日上限时结算页的数字是假的
  const beforeDrill = getPoints()
  const after = addPoints(points)
  return {
    correct,
    total,
    pointsAwarded: after.balance - beforeDrill.balance,
    newBalance: after.balance,
    newXp: after.xp,
  }
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
  entry: { front: string; back: string; subject?: string; redo?: RedoSpec },
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
    /*
      redo 决定这道错题**将来怎么重做**(选择题 / 输入)。
      存在卡上而不是重做时现算 —— 干扰项必须和当初做错时是同一批,
      否则「重做」就变成了另一道题。
    */
    extra:
      entry.subject || entry.redo
        ? { ...(entry.subject ? { subject: entry.subject } : {}), ...(entry.redo ? { redo: entry.redo } : {}) }
        : undefined,
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
  entry: { front: string; back: string; subject?: string; redo?: RedoSpec },
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

/**
 * 重做答对 → **立刻移出错题本**。
 *
 * 原先是「连对两次才毕业」,而且只在进错题本页时结算。想法是稳妥,
 * 实际效果是:孩子辛辛苦苦做完一轮,列表一条没少 —— 他看不到自己
 * 「消灭掉」了什么,那件事本身就没意思了。
 *
 * 4 岁半的孩子需要的是**立刻看见结果**。做对一道,它就没了,列表变短一格,
 * 这才是他愿意再做一轮的理由。
 * 万一是蒙对的也不要紧:同一道题下次再错,会重新进来。
 */
export function retireErrorCard(childId: string, cardId: string): boolean {
  const deckId = getErrorDeckId(childId)
  if (!deckId) return false
  const card = readTable<LearnCard>(KEYS.cards).find((c) => c.id === cardId)
  if (!card || card.deckId !== deckId) return false
  deleteCard(cardId)
  return true
}

/**
 * 错题「毕业」:重做连着答对两次就移出错题本。
 *
 * 为什么必须有:原先错题只进不出。一个每天做题的孩子,两个月就能攒出
 * 两三百道 —— 家长打开一看,再也不会点第二次。**一个只增不减的错题本,
 * 最后一定会被放弃**,那前面自动收集做得再好也没用。
 *
 * 门槛定在「连对两次」而不是一次:错题里有相当一部分当初就是蒙错的,
 * 一次答对说明不了什么;连着两次答对(而且中间隔着 SRS 安排的天数),
 * 才算真的记住了。
 */
export function graduateErrorCards(childId: string): number {
  const deckId = getErrorDeckId(childId)
  if (!deckId) return 0
  const states = readTable<StudyState>(KEYS.states)
  const graduating = states.filter(
    (st) => st.childId === childId && st.deckId === deckId && (st.reps ?? 0) >= 2,
  )
  if (graduating.length === 0) return 0
  const ids = new Set(graduating.map((st) => st.cardId))
  writeTable(
    KEYS.cards,
    readTable<LearnCard>(KEYS.cards).filter((c) => !ids.has(c.id)),
  )
  writeTable(
    KEYS.states,
    states.filter((st) => !(st.deckId === deckId && ids.has(st.cardId))),
  )
  return graduating.length
}

/** 今天有多少道错题要重做 —— 首页拿它提示,不然错题本没人会主动点 */
export function errorDueToday(childId: string): number {
  const deckId = getErrorDeckId(childId)
  if (!deckId) return 0
  const today = todayISO()
  return readTable<StudyState>(KEYS.states).filter(
    (st) => st.childId === childId && st.deckId === deckId && isDue(st, today),
  ).length
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
  // 没设过就按年龄给 —— 4 岁半和初中生的「今天练几题算够」显然不是一个数
  const fallback = defaultDailyGoal(getStage())
  const n = readObject<number>('dailyGoal', fallback)
  return typeof n === 'number' && n > 0 ? n : fallback
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

/**
 * 每个卡组的「实际情况」—— 推荐要用的信号。
 *
 * 原先「今天就做这个」是按固定顺序挑的,完全不看孩子的真实情况:
 * 昨天错了一堆的那组不会被优先,五天没碰的那组也不会被想起来。
 * 有了这些信号,推荐才谈得上是推荐。
 */
export function deckSignals(childId: string): DeckSignal[] {
  const today = todayISO()
  const states = readTable<StudyState>(KEYS.states).filter((s) => s.childId === childId)
  const decks = readTable<LearnDeck>(KEYS.decks).filter((d) => d.childId === childId)

  // 每个卡组最后一次练是什么时候(只认正经会话,「再练一遍」不算)
  const lastDone = new Map<string, string>()
  for (const s of readTable<{ childId: string; deckId: string; date: string; free?: boolean }>(
    KEYS.sessions,
  )) {
    if (!s || s.childId !== childId || s.free) continue
    const cur = lastDone.get(s.deckId)
    if (!cur || s.date > cur) lastDone.set(s.deckId, s.date)
  }

  const done = practicedTodayDecks(childId, today)
  return decks.map((d) => {
    const mine = states.filter((s) => s.deckId === d.id)
    const last = lastDone.get(d.id)
    return {
      id: d.id,
      name: d.name,
      itemType: d.itemType,
      due: availableToday(mine, today, Number.MAX_SAFE_INTEGER, !done.has(d.id)).length,
      lapses: mine.reduce((n, s) => n + (s.lapses || 0), 0),
      daysSince: last ? daysBetween(last, today) : -1,
      total: mine.length,
    }
  })
}

/** 两个日期差几天(都是 YYYY-MM-DD) */
function daysBetween(a: string, b: string): number {
  const t1 = new Date(`${a}T00:00:00`).getTime()
  const t2 = new Date(`${b}T00:00:00`).getTime()
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0
  return Math.max(0, Math.round((t2 - t1) / 86400000))
}

/**
 * 今天各板块做了多少 —— 每日评分卡要用。
 * 按科目归拢:英语启蒙、语文、数学、习惯。
 */
export function todayByArea(childId: string): Array<{
  key: string
  done: number
  correct: number
}> {
  const today = todayISO()
  const decks = new Map(
    readTable<LearnDeck>(KEYS.decks).map((d) => [d.id, d.subject || '学习']),
  )
  const acc = new Map<string, { done: number; correct: number }>()
  const bump = (k: string, done: number, correct: number) => {
    const cur = acc.get(k) ?? { done: 0, correct: 0 }
    cur.done += done
    cur.correct += correct
    acc.set(k, cur)
  }
  for (const s of readTable<{
    childId: string
    deckId: string
    date: string
    total: number
    correct: number
  }>(KEYS.sessions)) {
    if (!s || s.childId !== childId || s.date !== today) continue
    bump(decks.get(s.deckId) ?? '学习', s.total || 0, s.correct || 0)
  }
  for (const d of readTable<{ childId: string; date: string; total: number; correct: number }>(
    KEYS.drills,
  )) {
    if (!d || d.childId !== childId || d.date !== today) continue
    bump('数学', d.total || 0, d.correct || 0)
  }
  return [...acc.entries()].map(([key, v]) => ({ key, ...v }))
}

/**
 * 昨天的评分,以及记录今天的。
 *
 * 「和昨天的自己比」是这套打分唯一的比较基准 —— 不和满分比,也不和别的孩子比。
 * 所以必须把昨天那个数留住;跨天时把「今天」挪成「昨天」,而不是算历史平均
 * (平均数会把一次特别好的一天摊平,孩子感觉不到进步)。
 */
interface DayScore {
  date: string
  score: number
}

export function yesterdayScore(): number {
  const cur = readObject<DayScore>('scoreToday', { date: '', score: -1 })
  if (cur.date && cur.date !== todayISO()) {
    // 跨天了:把昨天那个数存好,今天从头开始
    writeObject('scoreYesterday', cur.score)
    writeObject('scoreToday', { date: todayISO(), score: -1 })
    return cur.score
  }
  return readObject<number>('scoreYesterday', -1)
}

export function recordTodayScore(score: number): void {
  writeObject('scoreToday', { date: todayISO(), score })
}


/** 今天这一组里,有几张是之前答错过的 —— 首页告诉家长「今天要补几题」 */
export function wrongDueToday(childId: string): number {
  const today = todayISO()
  let n = 0
  for (const st of readTable<StudyState>(KEYS.states)) {
    if (!st || st.childId !== childId) continue
    if ((st.lapses || 0) <= 0) continue
    if (isDue(st, today)) n += 1
  }
  return n
}

/**
 * 家长自己加内容。
 *
 * 内容会用完 —— 20 篇故事、53 段对话,一年就见底了。原先只能自定义
 * **英语词本**,故事和问答题加不了,而那两样恰恰是家长最容易自己攒的
 * (随口编的小故事、生活里问他的问题)。
 *
 * 三种自定义卡组:
 * - word:英语词本(原有)
 * - fact:问答卡「问题|答案」—— 常识、安全、家里的约定都能装
 * - poem:故事/儿歌,一行一句 —— 走的是逐句点读那套渲染
 */
export function createCustomDeckOf(
  childId: string,
  name: string,
  itemType: 'word' | 'fact' | 'poem',
): string {
  const deckId = newId()
  const icon = itemType === 'fact' ? '❓' : itemType === 'poem' ? '📖' : '📗'
  const subject = itemType === 'fact' ? '常识' : itemType === 'poem' ? '语文' : '英语'
  const deck: LearnDeck = {
    id: deckId,
    childId,
    subject,
    name: name || '我加的内容',
    icon,
    source: 'custom',
    itemType,
    createdAt: Date.now(),
  }
  writeTable(KEYS.decks, [...readTable<LearnDeck>(KEYS.decks), deck])
  return deckId
}

/**
 * 解析家长粘贴的问答卡:每行「问题|答案」(全角半角竖线都认)。
 * 认不出格式的行**跳过而不是报错** —— 家长从别处复制过来,
 * 中间夹一行标题很正常,不该因此整批失败。
 */
export function parseFactList(raw: string): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = []
  for (const line of String(raw ?? '').split(/[\r\n]+/)) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(/[|｜]/)
    if (parts.length < 2) continue
    const q = parts[0].trim()
    const a = parts.slice(1).join('|').trim()
    if (q && a) out.push({ q, a })
  }
  return out
}

/** 解析家长粘贴的故事:第一行是标题,其余每行一句 */
export function parseStory(raw: string): { title: string; lines: string[] } | undefined {
  const rows = String(raw ?? '')
    .split(/[\r\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
  if (rows.length < 2) return undefined
  return { title: rows[0], lines: rows.slice(1) }
}

/** 往自定义卡组里加卡(问答 / 故事通用)。返回新增了几张 */
export function addCustomCards(
  childId: string,
  deckId: string,
  items: Array<{ front: string; back: string; lines?: string[] }>,
): number {
  const cards = readTable<LearnCard>(KEYS.cards)
  const states = readTable<StudyState>(KEYS.states)
  const have = new Set(cards.filter((c) => c.deckId === deckId).map((c) => c.front))
  let order = cards.filter((c) => c.deckId === deckId).length
  const init = initialSrs()
  let added = 0
  for (const it of items) {
    if (!it.front || have.has(it.front)) continue
    have.add(it.front)
    const card: LearnCard = {
      id: newId(),
      deckId,
      front: it.front,
      back: it.back,
      audioText: it.lines ? it.lines.join('，') : it.front,
      order: order++,
      extra: it.lines ? { lines: it.lines, author: '', dynasty: '' } : undefined,
    }
    cards.push(card)
    states.push({ id: newId(), childId, cardId: card.id, deckId, ...init })
    added += 1
  }
  writeTable(KEYS.cards, cards)
  writeTable(KEYS.states, states)
  return added
}

/**
 * 每个卡组的难度档(0–4)。
 *
 * 存在卡组上而不是全局:识字可能已经很熟,英语还在入门 ——
 * 一个全局难度会同时把两边都调错。
 */
export function deckLevel(deckId: string): number {
  const map = readObject<Record<string, number>>('deckLevel', {})
  const v = map && typeof map === 'object' ? map[deckId] : undefined
  return typeof v === 'number' ? v : 2 // 默认从「正常」起步
}

function setDeckLevel(deckId: string, level: number): void {
  const map = readObject<Record<string, number>>('deckLevel', {})
  writeObject('deckLevel', { ...(map && typeof map === 'object' ? map : {}), [deckId]: level })
}

/**
 * 一组做完之后,按最近几组的正确率决定升降档。
 * 返回变化方向,供界面告诉家长「变难了 / 变简单了」。
 */
export function tuneDeckLevel(childId: string, deckId: string): Adjust {
  /*
    「最近几组」按**写入顺序**取,不按 createdAt 排序。

    同一毫秒完成两组时 createdAt 会打平,排序就成了随机的 —— 那样
    「最近一组」可能取到更早的那一组,难度会朝反方向调。
    会话是顺序追加的,所以倒着数天然就是从新到旧,不需要任何时间戳。
  */
  const all = readTable<{
    childId: string
    deckId: string
    total: number
    correct: number
    free?: boolean
  }>(KEYS.sessions)
  const recent: Array<{ total: number; correct: number }> = []
  for (let i = all.length - 1; i >= 0 && recent.length < 4; i--) {
    const r = all[i]
    if (!r || r.childId !== childId || r.deckId !== deckId || r.free) continue
    recent.push({ total: r.total || 0, correct: r.correct || 0 })
  }

  const adjust = adjustFor(recent)
  if (adjust !== 'keep') setDeckLevel(deckId, nextLevel(deckLevel(deckId), adjust))
  return adjust
}
