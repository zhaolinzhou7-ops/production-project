import type { AgeStage, CardItemType, PracticeMode } from '../types'
import { modeLadder, specOf } from './adaptive'

/**
 * 「今天就做这个」—— 一条排好的路,孩子不需要做任何选择。
 *
 * 为什么需要它:首页有 9 个入口、32 个内容包、11 种练法,而使用者是一个
 * 4 岁半、**不识字**的孩子,每天用 15 分钟。他打开首页要面对十几个可点的
 * 东西,全是他读不了的字 —— 真实结果是他点到哪儿算哪儿,或者每次都点同一个。
 *
 * 功能多不是错,错的是「今天该做什么」变得不清楚。所以给幼儿段一个大按钮:
 * 点进去是排好的几步,做完自动收尾。其余入口收到「更多」后面。
 *
 * 排序有讲究:先听后说、先熟悉后考查、把最费神的放中间(开头他还没进入状态,
 * 结尾他已经累了),最后一步一定是轻松的 —— 让他带着「今天很顺」的感觉离开。
 */

export interface PlanStep {
  deckId: string
  mode: PracticeMode
  /** 给家长看的说明;孩子看到的是图和声音 */
  label: string
  /** 这一步大概几题 */
  limit: number
  /** 为什么今天要练这个 —— 家长看得懂才会信任这条路 */
  reason?: string
}

export interface PlanDeck {
  id: string
  itemType: CardItemType
  name: string
  /** 今天有多少张能练 */
  due: number
  /** 为什么推荐它(来自 core/recommend);没有就不显示 */
  reason?: string
  /** 这个卡组当前的难度档 0–4(见 core/adaptive) */
  level?: number
}

/** 幼儿段一步几题 —— 4 岁半的专注力撑不了 12 题一组 */
const TODDLER_LIMIT = 6

/**
 * 排出今天的路。
 *
 * 只用**今天真的有题可做**的卡组(due > 0);一个都没有就返回空,
 * 由界面去说「今天的都做完啦」,而不是端上来一组空题。
 */
export function buildPlan(decks: PlanDeck[], stage: AgeStage): PlanStep[] {
  const usable = decks.filter((d) => d.due > 0)
  if (usable.length === 0) return []

  const pics = usable.filter((d) => d.itemType === 'pic')
  const hanzi = usable.filter((d) => d.itemType === 'hanzi')
  const words = usable.filter((d) => d.itemType === 'word')
  const poems = usable.filter((d) => d.itemType === 'poem')
  const facts = usable.filter((d) => d.itemType === 'fact')

  const steps: PlanStep[] = []
  const push = (d: PlanDeck | undefined, mode: PracticeMode, label: string, limit: number) => {
    if (!d) return
    if (steps.some((s) => s.deckId === d.id && s.mode === mode)) return
    steps.push({ deckId: d.id, mode, label, limit, reason: d.reason })
  }

  if (stage === 'toddler') {
    /*
      练法**跟着这个卡组的难度档走**,不再写死。

      原先四步是固定的:听中文点图 → 看图选中文名 → 认字 → 磨耳朵。
      前两步对一个中文母语的孩子等于白做 —— 他早就知道 🐱 叫猫。
      现在看图卡这一路**全程英语**,认字那一步照旧是中文(那本来就是中文的事)。
      于是不管孩子练了多少次、答得多好,看到的永远是同一套题 ——
      用户的原话是「做了很多次,每一次还是这样」。
      现在低档给「听英语点图」(只要听得懂),练熟了升到「看图选单词」(要认得出),
      再往上是「读出来」「拼出来」。难度的变化他一眼就能感觉到。
    */
    const modeOf = (d: PlanDeck | undefined, fallback: PracticeMode): PracticeMode =>
      (d ? (modeLadder(d.itemType, d.level ?? 2) as PracticeMode) : undefined) ?? fallback
    const sizeOf = (d: PlanDeck | undefined) => (d ? specOf(d.level ?? 2).size : TODDLER_LIMIT)

    // 1) 第一步用**当前难度**的主练法 —— 状态最好的时候做最该做的
    const d1 = pics[0]
    push(d1, modeOf(d1, 'listenPicEn'), `${d1?.name ?? ''}`, sizeOf(d1))
    // 2) 换一个卡组,同样按它自己的难度档
    const d2 = pics[1] ?? pics[0]
    push(d2, modeOf(d2, 'picChooseEn'), `${d2?.name ?? ''}`, sizeOf(d2))
    // 3) 认字有就练,没有就跳过,不硬凑
    const d3 = hanzi[0]
    push(d3, modeOf(d3, 'recognize'), `认字 · ${d3?.name ?? ''}`, sizeOf(d3))
    // 4) 收尾一定是轻松的:磨耳朵不用操作,躺着听就行(这一步不随难度变)
    push(pics[0], 'earTrain', `磨耳朵 · ${pics[0]?.name ?? ''}`, TODDLER_LIMIT)
    return steps.slice(0, 4)
  }

  // 大孩子:英语 → 语文 → 常识,每样一组
  push(words[0] ?? pics[0], 'recognize', `英语 · ${(words[0] ?? pics[0])?.name ?? ''}`, 12)
  push(hanzi[0], 'recognize', `识字 · ${hanzi[0]?.name ?? ''}`, 12)
  push(poems[0], 'recite', `古诗 · ${poems[0]?.name ?? ''}`, 6)
  push(facts[0], 'quiz', `常识 · ${facts[0]?.name ?? ''}`, 8)
  return steps.slice(0, 4)
}

/** 这一条路大概要多久(分钟)—— 家长要能预估,孩子要能看到终点 */
export function planMinutes(steps: PlanStep[]): number {
  const totalQ = steps.reduce((n, s) => n + s.limit, 0)
  // 按一题约 12 秒估,再加每步之间的过场
  return Math.max(1, Math.round((totalQ * 12 + steps.length * 20) / 60))
}
