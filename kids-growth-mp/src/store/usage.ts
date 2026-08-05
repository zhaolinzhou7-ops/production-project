import { readTable, writeTable } from './db'
import { todayISO } from '../core/dateUtils'

/**
 * 他到底怎么用的。
 *
 * 在这之前,这套系统里没有任何「实际被怎么用」的记录 —— 哪个内容包他一次
 * 都没打开、哪种练法他每次做两题就退、他到底几点在用,全不知道。
 * 结果是我给这个系统加内容时是在**猜**,而你只能等到想起来了才告诉我。
 *
 * 所以记一份使用日志。**只存本机、不上传**,给家长一周看一次,
 * 用来回答两个问题:该砍掉什么,该多做什么。
 */

const KEY = 'usageLog'
/** 只留最近这么多条 —— 够看一两个月,又不会把存储撑爆 */
const MAX = 400

export type UsageKind = 'open' | 'finish' | 'quit'

export interface UsageEvent {
  t: number
  date: string
  /** 几点(0–23),用来看他实际在什么时段用 */
  hour: number
  kind: UsageKind
  deck: string
  mode: string
  /** finish/quit 时:做到第几题 / 一共几题 */
  at?: number
  total?: number
}

export function noteUsage(kind: UsageKind, deck: string, mode: string, at?: number, total?: number): void {
  const rows = readTable<UsageEvent>(KEY)
  const d = new Date()
  rows.push({ t: d.getTime(), date: todayISO(), hour: d.getHours(), kind, deck, mode, at, total })
  writeTable(KEY, rows.slice(-MAX))
}

export function allUsage(): UsageEvent[] {
  return readTable<UsageEvent>(KEY)
}

export interface UsageSummary {
  /** 最近 7 天用了几次(打开一组算一次) */
  opens: number
  /** 完成率:开了多少组、做完多少组 */
  finished: number
  /** 半途退出的组数 */
  quits: number
  /** 最常做的(卡组名 + 次数) */
  top: Array<{ deck: string; n: number }>
  /** 最容易半途退出的 */
  dropping: Array<{ deck: string; mode: string; quitRate: number; n: number }>
  /** 用得最多的时段 */
  peakHour: number
  /** 一次都没打开过的卡组 */
  untouched: string[]
}

/**
 * 汇总最近 N 天。
 *
 * `deckNames` 传当前所有卡组的名字 —— 「一次都没打开过」这条只有对照
 * 完整名单才算得出来,而那恰恰是最该看的一条:一个从没被打开的内容包,
 * 留着只会让首页更挤。
 */
export function summarize(deckNames: string[], days = 7, now = new Date()): UsageSummary {
  const since = now.getTime() - days * 24 * 3600 * 1000
  const rows = allUsage().filter((e) => e && e.t >= since)

  const opens = rows.filter((e) => e.kind === 'open')
  const byDeck = new Map<string, number>()
  for (const e of opens) byDeck.set(e.deck, (byDeck.get(e.deck) ?? 0) + 1)

  const pairKey = (e: UsageEvent) => `${e.deck}||${e.mode}`
  const openBy = new Map<string, number>()
  const quitBy = new Map<string, number>()
  for (const e of rows) {
    if (e.kind === 'open') openBy.set(pairKey(e), (openBy.get(pairKey(e)) ?? 0) + 1)
    if (e.kind === 'quit') quitBy.set(pairKey(e), (quitBy.get(pairKey(e)) ?? 0) + 1)
  }
  const dropping: UsageSummary['dropping'] = []
  for (const [k, n] of openBy) {
    const q = quitBy.get(k) ?? 0
    // 开过至少两次才谈得上「容易退出」,一次的样本说明不了问题
    if (n >= 2 && q > 0) {
      const [deck, mode] = k.split('||')
      dropping.push({ deck, mode, quitRate: Math.round((q / n) * 100), n })
    }
  }
  dropping.sort((a, b) => b.quitRate - a.quitRate)

  const hours = new Array(24).fill(0)
  for (const e of rows) if (e.hour >= 0 && e.hour < 24) hours[e.hour] += 1
  let peakHour = -1
  let peakN = 0
  hours.forEach((n, h) => {
    if (n > peakN) {
      peakN = n
      peakHour = h
    }
  })

  const touched = new Set(rows.map((e) => e.deck))
  return {
    opens: opens.length,
    finished: rows.filter((e) => e.kind === 'finish').length,
    quits: rows.filter((e) => e.kind === 'quit').length,
    top: [...byDeck.entries()]
      .map(([deck, n]) => ({ deck, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5),
    dropping: dropping.slice(0, 5),
    peakHour,
    untouched: deckNames.filter((d) => !touched.has(d)),
  }
}

export function clearUsage(): void {
  writeTable(KEY, [])
}
