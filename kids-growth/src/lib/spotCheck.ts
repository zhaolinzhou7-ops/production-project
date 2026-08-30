import type { CardItemType } from '../types'

/**
 * 线下抽查。
 *
 * 这是整套系统里**唯一一个不在屏幕上进行**的功能,而它可能是最重要的一个。
 *
 * 问题在这里:所有「他掌握了 480 个词」的数字,都来自他在屏幕上点对了。
 * 而屏幕上有图、有选项、有排除法 —— 一个什么都不会的孩子,四选一也能蒙对 25%,
 * 认得图的孩子能到 80%。于是「掌握量」这个数字会一路涨,涨到家长深信不疑,
 * 而孩子在真实场合一个词也说不出来。
 *
 * **虚假掌握是这类学习工具最大的系统性风险**,而且它不会报错、不会崩溃,
 * 只会安静地积累到某一天被现实戳破。
 *
 * 唯一能戳破它的办法,是把屏幕合上:家长照着单子问,孩子用嘴回答。
 * 没有图、没有选项、没有排除法 —— 说得出就是说得出。
 *
 * 抽查的结果**要回写**到记忆排期里:线下答不出的,不管屏幕上多熟,
 * 都退回重学。这一条让「掌握量」第一次有了可信度。
 */

export interface SpotCandidate {
  cardId: string
  deckId: string
  deckName: string
  itemType: CardItemType
  /** 问他什么(中文提示或图) */
  ask: string
  /** 期望他说出什么 */
  expect: string
  emoji?: string
  /** 屏幕上答对过几次 */
  reps: number
  /** 间隔天数 —— 间隔越长,系统越认为他「掌握了」,越该被抽查 */
  interval: number
}

export interface SpotItem {
  cardId: string
  deckName: string
  ask: string
  expect: string
  emoji?: string
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

/** 一次抽查几个 —— 五个,一分钟问得完;多了家长第二次就不做了 */
export const SPOT_SIZE = 5

/**
 * 挑出这次要抽查的几个。
 *
 * 挑的是**系统最有把握的那些** —— 间隔最长、答对次数最多的。
 * 这是有意的:抽查的目的不是找出他不会的(那些系统已经知道了),
 * 而是**检验系统自己的判断**。如果连它最有把握的都问不出来,
 * 那整个掌握量的数字都要打折扣。
 */
export function pickSpotCheck(cands: SpotCandidate[], size = SPOT_SIZE): SpotItem[] {
  const ready = cands.filter((c) => c.reps >= 2 && c.interval >= 2)
  if (ready.length === 0) return []
  // 按「系统有多确信」排序,取最确信的一批,再从里面随机取 size 个
  const sorted = [...ready].sort((a, b) => b.interval - a.interval || b.reps - a.reps)
  const top = sorted.slice(0, Math.max(size * 3, size))
  return shuffle(top)
    .slice(0, size)
    .map((c) => ({
      cardId: c.cardId,
      deckName: c.deckName,
      ask: c.ask,
      expect: c.expect,
      emoji: c.emoji,
    }))
}

export interface SpotResult {
  /** 真的说出来了几个 */
  passed: number
  total: number
  /** 真实掌握率 0–100 */
  rate: number
  /** 给家长看的一句话 —— 说实话,但不制造焦虑 */
  note: string
}

/**
 * 结论。
 *
 * 措辞很重要:这句话是给**家长**看的,而家长看到一个低数字的第一反应
 * 往往是「是不是白学了」。所以每一档都要说清楚**接下来做什么**,
 * 而不是只给一个评价。
 */
export function scoreSpotCheck(passed: number, total: number): SpotResult {
  if (total <= 0) return { passed: 0, total: 0, rate: 0, note: '' }
  const rate = Math.round((passed / total) * 100)
  let note: string
  if (rate >= 80) {
    note = '屏幕上的成绩是真的 —— 合上手机他也说得出来,可以放心往下学。'
  } else if (rate >= 50) {
    note =
      '一半左右能脱口而出,另一半还停在「看到选项能认出来」。' +
      '没说出来的已经退回重学,接下来会多安排「跟我读」和「说给我听」。'
  } else {
    note =
      '屏幕上的熟练度比实际高不少 —— 这很常见,四选一本来就能蒙。' +
      '没说出来的都退回重学了,建议接下来几天多用「跟我读」,少用选择题。'
  }
  return { passed, total, rate, note }
}

/**
 * 抽查该多久做一次。
 *
 * 七天。再密家长会烦,再疏就失去了「及时纠偏」的意义 ——
 * 一个月才发现掌握量虚高,那一个月的学习顺序已经排错了。
 */
export const SPOT_INTERVAL_DAYS = 7

export function spotDue(lastAt: number, now = Date.now()): boolean {
  if (!lastAt) return true
  return now - lastAt >= SPOT_INTERVAL_DAYS * 24 * 60 * 60 * 1000
}
