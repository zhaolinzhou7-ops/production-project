import { db } from './db'
import { newId } from '../lib/id'
import { computeLevelInfo } from '../lib/points'
import { computeStreak } from '../lib/streak'
import { todayISO, addDays } from '../lib/dateUtils'
import { isTaskScheduledOn } from '../lib/taskDue'
import type { Achievement } from '../types'

/** Checks all not-yet-unlocked achievement rules for a child and records any newly satisfied ones. */
export async function evaluateAchievements(childId: string): Promise<Achievement[]> {
  const [achievements, unlocks, doneCheckIns, tasks, ledger, settings, growthCount, portfolioCount, approvedRedemptions, examCount, anecdoteCount] =
    await Promise.all([
      db.achievements.toArray(),
      db.unlocks.where('childId').equals(childId).toArray(),
      db.checkIns.where('childId').equals(childId).filter((c) => c.status === 'done').toArray(),
      db.tasks.where('childId').equals(childId).toArray(),
      db.pointLedger.where('childId').equals(childId).toArray(),
      db.settings.get('singleton'),
      db.growthRecords.where('childId').equals(childId).count(),
      db.portfolios.where('childId').equals(childId).count(),
      db.redemptions
        .where('childId')
        .equals(childId)
        .filter((r) => r.status === 'approved' || r.status === 'fulfilled')
        .count(),
      db.exams.where('childId').equals(childId).count(),
      db.anecdotes.where('childId').equals(childId).count(),
    ])
  if (!settings) return []

  const unlockedCodes = new Set(unlocks.map((u) => u.achievementCode))
  const taskCategoryById = new Map(tasks.map((t) => [t.id, t.category]))
  const doneDates = new Set(doneCheckIns.map((c) => c.date))
  const xp = ledger.reduce((sum, e) => (e.delta > 0 ? sum + e.delta : sum), 0)
  const level = computeLevelInfo(xp, settings.levelLadder).level.level
  const streak = computeStreak(doneDates, todayISO())
  const totalCheckins = doneCheckIns.length

  const categoryCounts = new Map<string, number>()
  for (const c of doneCheckIns) {
    const cat = taskCategoryById.get(c.taskId)
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1)
  }

  const today = todayISO()
  let weekFull = true
  for (let i = 0; i < 7; i++) {
    if (!doneDates.has(addDays(today, -i))) {
      weekFull = false
      break
    }
  }

  const activeTasks = tasks.filter((t) => t.active)
  const doneTaskIdsByDate = new Map<string, Set<string>>()
  for (const c of doneCheckIns) {
    if (!doneTaskIdsByDate.has(c.date)) doneTaskIdsByDate.set(c.date, new Set())
    doneTaskIdsByDate.get(c.date)!.add(c.taskId)
  }
  let perfectDay = false
  for (const [date, taskIds] of doneTaskIdsByDate) {
    const scheduled = activeTasks.filter((t) => isTaskScheduledOn(t, date))
    if (scheduled.length > 0 && scheduled.every((t) => taskIds.has(t.id))) {
      perfectDay = true
      break
    }
  }

  const newlyUnlocked: Achievement[] = []
  for (const a of achievements) {
    if (unlockedCodes.has(a.code)) continue
    let satisfied = false
    switch (a.rule.type) {
      case 'firstCheckin':
        satisfied = totalCheckins > 0
        break
      case 'streak':
        satisfied = streak >= (a.rule.days ?? Infinity)
        break
      case 'perfectDay':
        satisfied = perfectDay
        break
      case 'weekFull':
        satisfied = weekFull
        break
      case 'totalCheckins':
        satisfied = totalCheckins >= (a.rule.count ?? Infinity)
        break
      case 'categoryCheckins':
        satisfied = (categoryCounts.get(a.rule.category ?? '') ?? 0) >= (a.rule.count ?? Infinity)
        break
      case 'firstRedeem':
        satisfied = approvedRedemptions > 0
        break
      case 'firstGrowth':
        satisfied = growthCount > 0
        break
      case 'firstPortfolio':
        satisfied = portfolioCount > 0
        break
      case 'firstExam':
        satisfied = examCount > 0
        break
      case 'firstAnecdote':
        satisfied = anecdoteCount > 0
        break
      case 'level':
        satisfied = level >= (a.rule.level ?? Infinity)
        break
    }
    if (satisfied) newlyUnlocked.push(a)
  }

  if (newlyUnlocked.length > 0) {
    await db.unlocks.bulkAdd(
      newlyUnlocked.map((a) => ({
        id: newId(),
        childId,
        achievementCode: a.code,
        unlockedAt: Date.now(),
      })),
    )
  }

  return newlyUnlocked
}
