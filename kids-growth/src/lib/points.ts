import { db } from '../db/db'
import type { LevelStep } from '../types'

export interface LevelInfo {
  level: LevelStep
  next: LevelStep | null
  progress: number // 0..1 toward next level, 1 if max level
}

export function computeLevelInfo(xp: number, ladder: LevelStep[]): LevelInfo {
  const sorted = [...ladder].sort((a, b) => a.requiredXP - b.requiredXP)
  let current = sorted[0]
  let next: LevelStep | null = null
  for (let i = 0; i < sorted.length; i++) {
    if (xp >= sorted[i].requiredXP) {
      current = sorted[i]
      next = sorted[i + 1] ?? null
    }
  }
  const progress = next
    ? (xp - current.requiredXP) / (next.requiredXP - current.requiredXP)
    : 1
  return { level: current, next, progress: Math.min(1, Math.max(0, progress)) }
}

export interface ChildPointStats {
  balance: number
  xp: number
}

export async function getChildPointStats(childId: string): Promise<ChildPointStats> {
  const entries = await db.pointLedger.where('childId').equals(childId).toArray()
  let balance = 0
  let xp = 0
  for (const entry of entries) {
    balance += entry.delta
    if (entry.delta > 0) xp += entry.delta
  }
  return { balance, xp }
}
