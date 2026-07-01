import { useState } from 'react'
import { X } from 'lucide-react'
import type { Reward } from '../../types'

export interface RewardFormValues {
  name: string
  icon: string
  costPoints: number
  stock?: number
  active: boolean
}

interface RewardFormModalProps {
  open: boolean
  initial?: Reward
  onClose: () => void
  onSubmit: (values: RewardFormValues) => void
}

export function RewardFormModal({ open, initial, onClose, onSubmit }: RewardFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🎁')
  const [costPoints, setCostPoints] = useState(initial?.costPoints ?? 50)
  const [hasStock, setHasStock] = useState(initial?.stock !== undefined)
  const [stock, setStock] = useState(initial?.stock ?? 1)
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('请输入奖励名称')
      return
    }
    if (costPoints <= 0) {
      setError('所需积分需大于 0')
      return
    }
    onSubmit({
      name: name.trim(),
      icon: icon.trim() || '🎁',
      costPoints,
      stock: hasStock ? stock : undefined,
      active,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑奖励' : '新增奖励'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="text-sm text-gray-500">图标</label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-center text-xl outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm text-gray-500">奖励名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：看30分钟动画片"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">所需积分</label>
            <input
              type="number"
              min={1}
              value={costPoints}
              onChange={(e) => setCostPoints(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-500">限制库存</label>
            <button
              type="button"
              onClick={() => setHasStock((v) => !v)}
              className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
                hasStock ? 'bg-brand-500' : 'bg-gray-200'
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  hasStock ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {hasStock && (
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
              placeholder="剩余库存数量"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          )}

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-500">启用奖励</label>
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className={`flex h-7 w-12 items-center rounded-full p-1 transition ${
                active ? 'bg-brand-500' : 'bg-gray-200'
              }`}
            >
              <div
                className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  active ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95 transition"
        >
          {initial ? '保存' : '添加'}
        </button>
      </form>
    </div>
  )
}
