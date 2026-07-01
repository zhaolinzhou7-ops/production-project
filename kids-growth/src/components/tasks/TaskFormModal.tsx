import { useState } from 'react'
import { X } from 'lucide-react'
import type { Task, TaskCategory, TaskType } from '../../types'

const CATEGORIES: TaskCategory[] = ['生活', '学习', '运动', '品德', '家务', '其他']
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export interface TaskFormValues {
  title: string
  icon: string
  category: TaskCategory
  type: TaskType
  weeklyDays?: number[]
  points: number
  active: boolean
}

interface TaskFormModalProps {
  open: boolean
  initial?: Task
  onClose: () => void
  onSubmit: (values: TaskFormValues) => void
}

export function TaskFormModal({ open, initial, onClose, onSubmit }: TaskFormModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '⭐')
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? '生活')
  const [type, setType] = useState<TaskType>(initial?.type ?? 'daily')
  const [weeklyDays, setWeeklyDays] = useState<number[]>(initial?.weeklyDays ?? [1, 2, 3, 4, 5])
  const [points, setPoints] = useState(initial?.points ?? 10)
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState('')

  if (!open) return null

  const toggleDay = (day: number) => {
    setWeeklyDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请输入任务名称')
      return
    }
    if (points <= 0) {
      setError('积分需大于 0')
      return
    }
    if (type === 'weekly' && weeklyDays.length === 0) {
      setError('请至少选择一个星期几')
      return
    }
    onSubmit({
      title: title.trim(),
      icon: icon.trim() || '⭐',
      category,
      type,
      weeklyDays: type === 'weekly' ? weeklyDays : undefined,
      points,
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
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑任务' : '新增任务'}</h3>
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
              <label className="text-sm text-gray-500">任务名称 *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：阅读20分钟"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">分类</label>
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
            <label className="text-sm text-gray-500">频率</label>
            <div className="mt-1 flex gap-2">
              {(
                [
                  { v: 'daily', label: '每日' },
                  { v: 'weekly', label: '每周指定日' },
                  { v: 'once', label: '一次性' },
                ] as const
              ).map((opt) => (
                <button
                  type="button"
                  key={opt.v}
                  onClick={() => setType(opt.v)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
                    type === opt.v ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {type === 'weekly' && (
            <div className="flex gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => (
                <button
                  type="button"
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`h-9 w-9 rounded-full text-sm font-medium transition ${
                    weeklyDays.includes(day) ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="text-sm text-gray-500">积分</label>
            <input
              type="number"
              min={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-500">启用任务</label>
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
