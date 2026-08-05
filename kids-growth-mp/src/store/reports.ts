import { readTable, writeTable } from './db'
import { todayISO } from '../core/dateUtils'

/**
 * 「这道题不对」。
 *
 * 4737 张卡片是我生成的,而自测查的是**结构**(emoji 不重复、数量对得上、
 * 没有会显示成方框的字符),查不了**对不对** —— 英文翻译准不准、
 * emoji 是不是那个意思、识字的顺序合不合理。
 *
 * 对一个孩子唯一的学习工具来说,错的东西会被直接学进去,而且很难纠正。
 * 所以给家长一个随手能按的按钮:看到不对的就标一下,攒起来一起改。
 * 不弹窗、不打断孩子 —— 按一下就过去了。
 */

const KEY = 'cardReports'
const MAX = 200

export interface CardReport {
  id: string
  /** 题面,给我看的时候一眼知道是哪张 */
  front: string
  back: string
  deckName: string
  mode: string
  date: string
  at: number
}

export function reportCard(r: Omit<CardReport, 'date' | 'at'>): void {
  const rows = readTable<CardReport>(KEY)
  // 同一张卡标过就不重复记 —— 家长可能连着按两下
  if (rows.some((x) => x && x.id === r.id)) return
  rows.push({ ...r, date: todayISO(), at: Date.now() })
  writeTable(KEY, rows.slice(-MAX))
}

export function listReports(): CardReport[] {
  return readTable<CardReport>(KEY)
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
}

export function reportCount(): number {
  return listReports().length
}

export function clearReports(): void {
  writeTable(KEY, [])
}

/** 导成一段文本,家长复制发给我,我批量改 */
export function reportsToText(): string {
  const rows = listReports()
  if (rows.length === 0) return '还没有标记过。'
  return [
    `内容报错 ${rows.length} 条`,
    ...rows.map((r, i) => `${i + 1}. [${r.deckName}/${r.mode}] ${r.front} → ${r.back}(${r.date})`),
  ].join('\n')
}
