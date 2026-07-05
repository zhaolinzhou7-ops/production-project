import { useState } from 'react'
import { X } from 'lucide-react'
import type { GrowthRecord } from '../../types'
import { todayISO } from '../../lib/dateUtils'

export interface GrowthRecordFormValues {
  date: string
  heightCm?: number
  weightKg?: number
  headCm?: number
  note?: string
}

interface GrowthRecordFormModalProps {
  open: boolean
  initial?: GrowthRecord
  onClose: () => void
  onSubmit: (values: GrowthRecordFormValues) => void
}

export function GrowthRecordFormModal({ open, initial, onClose, onSubmit }: GrowthRecordFormModalProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [heightCm, setHeightCm] = useState(initial?.heightCm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(initial?.weightKg?.toString() ?? '')
  const [headCm, setHeadCm] = useState(initial?.headCm?.toString() ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!heightCm && !weightKg && !headCm) {
      setError('请至少填写身高、体重或头围其中一项')
      return
    }
    onSubmit({
      date,
      heightCm: heightCm ? Number(heightCm) : undefined,
      weightKg: weightKg ? Number(weightKg) : undefined,
      headCm: headCm ? Number(headCm) : undefined,
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
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑记录' : '新增发育记录'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">日期</label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500">身高 (cm)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="例如 105.5"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
            <div>
              <label className="text-sm text-gray-500">体重 (kg)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="例如 17.2"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500">头围 (cm，可选，小龄适用)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={headCm}
              onChange={(e) => setHeadCm(e.target.value)}
              placeholder="例如 46.5"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
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
