import { readObject, writeObject } from './db'
import { todayISO } from '../core/dateUtils'
import type { DialogLevel } from '../core/talkContent'

/**
 * 口语练习的偏好与记录。
 *
 * 两件事:
 * 1. **难度是手动可选的**。只按年龄自动分档不够 —— 同一个孩子可能听力超前、
 *    口语落后,或者今天状态好想挑战一下。选了就记住,下次进来还是这一档。
 * 2. **练过的对话要留痕**。孩子记不住自己练过哪些,列表上没有任何标记时,
 *    他只会一直点第一个。标上「练过 ⭐⭐⭐」之后,才有「把这一档打通」的动力。
 */
const LEVEL_KEY = 'talkLevel'
const RECORD_KEY = 'talkRecords'

/** 'auto' = 跟着学段走(默认);其余是家长/孩子手动选定的档 */
export type LevelChoice = 'auto' | DialogLevel

export function getLevelChoice(): LevelChoice {
  const v = readObject<LevelChoice>(LEVEL_KEY, 'auto')
  return v === 'easy' || v === 'medium' || v === 'hard' ? v : 'auto'
}

export function setLevelChoice(v: LevelChoice): void {
  writeObject(LEVEL_KEY, v)
}

export interface TalkRecord {
  /** 练过几遍 */
  times: number
  /** 这段对话里拿到过的最好星级(0–3) */
  bestStars: number
  /** 最近练的日期 */
  lastDate: string
}

type RecordMap = Record<string, TalkRecord>

function allRecords(): RecordMap {
  const m = readObject<RecordMap>(RECORD_KEY, {})
  return m && typeof m === 'object' ? m : {}
}

export function getRecord(key: string): TalkRecord | undefined {
  return allRecords()[key]
}

/** 一段对话/动画练完时调用 */
export function noteFinished(key: string, bestStars: number): void {
  const m = allRecords()
  const cur = m[key]
  m[key] = {
    times: (cur ? cur.times : 0) + 1,
    // 最好成绩只升不降 —— 状态差的一次不该抹掉之前的最好表现
    bestStars: Math.max(cur ? cur.bestStars : 0, Math.max(0, Math.min(3, bestStars))),
    lastDate: todayISO(),
  }
  writeObject(RECORD_KEY, m)
}

export interface LevelProgress {
  practiced: number
  total: number
}

/** 某一档练过几个 —— 难度选择器上显示「12/24」 */
export function levelProgress(keys: string[]): LevelProgress {
  const m = allRecords()
  let practiced = 0
  for (const k of keys) if (m[k] && m[k].times > 0) practiced++
  return { practiced, total: keys.length }
}

/** 清掉指向已删内容的记录(内容包改名/删场景后会留下孤儿键) */
export function sanitizeTalk(validKeys: string[]): void {
  const valid = new Set(validKeys)
  const m = allRecords()
  let changed = false
  for (const k of Object.keys(m)) {
    if (!valid.has(k)) {
      delete m[k]
      changed = true
    }
  }
  if (changed) writeObject(RECORD_KEY, m)
}
