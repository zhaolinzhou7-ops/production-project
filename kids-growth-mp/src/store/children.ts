import { readTable, writeTable, readObject, writeObject, KEYS } from './db'
import { newId } from '../core/id'

/**
 * 多个孩子。
 *
 * 原先是单孩子假设:一个 childId 走天下。二胎、表兄弟来玩、
 * 或者去爷爷奶奶家用另一台手机,数据就串在一起了 ——
 * 弟弟做的题算进哥哥的掌握量,那两边的记录就都没用了。
 *
 * 好消息是:学习数据从一开始就是按 childId 分的(decks/cards/states/
 * sessions/drills 都带 childId),所以这里只要管**档案与切换**,
 * 不需要动数据层。
 *
 * ⚠️ 有一批数据是**全局**的,不按孩子分:积分、宠物、贴纸、习惯、奖励。
 * 那些是当初按「一个孩子」设计的。这里如实说明,并且在切换时提示家长 ——
 * 假装它们也分开了,比不做更糟。
 */

const LIST_KEY = 'childList'

export interface ChildProfileLite {
  id: string
  name: string
  emoji: string
  createdAt: number
}

const DEFAULT_EMOJI = ['🧒', '👦', '👧', '🧑', '👶']

export function listChildren(): ChildProfileLite[] {
  const rows = readTable<ChildProfileLite>(LIST_KEY).filter((c) => c && c.id)
  if (rows.length > 0) return rows
  // 还没有档案:把当前正在用的那个 id 补成第一个孩子,老数据一条不丢
  const cur = readObject<string>(KEYS.childId, '')
  if (!cur) return []
  const first: ChildProfileLite = {
    id: cur,
    name: '宝贝',
    emoji: DEFAULT_EMOJI[0],
    createdAt: Date.now(),
  }
  writeTable(LIST_KEY, [first])
  return [first]
}

export function addChild(name: string): ChildProfileLite | undefined {
  const n = String(name ?? '').trim()
  if (!n) return undefined
  const rows = listChildren()
  const child: ChildProfileLite = {
    id: newId(),
    name: n,
    emoji: DEFAULT_EMOJI[rows.length % DEFAULT_EMOJI.length],
    createdAt: Date.now(),
  }
  writeTable(LIST_KEY, [...rows, child])
  return child
}

export function renameChild(id: string, name: string): void {
  const n = String(name ?? '').trim()
  if (!n) return
  writeTable(
    LIST_KEY,
    listChildren().map((c) => (c.id === id ? { ...c, name: n } : c)),
  )
}

/**
 * 切换到某个孩子。
 * 只改「当前是谁」这一个值 —— 各人的卡组、进度本来就是按 id 分开存的。
 */
export function switchChild(id: string): boolean {
  if (!listChildren().some((c) => c.id === id)) return false
  writeObject(KEYS.childId, id)
  return true
}

export function currentChild(): ChildProfileLite | undefined {
  const cur = readObject<string>(KEYS.childId, '')
  return listChildren().find((c) => c.id === cur)
}

/**
 * 删除一个孩子的档案。
 *
 * **不删他的学习数据** —— 只是从列表里拿掉。误删一个孩子几年的记录
 * 是不可接受的;真想彻底清掉,走「清空本地数据」那条明确的路。
 * 不允许删掉最后一个,否则程序会进到「一个孩子都没有」的状态。
 */
export function removeChild(id: string): boolean {
  const rows = listChildren()
  if (rows.length <= 1) return false
  const next = rows.filter((c) => c.id !== id)
  writeTable(LIST_KEY, next)
  if (readObject<string>(KEYS.childId, '') === id) writeObject(KEYS.childId, next[0].id)
  return true
}

/** 这些数据目前还是全局的,切换孩子时**不会**跟着换 —— 界面上要如实说 */
export const SHARED_WARNING =
  '积分、宠物、贴纸、习惯打卡和奖励目前是全家共用的,切换孩子不会分开。学习内容和复习进度是各人各自的。'
