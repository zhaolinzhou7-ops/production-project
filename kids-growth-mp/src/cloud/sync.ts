import Taro from '@tarojs/taro'
import { KEYS, readTable, writeTable, readObject, writeObject } from '../store/db'
import { RECORD_KEYS } from '../store/records'
import { CLOUD_ENV, SNAPSHOT_COLLECTION } from './config'

// 微信云开发「云同步」:把学习数据打成一个快照文档,按 openid 归属(云端默认「仅创建者可读写」)。
// 冲突策略:比较 updatedAt 时间戳,后写覆盖(last-write-wins)。
// 隐私:只同步学习进度快照(卡组/状态/会话/积分/时长),不含任何录音。

const DOC_ID_KEY = '_cloudDocId'
const LOCAL_UPDATED_KEY = '_localUpdatedAt'

// Taro 的 cloud 类型不完整,这里做最小封装。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cloud(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Taro as unknown as { cloud: any }).cloud
}

let inited = false
export function isCloudConfigured(): boolean {
  return !!CLOUD_ENV
}

export function initCloud(): boolean {
  if (!CLOUD_ENV) return false
  if (inited) return true
  try {
    cloud().init({ env: CLOUD_ENV, traceUser: true })
    inited = true
    return true
  } catch {
    return false
  }
}

interface Snapshot {
  updatedAt: number
  childId: string
  points: unknown
  studyTime: unknown
  decks: unknown[]
  cards: unknown[]
  states: unknown[]
  sessions: unknown[]
  drills: unknown[]
  /** 成长档案:身高体重/通用记录/成绩/事例。学习进度丢了还能重学,这些丢了就真没了 */
  profile?: unknown
  growthRecords?: unknown[]
  logRecords?: unknown[]
  exams?: unknown[]
  examScores?: unknown[]
  anecdotes?: unknown[]
}

function buildSnapshot(): Snapshot {
  return {
    updatedAt: Date.now(),
    childId: readObject<string>(KEYS.childId, ''),
    points: readObject(KEYS.points, { balance: 0, xp: 0 }),
    studyTime: readObject('studyTime', null),
    decks: readTable(KEYS.decks),
    cards: readTable(KEYS.cards),
    states: readTable(KEYS.states),
    sessions: readTable(KEYS.sessions),
    drills: readTable(KEYS.drills),
    profile: readObject(RECORD_KEYS.profile, null),
    growthRecords: readTable(RECORD_KEYS.growth),
    logRecords: readTable(RECORD_KEYS.records),
    exams: readTable(RECORD_KEYS.exams),
    examScores: readTable(RECORD_KEYS.scores),
    anecdotes: readTable(RECORD_KEYS.anecdotes),
  }
}

function applySnapshot(s: Snapshot): void {
  writeObject(KEYS.childId, s.childId || '')
  writeObject(KEYS.points, s.points || { balance: 0, xp: 0 })
  if (s.studyTime) writeObject('studyTime', s.studyTime)
  writeTable(KEYS.decks, s.decks || [])
  writeTable(KEYS.cards, s.cards || [])
  writeTable(KEYS.states, s.states || [])
  writeTable(KEYS.sessions, s.sessions || [])
  writeTable(KEYS.drills, s.drills || [])
  // 档案是旧快照里没有的字段,拉到老快照时不要把本地已有的档案清空
  if (s.profile) writeObject(RECORD_KEYS.profile, s.profile)
  if (s.growthRecords) writeTable(RECORD_KEYS.growth, s.growthRecords)
  if (s.logRecords) writeTable(RECORD_KEYS.records, s.logRecords)
  if (s.exams) writeTable(RECORD_KEYS.exams, s.exams)
  if (s.examScores) writeTable(RECORD_KEYS.scores, s.examScores)
  if (s.anecdotes) writeTable(RECORD_KEYS.anecdotes, s.anecdotes)
}

export type SyncResult = 'ok' | 'nocloud' | 'empty' | 'skip' | 'error'

/** 上传本地快照到云端(新建或更新自己的文档) */
export async function pushToCloud(): Promise<SyncResult> {
  if (!initCloud()) return 'nocloud'
  try {
    const db = cloud().database()
    const snap = buildSnapshot()
    const docId = readObject<string>(DOC_ID_KEY, '')
    if (docId) {
      await db.collection(SNAPSHOT_COLLECTION).doc(docId).update({ data: snap })
    } else {
      const res = await db.collection(SNAPSHOT_COLLECTION).limit(1).get()
      if (res.data && res.data[0]) {
        await db.collection(SNAPSHOT_COLLECTION).doc(res.data[0]._id).update({ data: snap })
        writeObject(DOC_ID_KEY, res.data[0]._id)
      } else {
        const add = await db.collection(SNAPSHOT_COLLECTION).add({ data: snap })
        writeObject(DOC_ID_KEY, add._id)
      }
    }
    writeObject(LOCAL_UPDATED_KEY, snap.updatedAt)
    return 'ok'
  } catch {
    return 'error'
  }
}

/** 从云端拉取快照;仅当云端比本地更新时才覆盖本地 */
export async function pullFromCloud(): Promise<SyncResult> {
  if (!initCloud()) return 'nocloud'
  try {
    const db = cloud().database()
    const res = await db.collection(SNAPSHOT_COLLECTION).limit(1).get()
    const doc = res.data && res.data[0]
    if (!doc) return 'empty'
    const localUpdated = readObject<number>(LOCAL_UPDATED_KEY, 0)
    if (doc.updatedAt && doc.updatedAt <= localUpdated) return 'skip'
    applySnapshot(doc as Snapshot)
    writeObject(LOCAL_UPDATED_KEY, doc.updatedAt || Date.now())
    writeObject(DOC_ID_KEY, doc._id)
    return 'ok'
  } catch {
    return 'error'
  }
}
