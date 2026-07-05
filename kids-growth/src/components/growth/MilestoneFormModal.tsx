import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { Milestone } from '../../types'
import { todayISO } from '../../lib/dateUtils'
import { compressImageFile } from '../../lib/image'
import { MILESTONE_PRESETS } from '../../db/seedData'

export interface MilestoneFormValues {
  date: string
  type: string
  title: string
  note?: string
  photo?: string
}

interface MilestoneFormModalProps {
  open: boolean
  initial?: Milestone
  /** 分龄预设清单;缺省用全量 MILESTONE_PRESETS */
  presets?: string[]
  onClose: () => void
  onSubmit: (values: MilestoneFormValues) => void
}

const CUSTOM_OPTION = '自定义'

export function MilestoneFormModal({
  open,
  initial,
  presets = MILESTONE_PRESETS,
  onClose,
  onSubmit,
}: MilestoneFormModalProps) {
  const initialIsPreset = initial ? presets.includes(initial.type) : true
  const [type, setType] = useState(initial ? (initialIsPreset ? initial.type : CUSTOM_OPTION) : presets[0])
  const [title, setTitle] = useState(initial?.title ?? presets[0])
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [note, setNote] = useState(initial?.note ?? '')
  const [photo, setPhoto] = useState<string | undefined>(initial?.photo)
  const [error, setError] = useState('')

  if (!open) return null

  const handleTypeChange = (value: string) => {
    setType(value)
    if (value !== CUSTOM_OPTION) setTitle(value)
    else setTitle('')
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImageFile(file, 900, 0.8)
    setPhoto(compressed)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请输入里程碑名称')
      return
    }
    onSubmit({ date, type, title: title.trim(), note: note.trim() || undefined, photo })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑里程碑' : '新增里程碑'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">类型</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 bg-white"
            >
              {presets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={CUSTOM_OPTION}>自定义…</option>
            </select>
          </div>

          {type === CUSTOM_OPTION && (
            <div>
              <label className="text-sm text-gray-500">里程碑名称 *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：第一次滑雪"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          )}

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

          <div>
            <label className="text-sm text-gray-500">记录</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="写下这一刻吧（可选）"
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">照片</label>
            {photo ? (
              <div className="relative">
                <img src={photo} alt="预览" className="w-full h-40 object-cover rounded-xl" />
                <button
                  type="button"
                  onClick={() => setPhoto(undefined)}
                  className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 cursor-pointer">
                <Camera size={20} />
                <span className="text-sm">添加照片</span>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </label>
            )}
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
