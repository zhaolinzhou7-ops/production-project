import { db } from '../db/db'

const BACKUP_VERSION = 3

export interface BackupPayload {
  version: number
  exportedAt: number
  data: {
    children: unknown[]
    tasks: unknown[]
    checkIns: unknown[]
    pointLedger: unknown[]
    achievements: unknown[]
    unlocks: unknown[]
    rewards: unknown[]
    redemptions: unknown[]
    growthRecords: unknown[]
    milestones: unknown[]
    portfolios: unknown[]
    diaryEntries: unknown[]
    settings: unknown[]
    records: unknown[]
    exams: unknown[]
    examScores: unknown[]
    anecdotes: unknown[]
    interests: unknown[]
    decks: unknown[]
    cards: unknown[]
    studyStates: unknown[]
    studySessions: unknown[]
    drillResults: unknown[]
  }
}

const TABLE_NAMES = [
  'children',
  'tasks',
  'checkIns',
  'pointLedger',
  'achievements',
  'unlocks',
  'rewards',
  'redemptions',
  'growthRecords',
  'milestones',
  'portfolios',
  'diaryEntries',
  'settings',
  // v2 新增表;旧版备份缺这些键时 parseBackupFile 会补成空数组,因此 v1 备份仍可导入
  'records',
  'exams',
  'examScores',
  'anecdotes',
  'interests',
  // v3 学习引擎新增表
  'decks',
  'cards',
  'studyStates',
  'studySessions',
  'drillResults',
] as const

/*
  录音(voices 表)**不在备份里**,而且这是有意的。

  备份是一个 JSON 文件,而录音是二进制 Blob —— 塞进 JSON 要转 base64,
  二十句就能让备份文件涨到几十兆,家长根本存不动、也发不出去。

  影响要说清楚:**换设备后录音不跟着走,需要重录**。
  好处是导入备份不会把已有的录音冲掉(importBackup 只清 TABLE_NAMES 里的表),
  所以在同一台设备上恢复数据,录音仍然在。
*/
export async function exportBackup(): Promise<BackupPayload> {
  const data = {} as BackupPayload['data']
  for (const name of TABLE_NAMES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data[name] = await (db as any).table(name).toArray()
  }
  return { version: BACKUP_VERSION, exportedAt: Date.now(), data }
}

export function downloadBackup(payload: BackupPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10)
  a.href = url
  a.download = `小朋友成长系统-备份-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parseBackupFile(text: string): BackupPayload {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || !parsed.data) {
    throw new Error('备份文件格式不正确')
  }
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(parsed.data[name])) {
      parsed.data[name] = []
    }
  }
  return parsed as BackupPayload
}

/** Destructive: wipes all existing data and replaces it with the backup contents. */
export async function importBackup(payload: BackupPayload): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      await table.clear()
      const rows = payload.data[name]
      if (rows.length > 0) {
        await table.bulkAdd(rows)
      }
    }
  })
}
