import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { Portfolio, PortfolioType } from '../../types'
import { todayISO } from '../../lib/dateUtils'
import { compressImageFile } from '../../lib/image'

const PORTFOLIO_TYPES: PortfolioType[] = ['画作', '手工', '作业', '证书', '奖状', '照片', '其他']

export interface PortfolioFormValues {
  date: string
  type: PortfolioType
  title: string
  desc?: string
  photos: string[]
  tags: string[]
}

interface PortfolioFormModalProps {
  open: boolean
  initial?: Portfolio
  onClose: () => void
  onSubmit: (values: PortfolioFormValues) => void
}

export function PortfolioFormModal({ open, initial, onClose, onSubmit }: PortfolioFormModalProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [type, setType] = useState<PortfolioType>(initial?.type ?? '画作')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [tagsText, setTagsText] = useState(initial?.tags.join(' ') ?? '')
  const [error, setError] = useState('')

  if (!open) return null

  const handlePhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const compressed = await Promise.all(files.map((f) => compressImageFile(f, 1000, 0.8)))
    setPhotos((prev) => [...prev, ...compressed])
  }

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('请输入作品标题')
      return
    }
    const tags = tagsText
      .split(/[\s,，、]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    onSubmit({ date, type, title: title.trim(), desc: desc.trim() || undefined, photos, tags })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑作品' : '作品入档'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">类型</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PORTFOLIO_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    type === t ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">标题 *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：我的小恐龙"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
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
            <label className="text-sm text-gray-500">描述</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="作品背后的小故事（可选）"
              rows={2}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 resize-none"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500">标签</label>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="用空格分隔，例如：恐龙 水彩"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">照片（可多张）</label>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={p} alt="" className="h-full w-full rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
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
          {initial ? '保存' : '入档'}
        </button>
      </form>
    </div>
  )
}
