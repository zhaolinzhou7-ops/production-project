import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Coins } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { requestRedemption } from '../db/redemption'
import { getChildPointStats } from '../lib/points'
import { useAppStore } from '../store/useAppStore'
import type { Redemption, Reward } from '../types'

const STATUS_LABEL: Record<Redemption['status'], string> = {
  pending: '审批中',
  approved: '已通过',
  rejected: '已拒绝',
  fulfilled: '已完成',
}

export function KidRewardsPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)

  const rewards = useLiveQuery(async (): Promise<Reward[]> => {
    if (!currentChildId) return []
    return db.rewards
      .where('childId')
      .equals(currentChildId)
      .filter((r) => r.active)
      .sortBy('costPoints')
  }, [currentChildId])

  const redemptions = useLiveQuery(async (): Promise<Redemption[]> => {
    if (!currentChildId) return []
    return db.redemptions.where('childId').equals(currentChildId).reverse().sortBy('requestedAt')
  }, [currentChildId])

  const stats = useLiveQuery(
    () => (currentChildId ? getChildPointStats(currentChildId) : Promise.resolve({ balance: 0, xp: 0 })),
    [currentChildId],
  )

  if (!currentChildId || !rewards || !redemptions || !stats) return null

  const pendingRewardIds = new Set(
    redemptions.filter((r) => r.status === 'pending').map((r) => r.rewardId),
  )

  const handleRequest = async (reward: Reward) => {
    await requestRedemption(currentChildId, reward)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">奖励商城</h1>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-sun-400/20 px-3 py-1.5 text-sun-500 font-bold text-sm">
          <Coins size={16} />
          {stats.balance}
        </div>
      </div>

      {rewards.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          <div className="text-4xl mb-2">🎁</div>
          还没有奖励，去家长模式添加一些吧
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {rewards.map((reward) => {
            const outOfStock = reward.stock !== undefined && reward.stock <= 0
            const isPending = pendingRewardIds.has(reward.id)
            const canAfford = stats.balance >= reward.costPoints
            const disabled = outOfStock || isPending || !canAfford

            return (
              <div key={reward.id} className="rounded-3xl bg-white/70 p-4 shadow-sm text-center">
                <div className="text-3xl mb-1">{reward.icon}</div>
                <div className="text-sm font-medium text-gray-800 mb-1">{reward.name}</div>
                <div className="text-xs text-gray-400 mb-3">
                  {reward.costPoints} 积分
                  {reward.stock !== undefined && <span> · 剩 {reward.stock}</span>}
                </div>
                <button
                  disabled={disabled}
                  onClick={() => handleRequest(reward)}
                  className={`w-full rounded-xl py-2 text-sm font-bold transition active:scale-95 ${
                    disabled ? 'bg-gray-100 text-gray-400' : 'bg-brand-500 text-white'
                  }`}
                >
                  {outOfStock ? '已兑完' : isPending ? '审批中' : canAfford ? '申请兑换' : '积分不足'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {redemptions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-gray-500">我的兑换记录</h2>
          <div className="space-y-2">
            {redemptions.map((r) => {
              const reward = rewards.find((rw) => rw.id === r.rewardId)
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl bg-white/50 p-2.5 text-sm"
                >
                  <div className="text-lg">{reward?.icon ?? '🎁'}</div>
                  <div className="flex-1 text-gray-600">{reward?.name ?? '奖励已删除'}</div>
                  <span
                    className={`text-xs font-medium ${
                      r.status === 'approved' || r.status === 'fulfilled'
                        ? 'text-brand-500'
                        : r.status === 'rejected'
                          ? 'text-gray-400'
                          : 'text-sun-500'
                    }`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
