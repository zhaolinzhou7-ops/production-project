import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { Anecdote, AnecdoteKind } from '../../types'
import { todayISO } from '../../lib/dateUtils'
import { compressImageFile } from '../../lib/image'
import { TRAIT_PRESETS } from '../../lib/traits'

export interface AnecdoteFormValues {
  date: string
  kind: AnecdoteKind
  content: string
  traits: string[]
  parentAction?: string
  photos: string[]
}

interface AnecdoteFormModalProps {
  open: boolean
  initial?: Anecdote
  onClose: () => void
  onSubmit: (values: AnecdoteFormValues) => void
}

export function AnecdoteFormModal({ open, initial, onClose, onSubmit }: AnecdoteFormModalProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [kind, setKind] = useState<AnecdoteKind>(initial?.kind ?? 'shine')
  const [content, setContent] = useState(initial?.content ?? '')
  const [traits, setTraits] = useState<string[]>(initial?.traits ?? [])
  const [parentAction, setParentAction] = useState(initial?.parentAction ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [error, setError] = useState('')

  if (!open) return null

  const toggleTrait = (t: string) =>
    setTraits((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

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
      setError('写下具体发生了什么吧')
      return
    }
    onSubmit({
      date,
      kind,
      content: content.trim(),
      traits,
      parentAction: parentAction.trim() || undefined,
      photos,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑事例' : '记一个成长事例'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('shine')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                kind === 'shine' ? 'bg-sun-400/30 text-sun-500 ring-2 ring-sun-400' : 'bg-gray-50 text-gray-500'
              }`}
            >
              ✨ 闪光时刻
            </button>
            <button
              type="button"
              onClick={() => setKind('growth')}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
                kind === 'growth' ? 'bg-mint-400/20 text-mint-500 ring-2 ring-mint-400' : 'bg-gray-50 text-gray-500'
              }`}
            >
              🌱 成长时刻
            </button>
          </div>

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
            <label className="text-sm text-gray-500">具体发生了什么 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                kind === 'shine'
                  ? '记录具体行为，如「今天主动把碗洗了，还擦了桌子」'
                  : '如「拼图失败发脾气，摔了积木」——记录行为，不贴标签'
              }
              rows={3}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">体现的品格维度</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TRAIT_PRESETS.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggleTrait(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    traits.includes(t) ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">我是如何引导的（沉淀教养方法，可选）</label>
            <textarea
              value={parentAction}
              onChange={(e) => setParentAction(e.target.value)}
              placeholder="如「先共情说妈妈知道你很着急，再一起把最难的两块拼完」"
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 resize-none"
            />
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
