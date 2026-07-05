import { db } from './db'
import { newId } from '../lib/id'
import { getChildPointStats } from '../lib/points'
import type { Redemption, Reward } from '../types'

export async function requestRedemption(childId: string, reward: Reward): Promise<void> {
  await db.redemptions.add({
    id: newId(),
    childId,
    rewardId: reward.id,
    costPoints: reward.costPoints,
    status: 'pending',
    requestedAt: Date.now(),
  })
}

/** Parent-only: deducts points and marks the redemption approved. Returns false if the balance is now insufficient. */
export async function approveRedemption(redemption: Redemption): Promise<boolean> {
  return db.transaction('rw', db.redemptions, db.pointLedger, db.rewards, async () => {
    const stats = await getChildPointStats(redemption.childId)
    if (stats.balance < redemption.costPoints) return false

    const balanceAfter = stats.balance - redemption.costPoints
    await db.redemptions.update(redemption.id, { status: 'approved', decidedAt: Date.now() })
    await db.pointLedger.add({
      id: newId(),
      childId: redemption.childId,
      delta: -redemption.costPoints,
      reason: 'redeem',
      refType: 'redeem',
      refId: redemption.id,
      balanceAfter,
      timestamp: Date.now(),
    })

    const reward = await db.rewards.get(redemption.rewardId)
    if (reward?.stock !== undefined) {
      await db.rewards.update(reward.id, { stock: Math.max(0, reward.stock - 1) })
    }
    return true
  })
}

export async function rejectRedemption(redemption: Redemption): Promise<void> {
  await db.redemptions.update(redemption.id, { status: 'rejected', decidedAt: Date.now() })
}
