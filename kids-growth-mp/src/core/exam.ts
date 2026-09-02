import type { CardItemType } from '../types'

/**
 * 阶段性测验 —— **开放式产出,家长判对错**。
 *
 * 为什么需要它:平时的练习都带着「脚手架」—— 有图、有四个选项、错了当场
 * 就告诉他答案、而且同一批卡反复出现。这些在**学的时候**是对的,
 * 但它们让一个问题永远看不清:**去掉脚手架之后,他到底会多少?**
 *
 * ⚠️ v64 的一次重做:原先测验是四选一。
 *
 * 那样做有一个绕不过去的问题 —— **四选一有 25% 的蒙对率**。
 * 一个 10 题的卷子,闭着眼睛点也有两三题是对的;更麻烦的是,
 * 他真正的状态(见到图能不能把词说出来)在选项里是看不见的:
 * 认得出 goat 这个词长什么样,和见到山羊能说出 goat,差着一整个台阶。
 * 换句话说,原来那份卷子测的是**再认**,而我们想知道的是**产出**。
 *
 * 所以现在:**看图,说出来,家长点对/不对。**
 * 没有选项就没有蒙的余地,而且家长在旁边坐一次,
 * 比看十份正确率报表更知道孩子到了哪一步。
 *
 * 那它和线下抽查(core/spotCheck)有什么不同?
 * · 抽查:5 题,**不在屏幕上**,随口问,抽系统最有把握的 —— 专治「虚假掌握」
 * · 测验:整卷,在屏幕上,跨卡组按周期考,**有成绩曲线** —— 看的是长期趋势
 * 两个都是开放式产出,但一个是抽样体检,一个是阶段考试,不重复。
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
 * 长度按「一次坐得住多久」定,不是按「考得全不全」定:
 * 一个 4 岁半的孩子做到第 25 题就已经在乱点了,那之后的题测不出任何东西。
 *
 * 改成开放式产出之后**每题变慢了** —— 他要想、要开口,家长要听、要判。
 * 原来 10/16/24 是按「点四个选项」的节奏定的,照搬过来会拖成一场酷刑,
 * 而拖长的后果不是测得更准,是他下次不肯考。所以整体收短一档。
 */
export const EXAM_PERIODS: ExamPeriodDef[] = [
  { period: 'week', label: '周测', days: 7, size: 8 },
  { period: 'month', label: '月测', days: 30, size: 12 },
  { period: 'quarter', label: '季测', days: 90, size: 16 },
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
  /**
   * 题面上要显示的字。
   *
   * 只有「看字读出来」这类题才有(识字卡)——
   * 看图题**故意不给字**:给了就成了照着念,不是产出。
   */
  show?: string
  /** 他该说出来的那句话 —— 也是家长核对的标准答案 */
  answer: string
  /** 答案的语言:决定「听答案」用哪个音源,以及家长提示里写什么 */
  lang: 'zh' | 'en'
  /**
   * 出题时**不能播**的音频。
   *
   * 存在这里只给「公布答案 / 逐题回顾」用 ——
   * 出题时放出来就等于把答案念给他听了。
   */
  audio?: string
  /** 给家长的一句判分说明(比如「说成 sheep 也算对」) */
  note?: string
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

  /*
    **同一张图可能有好几个正确答案。**

    emoji 就那么多,而英语的词比 emoji 多得多,于是同一张图在不同内容包里
    会指向不同的词:🏃 在动作包里是 run、在运动包里是 running、
    在家人职业包里是 athlete。这不是错误,是这个载体的天花板 ——
    硬给它们换一张「勉强像」的图,只会造出第二个「金牌代表第一名」。

    但测验是**跨卡组**抽题的,家长看到 🏃 拿着标准答案 running,
    孩子说了 run —— 他没错,却会被判错。
    所以把「这张图还能叫什么」一并算出来,写进给家长的那句说明里。
    只统计**他装了的卡组**:没装的包不会出现在他面前,提了反而添乱。
  */
  const alias = new Map<string, Set<string>>()
  for (const c of learned) {
    const key = c.emoji
    if (!key) continue
    const word = (c.en ?? c.back ?? '').trim()
    if (!word) continue
    if (!alias.has(key)) alias.set(key, new Set())
    alias.get(key)!.add(word)
  }

  return shuffle(picked)
    .map((c) => toQuestion(c, alias))
    .filter((q): q is ExamQuestion => !!q)
}

/**
 * 把一张卡变成一道题 —— **一道要他开口说出来的题**。
 *
 * 每种内容问法不同,但只有一条共同规则:
 * **题面上绝不能出现答案**(不显示、不朗读)。
 * 这是开放式产出和四选一最大的区别 —— 一旦答案在屏幕上,
 * 测的就又变回「认得出来吗」了。
 */
function toQuestion(
  c: ExamCandidate,
  alias: Map<string, Set<string>> = new Map(),
): ExamQuestion | undefined {
  if (c.itemType === 'pic') {
    const en = c.en ?? c.back
    if (!en) return undefined
    // 这张图在他装的其它卡组里还叫什么 —— 说了这些也算对
    const others = [...(alias.get(c.emoji ?? '') ?? [])].filter((w) => w !== en)
    /*
      看图说词:图在上面,底下什么都没有。
      他看着山羊说 "goat" —— 这是这套系统里最接近「真的会了」的一件事。
    */
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: 'What is it? 这是什么?用英语说出来',
      emoji: c.emoji,
      answer: en,
      lang: 'en',
      audio: en,
      note:
        `中文是「${c.front}」;发音差不多就算对,不用卡口音` +
        (others.length > 0 ? `。说成 ${others.join(' / ')} 也算对 —— 这张图两样都指得通` : ''),
    }
  }

  if (c.itemType === 'word') {
    /*
      单词卡没有图,front 是英文、back 是中文。
      问法是**中译英**:说出「苹果」的英语 —— 同样是产出,不是再认。
      反过来(给英文说中文)测不出什么:他天天说中文。
    */
    if (!c.back || !c.front) return undefined
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: `「${c.back}」用英语怎么说?`,
      answer: c.front,
      lang: 'en',
      audio: c.front,
      note: '说对了就算,不用拼出来',
    }
  }

  if (c.itemType === 'hanzi') {
    /*
      识字:把字摆出来,他读出来。
      这一类**必须显示题面**——不显示就没得认了。
      但答案(读音)照旧不播。
    */
    if (!c.front) return undefined
    return {
      cardId: c.cardId,
      deckId: c.deckId,
      prompt: '这个字念什么?',
      show: c.front,
      answer: c.back || c.front,
      lang: 'zh',
      audio: c.front,
      note: '念对读音就算对',
    }
  }

  // 常识问答等:念题目,他说答案
  if (!c.front || !c.back) return undefined
  return {
    cardId: c.cardId,
    deckId: c.deckId,
    prompt: c.front,
    answer: c.back,
    lang: 'zh',
    audio: c.back,
    note: '意思对就算对,不用一字不差',
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
