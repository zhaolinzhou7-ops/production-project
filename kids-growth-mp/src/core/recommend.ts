import type { CardItemType } from '../types'

/**
 * 今天推荐练什么,以及**为什么**。
 *
 * 原先「今天就做这个」是按固定顺序挑的:第一个看图包、第二个看图包、
 * 识字包、磨耳朵。它不看孩子的实际情况 —— 昨天错了一堆的那组不会被优先,
 * 五天没碰的那组也不会被想起来。
 *
 * 推荐要带**理由**,而且理由是给家长看的。家长能看懂「为什么今天先练这个」,
 * 才会信任这条路;看不懂的推荐,他下次就绕过去自己挑了。
 */

export interface DeckSignal {
  id: string
  name: string
  itemType: CardItemType
  /** 今天有多少张能练 */
  due: number
  /** 这一组累计答错次数(lapses 之和)—— 薄弱程度 */
  lapses: number
  /** 距离上次练过多少天;从没练过传 -1 */
  daysSince: number
  /** 这一组一共有多少张卡 */
  total: number
}

export interface Reco {
  deckId: string
  name: string
  itemType: CardItemType
  /** 为什么推荐它 —— 一句人话 */
  reason: string
  /** 排序用,越大越靠前 */
  weight: number
}

/**
 * 打分排序。
 *
 * 权重顺序背后的教育判断:
 * 1. **错得多的最优先**。忘掉的东西不补,后面学的都会架空。
 * 2. **久没碰的其次**。间隔重复最怕的是「彻底断掉」——
 *    五天没练的卡组,再放几天就等于从头再来。
 * 3. **到期多的第三**。这是常规的复习节奏。
 * 4. **从没开过的垫底**,但一定要给一个位置 ——
 *    否则新装的内容包会永远排不上号,家长会以为「加了没用」。
 */
export function rankDecks(decks: DeckSignal[]): Reco[] {
  const out: Reco[] = []
  for (const d of decks) {
    if (d.due <= 0 && d.daysSince >= 0) continue // 没题可做,且不是新包
    let weight = 0
    let reason = ''

    if (d.lapses >= 3) {
      weight = 100 + d.lapses
      reason = `之前有 ${d.lapses} 次没记住,今天先补一补`
    } else if (d.daysSince < 0) {
      weight = 40
      reason = '这一组还没开过,先认一遍'
    } else if (d.daysSince >= 4) {
      weight = 80 + Math.min(d.daysSince, 20)
      reason = `${d.daysSince} 天没练了,再放就忘光了`
    } else if (d.due >= 10) {
      weight = 60 + Math.min(d.due, 30)
      reason = `今天有 ${d.due} 张到期`
    } else if (d.due > 0) {
      weight = 30 + d.due
      reason = `今天有 ${d.due} 张要复习`
    } else {
      continue
    }
    out.push({ deckId: d.id, name: d.name, itemType: d.itemType, reason, weight })
  }
  // 同权重时按名字排,保证同一天进来两次顺序不会跳
  out.sort((a, b) => (b.weight === a.weight ? a.name.localeCompare(b.name) : b.weight - a.weight))
  return out
}

/**
 * 从排好序的推荐里挑出**类型不重复**的前 n 个。
 *
 * 为什么要去重类型:连着三步都是看图选词,孩子第二步就腻了。
 * 换着来的那一组,即使单项优先级低一点,整体坚持下来的概率高得多。
 */
export function diversify(list: Reco[], n: number): Reco[] {
  const out: Reco[] = []
  const usedType = new Set<CardItemType>()
  for (const r of list) {
    if (out.length >= n) break
    if (usedType.has(r.itemType)) continue
    out.push(r)
    usedType.add(r.itemType)
  }
  // 类型不够多时,用剩下的补满
  for (const r of list) {
    if (out.length >= n) break
    if (out.some((x) => x.deckId === r.deckId)) continue
    out.push(r)
  }
  return out
}
