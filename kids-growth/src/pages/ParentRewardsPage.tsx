import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Pencil, Plus, Sparkles, Trash2, X as XIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { importDefaultRewards } from '../db/seedActions'
import { approveRedemption, rejectRedemption } from '../db/redemption'
import { evaluateAchievements } from '../db/achievements'
import { RewardFormModal, type RewardFormValues } from '../components/rewards/RewardFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useAppStore } from '../store/useAppStore'
import type { Redemption, Reward } from '../types'

export function ParentRewardsPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reward | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Reward | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [insufficientId, setInsufficientId] = useState<string | null>(null)

  const rewards = useLiveQuery(async (): Promise<Reward[]> => {
    if (!currentChildId) return []
    return db.rewards.where('childId').equals(currentChildId).toArray()
  }, [currentChildId])

  const pendingRedemptions = useLiveQuery(async (): Promise<Redemption[]> => {
    if (!currentChildId) return []
    return db.redemptions
      .where('childId')
      .equals(currentChildId)
      .filter((r) => r.status === 'pending')
      .toArray()
  }, [currentChildId])

  const rewardById = new Map((rewards ?? []).map((r) => [r.id, r]))

  if (!currentChildId || !rewards) return null

  const openAdd = () => {
    setEditing(undefined)
    setFormOpen(true)
  }
  const openEdit = (reward: Reward) => {
    setEditing(reward)
    setFormOpen(true)
  }

  const handleSubmit = async (values: RewardFormValues) => {
    if (editing) {
      await db.rewards.update(editing.id, values as Partial<Reward>)
    } else {
      await db.rewards.add({ id: newId(), childId: currentChildId, ...values })
    }
    setFormOpen(false)
  }

  const toggleActive = async (reward: Reward) => {
    await db.rewards.update(reward.id, { active: !reward.active })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await db.rewards.delete(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleImportDefaults = async () => {
    const count = await importDefaultRewards(currentChildId)
    setImportMsg(count > 0 ? `已导入 ${count} 个默认奖励` : '默认奖励已全部存在')
    setTimeout(() => setImportMsg(''), 2500)
  }

  const handleApprove = async (redemption: Redemption) => {
    const ok = await approveRedemption(redemption)
    if (!ok) {
      setInsufficientId(redemption.id)
      setTimeout(() => setInsufficientId(null), 2500)
      return
    }
    await evaluateAchievements(redemption.childId)
  }

  const handleReject = async (redemption: Redemption) => {
    await rejectRedemption(redemption)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">奖励与兑换管理</h1>
      </div>

      {(pendingRedemptions?.length ?? 0) > 0 && (
        <div className="rounded-3xl bg-sun-400/15 p-4 shadow-sm mb-4">
          <h2 className="font-bold text-gray-700 mb-2">待审批兑换申请</h2>
          <div className="space-y-2">
            {pendingRedemptions!.map((r) => {
              const reward = rewardById.get(r.rewardId)
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl bg-white/80 p-3">
                  <div className="text-xl">{reward?.icon ?? '🎁'}</div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{reward?.name ?? '未知奖励'}</div>
                    <div className="text-xs text-gray-400">
                      需要 {r.costPoints} 积分
                      {insufficientId === r.id && <span className="text-red-500 ml-1">· 积分不足，无法批准</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleApprove(r)}
                    aria-label="批准兑换"
                    className="rounded-full bg-brand-500 p-2 text-white active:scale-95 transition"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => handleReject(r)}
                    aria-label="拒绝兑换"
                    className="rounded-full bg-gray-200 p-2 text-gray-500 active:scale-95 transition"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button
        onClick={handleImportDefaults}
        className="mb-4 w-full flex items-center justify-center gap-1.5 rounded-2xl bg-mint-400/20 py-2.5 text-sm font-medium text-mint-500 active:scale-95 transition"
      >
        <Sparkles size={16} />
        {importMsg || '一键导入默认奖励'}
      </button>

      {rewards.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-4">
          还没有奖励，先导入默认奖励或手动添加吧
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {rewards.map((reward) => (
            <div
              key={reward.id}
              className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${
                reward.active ? 'bg-white/70' : 'bg-white/40 opacity-60'
              }`}
            >
              <div className="text-xl">{reward.icon}</div>
              <div className="flex-1">
                <div className="font-medium text-gray-800">{reward.name}</div>
                <div className="text-xs text-gray-400">
                  {reward.costPoints} 积分{reward.stock !== undefined ? ` · 剩余 ${reward.stock}` : ''}
                </div>
              </div>
              <button
                onClick={() => toggleActive(reward)}
                className={`flex h-6 w-10 items-center rounded-full p-0.5 transition ${
                  reward.active ? 'bg-brand-500' : 'bg-gray-200'
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    reward.active ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <button onClick={() => openEdit(reward)} className="p-1.5 text-gray-400">
                <Pencil size={16} />
              </button>
              <button onClick={() => setDeleteTarget(reward)} className="p-1.5 text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openAdd}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
      >
        <Plus size={18} />
        新增奖励
      </button>

      {formOpen && (
        <RewardFormModal
          key={editing?.id ?? 'new'}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除奖励「${deleteTarget?.name}」？`}
        description="已完成的兑换记录不受影响。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
