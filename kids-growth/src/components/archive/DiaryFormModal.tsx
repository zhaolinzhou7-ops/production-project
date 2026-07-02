import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { DiaryEntry, Mood } from '../../types'
import { todayISO } from '../../lib/dateUtils'
import { compressImageFile } from '../../lib/image'
import { MOOD_OPTIONS } from '../../lib/moods'

export interface DiaryFormValues {
  date: string
  title?: string
  content: string
  photos: string[]
  mood?: Mood
}

interface DiaryFormModalProps {
  open: boolean
  initial?: DiaryEntry
  onClose: () => void
  onSubmit: (values: DiaryFormValues) => void
}

export function DiaryFormModal({ open, initial, onClose, onSubmit }: DiaryFormModalProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [mood, setMood] = useState<Mood | undefined>(initial?.mood)
  const [error, setError] = useState('')

  if (!open) return null

  const handlePhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const compressed = await Promise.all(files.map((f) => compressImageFile(f, 1000, 0.8)))
    setPhotos((prev) => [...prev, ...compressed])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) {
      setError('写点什么再保存吧')
      return
    }
    onSubmit({
      date,
      title: title.trim() || undefined,
      content: content.trim(),
      photos,
      mood,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑寄语' : '写一段寄语'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-500">日期</label>
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="可选"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="今天想对孩子说……"
              rows={4}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">心情</label>
            <div className="mt-1 flex gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMood(mood === m.value ? undefined : m.value)}
                  className={`flex-1 rounded-xl py-2 text-center transition ${
                    mood === m.value ? 'bg-brand-100 ring-2 ring-brand-400' : 'bg-gray-50'
                  }`}
                >
                  <div className="text-lg">{m.emoji}</div>
                  <div className="text-[10px] text-gray-500">{m.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">照片</label>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={p} alt="" className="h-full w-full rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <label className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-gray-400 cursor-pointer">
                <Camera size={20} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotosChange}
                />
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95 transition"
        >
          {initial ? '保存' : '记录'}
        </button>
      </form>
    </div>
  )
}
