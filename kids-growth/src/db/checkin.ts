import { db } from './db'
import { newId } from '../lib/id'
import { getChildPointStats } from '../lib/points'
import type { Task } from '../types'

/** Kid-facing: marks a task done for the given date. No-op if already done. */
export async function checkInTask(task: Task, dateISO: string): Promise<{ balance: number; xp: number } | null> {
  return db.transaction('rw', db.checkIns, db.pointLedger, async () => {
    const existing = await db.checkIns
      .where('[taskId+date]')
      .equals([task.id, dateISO])
      .first()

    if (existing?.status === 'done') return null

    const stats = await getChildPointStats(task.childId)
    const balanceAfter = stats.balance + task.points

    if (existing) {
      await db.checkIns.update(existing.id, { status: 'done', pointsAwarded: task.points })
    } else {
      await db.checkIns.add({
        id: newId(),
        taskId: task.id,
        childId: task.childId,
        date: dateISO,
        status: 'done',
        pointsAwarded: task.points,
        createdAt: Date.now(),
      })
    }

    await db.pointLedger.add({
      id: newId(),
      childId: task.childId,
      delta: task.points,
      reason: 'checkin',
      refType: 'checkin',
      refId: existing?.id,
      balanceAfter,
      timestamp: Date.now(),
    })

    return { balance: balanceAfter, xp: stats.xp + task.points }
  })
}

/** Parent-facing: reverses a done check-in for the given date, keeping an audit trail. */
export async function undoCheckIn(task: Task, dateISO: string): Promise<void> {
  await db.transaction('rw', db.checkIns, db.pointLedger, async () => {
    const existing = await db.checkIns
      .where('[taskId+date]')
      .equals([task.id, dateISO])
      .first()
    if (!existing || existing.status !== 'done') return

    const stats = await getChildPointStats(task.childId)
    const balanceAfter = stats.balance - existing.pointsAwarded

    await db.checkIns.update(existing.id, { status: 'undo', pointsAwarded: 0 })
    await db.pointLedger.add({
      id: newId(),
      childId: task.childId,
      delta: -existing.pointsAwarded,
      reason: 'manual',
      refType: 'checkin',
      refId: existing.id,
      balanceAfter,
      timestamp: Date.now(),
    })
  })
}
