import { useState } from 'react'
import { X } from 'lucide-react'
import type { Interest } from '../../types'

const CATEGORIES = ['艺术', '体育', '学科', '科技', '其他']

export interface InterestFormValues {
  name: string
  icon: string
  category?: string
  active: boolean
  startedAt?: string
  note?: string
}

interface InterestFormModalProps {
  open: boolean
  initial?: Interest
  onClose: () => void
  onSubmit: (values: InterestFormValues) => void
}

export function InterestFormModal({ open, initial, onClose, onSubmit }: InterestFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '🎹')
  const [category, setCategory] = useState(initial?.category ?? '艺术')
  const [active, setActive] = useState(initial?.active ?? true)
  const [startedAt, setStartedAt] = useState(initial?.startedAt ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('请输入兴趣名称')
      return
    }
    onSubmit({
      name: name.trim(),
      icon: icon.trim() || '⭐',
      category,
      active,
      startedAt: startedAt || undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑兴趣' : '添加兴趣特长'}</h3>
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
              <label className="text-sm text-gray-500">名称 *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如「钢琴」「篮球」「编程」"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">类别</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    category === c ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">开始时间</label>
            <input
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如老师/机构/上课时间，可选"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-500">进行中</label>
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
