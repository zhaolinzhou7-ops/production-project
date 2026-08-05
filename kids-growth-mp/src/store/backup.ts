import { allKeys, readAny, writeAny, clearAll, flushNow, __resetCache } from './db'

/**
 * 全量备份与恢复。
 *
 * 为什么这件事排在所有优化的最前面:在这之前,这套系统**没有任何备份**。
 * 云同步没配过,家长中心那个「导出数据」导出的只有五行统计摘要,
 * 恢复不了任何东西,也没有导入。手机丢了、重装了、存储被清了 —— 全没。
 *
 * 而里面有一类东西和别的不一样:学习进度丢了可以重新练回来,
 * **成长档案不能** —— 身高体重曲线、家长记下的事例、健康记录、成绩。
 * 「他 4 岁半那年长多高」丢了就是丢了。
 *
 * 所以这里不照着手写清单备份,而是**枚举存储里的全部 key**。
 * 手写清单一定会漏 —— 这个项目散着二十多个 key,每加一个功能就多一个。
 */

export const BACKUP_MAGIC = 'kids-growth-mp'
export const BACKUP_VERSION = 1

export interface BackupFile {
  app: string
  ver: number
  /** 备份时间(本地可读),给人看的 */
  at: string
  data: Record<string, unknown>
}

/**
 * 这些 key 不进备份。
 *
 * 都是「本机才有意义」的东西:音源健康度标记(换台设备就无效)、
 * 「再练一遍」记的上一批题(纯粹的临时状态)。
 * 备份它们不会出错,但会让备份文件变大、也会把一台设备的网络状况
 * 带到另一台设备上去。
 */
function isVolatile(key: string): boolean {
  return key.startsWith('recent:') || key === 'audioDead' || key === 'lastPlayed'
}

export function buildBackup(now = new Date()): BackupFile {
  flushNow()
  const data: Record<string, unknown> = {}
  for (const k of allKeys()) {
    if (isVolatile(k)) continue
    const v = readAny(k)
    if (v === '' || v === undefined || v === null) continue
    data[k] = v
  }
  return { app: BACKUP_MAGIC, ver: BACKUP_VERSION, at: now.toLocaleString(), data }
}

export function backupToText(now = new Date()): string {
  return JSON.stringify(buildBackup(now))
}

export interface RestoreResult {
  ok: boolean
  msg: string
  /** 恢复了多少个 key */
  count: number
}

/**
 * 解析并校验一份备份。
 *
 * 校验要严 —— 恢复是**破坏性**的(先清空再写入)。如果拿到的是一段
 * 不相干的文本却照做了,用户会在「想找回数据」的那一刻反而把仅有的
 * 一份也弄没。所以只要有一点对不上就拒绝,并且**在校验通过之前
 * 一个字节都不写**。
 */
export function parseBackup(text: string): { ok: boolean; msg: string; file?: BackupFile } {
  const raw = String(text ?? '').trim()
  if (!raw) return { ok: false, msg: '内容是空的' }
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return { ok: false, msg: '这不是一份备份文件(解析不了)' }
  }
  if (!obj || typeof obj !== 'object') return { ok: false, msg: '这不是一份备份文件' }
  const f = obj as Partial<BackupFile>
  if (f.app !== BACKUP_MAGIC) return { ok: false, msg: '这份备份不是本小程序导出的' }
  if (typeof f.ver !== 'number' || f.ver > BACKUP_VERSION) {
    return { ok: false, msg: '这份备份来自更新的版本,请先更新小程序' }
  }
  if (!f.data || typeof f.data !== 'object' || Array.isArray(f.data)) {
    return { ok: false, msg: '备份里没有数据' }
  }
  if (Object.keys(f.data).length === 0) return { ok: false, msg: '备份里没有数据' }
  return { ok: true, msg: '', file: f as BackupFile }
}

/** 恢复。会**先清空本机数据**再写入 —— 调用方必须先让用户确认过 */
export function restoreBackup(text: string): RestoreResult {
  const p = parseBackup(text)
  if (!p.ok || !p.file) return { ok: false, msg: p.msg, count: 0 }
  clearAll()
  let count = 0
  for (const k of Object.keys(p.file.data)) {
    if (isVolatile(k)) continue
    writeAny(k, p.file.data[k])
    count += 1
  }
  flushNow()
  // 缓存里还留着清空前的旧值,不重置的话界面会显示恢复之前的数据
  __resetCache()
  return { ok: true, msg: `已恢复 ${count} 项`, count }
}

/** 备份里大概有多少条记录 —— 给用户一个「这份东西有多重」的感觉 */
export function backupSummary(f: BackupFile): string {
  const n = (k: string) => (Array.isArray(f.data[k]) ? (f.data[k] as unknown[]).length : 0)
  const parts = [
    `卡片 ${n('cards')} 张`,
    `学习记录 ${n('sessions')} 组`,
    `打卡 ${Object.keys((f.data.habitLog as object) ?? {}).length} 天`,
    `身高体重 ${n('growthRecords')} 条`,
    `事例 ${n('anecdotes')} 条`,
    `成绩 ${n('exams')} 次`,
  ]
  return parts.join(' · ')
}
