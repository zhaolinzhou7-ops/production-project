import type { CardItemType } from '../types'

/**
 * 阶段性测验。
 *
 * 为什么需要它:平时的练习都带着「脚手架」—— 有图、有四个选项、错了当场
 * 就告诉他答案、而且同一批卡反复出现。这些在**学的时候**是对的,
 * 但它们让一个问题永远看不清:**去掉脚手架之后,他到底会多少?**
 *
 * 测验就是把脚手架撤掉:
 * - 跨卡组抽题,不提前告诉他考哪一包
 * - 每题只做一次,做完不当场纠正(避免边考边学,那样测出来的是短时记忆)
 * - 交卷后一次性给分和逐题回顾
 *
 * 对孩子的意义不是「被考」,是**看见自己的进步**:同样一份卷子,
 * 上个月 6 分,这个月 9 分 —— 这是所有日常练习都给不了的反馈。
 * 所以打分必须温和(见 pickScoreBand),而且永远和自己的上一次比。
 */

/** 测验周期 */
export type ExamPeriod = 'week' | 'month' | 'quarter'

export interface ExamPeriodDef {
  period: ExamPeriod
  label: string
  /** 间隔天数 —— 到点了首页才提示「可以考一次了」 */
  days: number
  /** 出几题 */
  size: number
}

/**
 * 三档周期。
 *
 * 周测短(10 题)、月测中(16 题)、季测长(24 题)——
 * 长度按「一次坐得住多久」定,不是按「考得全不全」定:
 * 一个 4 岁半的孩子做到第 25 题就已经在乱点了,那之后的题测不出任何东西。
 */
export const EXAM_PERIODS: ExamPeriodDef[] = [
  { period: 'week', label: '周测', days: 7, size: 10 },
  { period: 'month', label: '月测', days: 30, size: 16 },
  { period: 'quarter', label: '季测', days: 90, size: 24 },
]

export function examPeriodDef(period: ExamPeriod): ExamPeriodDef {
  return EXAM_PERIODS.find((p) => p.period === period) ?? EXAM_PERIODS[0]
}

/** 一张可以进卷子的卡 */
export interface ExamCandidate {
  cardId: string
  deckId: string
  deckName: string
  itemType: CardItemType
  front: string
  back: string
  emoji?: string
  en?: string
  /** 学过多少次 —— 没学过的不该进卷子 */
  reps: number
  /** 错过多少次 —— 错得多的更该被考到 */
  lapses: number
}

export interface ExamQuestion {
  cardId: string
  deckId: string
  /** 题面提示语 */
  prompt: string
  /** 大图(看图题) */
  emoji?: string
  /** 点「再听一遍」读什么 */
  audio?: string
  lang: 'zh' | 'en'
  options: string[]
  answer: string
  /** 选项是图还是文字 */
  optionKind: 'text' | 'emoji'
}

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

/** 出题时每题几个选项 —— 和平时一样 4 个,不额外加难度 */
const OPTIONS = 4

function optionsFrom(answer: string, pool: string[]): string[] {
  const seen = new Set([answer])
  const out: string[] = []
  for (const v of shuffle(pool)) {
    const t = String(v ?? '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= OPTIONS - 1) break
  }
  return shuffle([answer, ...out])
}

/**
 * 组卷。
 *
 * 三条规则,每一条都有理由:
 * 1. **只考学过的**(reps ≥ 1)。考没教过的东西不是测验,是打击。
 * 2. **各个卡组都要有**。只从一包里抽,考的是那一包,不是他的水平;
 *    而且他会发现「这次考的是动物」,下次就只复习动物。
 * 3. **错过的优先**。测验的价值一半在于把没掌握的暴露出来。
 */
export function buildExam(cands: ExamCandidate[], size: number): ExamQuestion[] {
  const learned = cands.filter((c) => c.reps >= 1)
  if (learned.length === 0) return []

  // 先按卡组分组,轮着取 —— 保证每一包都被考到
  const byDeck = new Map<string, ExamCandidate[]>()
  for (const c of learned) {
    const list = byDeck.get(c.deckId) ?? []
    list.push(c)
    byDeck.set(c.deckId, list)
  }
  for (const [k, list] of byDeck) {
    // 组内:错得多的排前面,其余打乱
    byDeck.set(
      k,
      shuffle(list).sort((a, b) => (b.lapses || 0) - (a.lapses || 0)),
    )
  }

  const picked: ExamCandidate[] = []
  const decks = shuffle([...byDeck.keys()])
  let round = 0
  while (picked.length < size) {
    let addedThisRound = false
    for (const d of decks) {
      if (picked.length >= size) break
      const list = byDeck.get(d)!
      if (round < list.length) {
        picked.push(list[round])
        addedThisRound = true
      }
    }
    if (!addedThisRound) break
    round += 1
  }

  return shuffle(picked)
    .map((c) => toQuestion(c, learned))
    .filter((q): q is ExamQuestion => !!q)
}

/**
 * 把一张卡变成一道题。
 *
 * 题型跟着内容类型走,而且**英语内容一律纯英文** ——
 * 平时练的是纯英文,考的时候突然冒出中文选项,那考的就是另一件事了。
 */
function toQuestion(c: ExamCandidate, pool: ExamCandidate[]): ExamQuestion | undefined {
  const sameType = pool.filter((x) => x.itemType === c.itemType && x.cardId !== c.cardId)

  if (c.itemType === 'pic') {
    const en = c.en ?? c.back
    if (!en) return undefined
    // 看图选英文:图在上面,四个英文词在下面(每个都能点着听)
    const options = optionsFrom(
      en,
      sameType.map((x) => x.en ?? x.back),
    )
    if (options.length < 2) return undefined
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: 'What is it?',
      emoji: c.emoji,
      audio: en,
      lang: 'en',
      options,
      answer: en,
      optionKind: 'text',
    }
  }

  if (c.itemType === 'word') {
    const options = optionsFrom(
      c.front,
      sameType.map((x) => x.front),
    )
    if (options.length < 2) return undefined
    // 听音选词:纯英文,和平时的练法一致
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: '听一听,选出你听到的词',
      audio: c.front,
      lang: 'en',
      options,
      answer: c.front,
      optionKind: 'text',
    }
  }

  if (c.itemType === 'hanzi') {
    const options = optionsFrom(
      c.front,
      sameType.map((x) => x.front),
    )
    if (options.length < 2) return undefined
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: '听读音,选出正确的字',
      audio: c.front,
      lang: 'zh',
      options,
      answer: c.front,
      optionKind: 'text',
    }
  }

  // 常识问答等:看题选答案
  const options = optionsFrom(
    c.back,
    sameType.map((x) => x.back),
  )
  if (options.length < 2) return undefined
  return {
    cardId: c.cardId,
    deckId: c.deckId,
    prompt: c.front,
    audio: c.front,
    lang: 'zh',
    options,
    answer: c.back,
    optionKind: 'text',
  }
}

export interface ExamBand {
  /** 1–5 颗星 */
  stars: number
  title: string
  /** 给孩子的一句话 */
  cheer: string
}

/**
 * 分数分档。
 *
 * 和日常评分同一套原则(见 core/scoreCard):**没有不及格**。
 * 最低一档说的是「这次有点难」,不是「你不行」——
 * 一次考砸就再也不肯考的孩子,后面所有的测验都白设。
 */
export function pickScoreBand(correct: number, total: number): ExamBand {
  if (total <= 0) return { stars: 0, title: '', cheer: '' }
  const pct = (correct / total) * 100
  if (pct >= 95) return { stars: 5, title: '全都记住了', cheer: '几乎一个都没错,太厉害了!' }
  if (pct >= 85) return { stars: 4, title: '记得很牢', cheer: '大部分都答对了,很稳!' }
  if (pct >= 70) return { stars: 3, title: '记住大半', cheer: '记住了大半,错的那几个我们再练练' }
  if (pct >= 50) return { stars: 2, title: '记住一些', cheer: '有一半记住啦,继续来' }
  return { stars: 1, title: '这次有点难', cheer: '这次的题难了点,错的都收进错题本了,我们一个一个来' }
}

/** 和上一次比 —— 测验真正的价值在这里,不在分数本身 */
export function compareWithLast(score: number, lastScore: number): string {
  if (lastScore < 0) return '这是第一次测验,以后每次都能和这一次比'
  const d = score - lastScore
  if (d >= 10) return `比上次高了 ${d} 分,进步很明显!`
  if (d > 0) return `比上次高了 ${d} 分`
  if (d === 0) return '和上次一样稳'
  return `比上次低了 ${-d} 分 —— 可能是这次抽到的题不一样,不用在意`
}

/** 到点了没有:距离上次测验够不够一个周期 */
export function examDue(lastAt: number, period: ExamPeriod, now = Date.now()): boolean {
  if (!lastAt) return true
  const def = examPeriodDef(period)
  return now - lastAt >= def.days * 24 * 60 * 60 * 1000
}
