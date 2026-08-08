import { readTable, writeTable, readObject, writeObject } from './db'
import { todayISO } from '../core/dateUtils'

/**
 * 家长的观察。
 *
 * 你看到的东西 —— 今天状态不好、这个词他其实会说只是没点对、
 * 他最近迷恋恐龙 —— 现在没有任何入口。而这些恰恰是**最有价值的信号**:
 * 程序看得到「他答错了」,看不到「他是因为困了才答错的」。
 *
 * 两种记录:
 * - 随手一句观察:攒起来,和成长档案里的「事例」一样,几年后回头看很有分量
 * - 兴趣标签:直接影响内容推荐 —— 他迷恋恐龙的那两个月,
 *   就该多给他恐龙相关的词
 */

const NOTE_KEY = 'parentNotes'
const INTEREST_KEY = 'interests'
const MAX_NOTES = 300

export interface ParentNote {
  id: string
  date: string
  text: string
  at: number
}

export function addNote(text: string): boolean {
  const t = String(text ?? '').trim()
  if (!t) return false
  const rows = readTable<ParentNote>(NOTE_KEY)
  /*
    时间戳必须**严格递增**。
    连着记两条很容易落在同一毫秒里,那样「最近记的排最前面」就成了随机的。
    (家长录音那边踩过同一个坑,这里一开始就避开。)
  */
  let maxAt = 0
  for (const r of rows) if (r && r.at > maxAt) maxAt = r.at
  const at = Math.max(Date.now(), maxAt + 1)
  rows.push({ id: `n-${at.toString(36)}-${rows.length}`, date: todayISO(), text: t, at })
  writeTable(NOTE_KEY, rows.slice(-MAX_NOTES))
  return true
}

export function listNotes(): ParentNote[] {
  return readTable<ParentNote>(NOTE_KEY)
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
}

export function removeNote(id: string): void {
  writeTable(
    NOTE_KEY,
    readTable<ParentNote>(NOTE_KEY).filter((n) => n && n.id !== id),
  )
}

/**
 * 当前的兴趣标签(最多几个)。
 *
 * 这个不是装饰 —— 它会被 recommend 用来给相关卡组加权。
 * 「他最近迷恋恐龙」这句话,应该能变成「今天先给他动物那一组」。
 */
export function getInterests(): string[] {
  const v = readObject<string[]>(INTEREST_KEY, [])
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []
}

export function setInterests(list: string[]): void {
  // 去重、去空、最多 5 个 —— 什么都感兴趣等于什么都不优先
  const clean: string[] = []
  for (const x of list) {
    const t = String(x ?? '').trim()
    if (t && !clean.includes(t)) clean.push(t)
    if (clean.length >= 5) break
  }
  writeObject(INTEREST_KEY, clean)
}

export function toggleInterest(tag: string): string[] {
  const t = String(tag ?? '').trim()
  if (!t) return getInterests()
  const cur = getInterests()
  const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
  setInterests(next)
  return getInterests()
}

/** 可选的兴趣标签 —— 和内容包对得上,选了才推得动 */
export const INTEREST_TAGS: Array<{ tag: string; emoji: string; match: string[] }> = [
  { tag: '动物', emoji: '🐶', match: ['动物', '海洋', '昆虫'] },
  { tag: '车与交通', emoji: '🚗', match: ['交通'] },
  { tag: '吃的', emoji: '🍎', match: ['水果', '食物'] },
  { tag: '大自然', emoji: '🌳', match: ['植物', '自然', '天气'] },
  { tag: '运动', emoji: '⚽', match: ['运动', '玩具'] },
  { tag: '故事', emoji: '📖', match: ['故事', '共读', '古诗'] },
  { tag: '数字', emoji: '🔢', match: ['数', '口算'] },
  { tag: '英语', emoji: '🔤', match: ['英语', '字母', '拼读'] },
]
