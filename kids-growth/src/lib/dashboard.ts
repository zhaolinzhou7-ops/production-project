import { db } from '../db/db'
import { addDays, todayISO } from './dateUtils'
import { isTaskScheduledOn } from './taskDue'
import { computeStreak } from './streak'
import { computeLevelInfo, type LevelInfo } from './points'
import type { GrowthRecord } from '../types'

export interface DashboardStats {
  balance: number
  xp: number
  levelInfo: LevelInfo
  streak: number
  /** completed / scheduled over the last 7 days (0..1), null if nothing scheduled */
  weekCompletionRate: number | null
  weekCompleted: number
  weekScheduled: number
  latestGrowth: GrowthRecord | null
  heightHistory: { date: string; value: number }[]
  weightHistory: { date: string; value: number }[]
  taskCount: number
  rewardCount: number
  pendingRedemptions: number
}

export async function buildDashboardStats(childId: string): Promise<DashboardStats | null> {
  const settings = await db.settings.get('singleton')
  if (!settings) return null

  const [tasks, doneCheckIns, ledger, growthRecords, rewardCount, pendingRedemptions] =
    await Promise.all([
      db.tasks.where('childId').equals(childId).toArray(),
      db.checkIns.where('childId').equals(childId).filter((c) => c.status === 'done').toArray(),
      db.pointLedger.where('childId').equals(childId).toArray(),
      db.growthRecords.where('childId').equals(childId).toArray(),
      db.rewards.where('childId').equals(childId).count(),
      db.redemptions
        .where('childId')
        .equals(childId)
        .filter((r) => r.status === 'pending')
        .count(),
    ])

  const balance = ledger.reduce((sum, e) => sum + e.delta, 0)
  const xp = ledger.reduce((sum, e) => (e.delta > 0 ? sum + e.delta : sum), 0)
  const levelInfo = computeLevelInfo(xp, settings.levelLadder)

  const today = todayISO()
  const doneDates = new Set(doneCheckIns.map((c) => c.date))
  const streak = computeStreak(doneDates, today)

  const activeRepeating = tasks.filter((t) => t.active && t.type !== 'once')
  const doneByDate = new Map<string, Set<string>>()
  for (const c of doneCheckIns) {
    if (!doneByDate.has(c.date)) doneByDate.set(c.date, new Set())
    doneByDate.get(c.date)!.add(c.taskId)
  }
  let weekScheduled = 0
  let weekCompleted = 0
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, -i)
    const scheduled = activeRepeating.filter((t) => isTaskScheduledOn(t, date))
    weekScheduled += scheduled.length
    const doneSet = doneByDate.get(date)
    if (doneSet) {
      weekCompleted += scheduled.filter((t) => doneSet.has(t.id)).length
    }
  }

  const sortedGrowth = [...growthRecords].sort((a, b) => a.date.localeCompare(b.date))
  const heightHistory = sortedGrowth
    .filter((r) => r.heightCm)
    .map((r) => ({ date: r.date, value: r.heightCm! }))
  const weightHistory = sortedGrowth
    .filter((r) => r.weightKg)
    .map((r) => ({ date: r.date, value: r.weightKg! }))

  return {
    balance,
    xp,
    levelInfo,
    streak,
    weekCompletionRate: weekScheduled > 0 ? weekCompleted / weekScheduled : null,
    weekCompleted,
    weekScheduled,
    latestGrowth: sortedGrowth.length > 0 ? sortedGrowth[sortedGrowth.length - 1] : null,
    heightHistory,
    weightHistory,
    taskCount: tasks.length,
    rewardCount,
    pendingRedemptions,
  }
}
