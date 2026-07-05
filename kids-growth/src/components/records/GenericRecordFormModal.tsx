import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { LogRecord, RecordFieldValue } from '../../types'
import type { RecordFieldDef, RecordModuleDef } from '../../lib/recordModules'
import { todayISO } from '../../lib/dateUtils'
import { compressImageFile } from '../../lib/image'

export interface GenericRecordFormValues {
  date: string
  fields: Record<string, RecordFieldValue>
  note?: string
  photos: string[]
}

interface GenericRecordFormModalProps {
  open: boolean
  moduleDef: RecordModuleDef
  initial?: LogRecord
  onClose: () => void
  onSubmit: (values: GenericRecordFormValues) => void
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: RecordFieldDef
  value: string
  onChange: (v: string) => void
}) {
  if (def.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400 bg-white"
      >
        <option value="">请选择</option>
        {(def.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  if (def.type === 'rating') {
    const max = def.max ?? 5
    const current = Number(value) || 0
    return (
      <div className="mt-1 flex gap-1.5">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => onChange(String(n === current ? 0 : n))}
            className={`h-9 w-9 rounded-xl text-sm font-bold transition ${
              n <= current ? 'bg-sun-400 text-white' : 'bg-gray-100 text-gray-400'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    )
  }
  return (
    <input
      type={def.type === 'number' ? 'number' : 'text'}
      step={def.step}
      min={def.min}
      max={def.max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.placeholder}
      className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
    />
  )
}

export function GenericRecordFormModal({
  open,
  moduleDef,
  initial,
  onClose,
  onSubmit,
}: GenericRecordFormModalProps) {
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const f of moduleDef.fields) {
      const v = initial?.fields[f.key]
      out[f.key] = v === undefined ? '' : String(v)
    }
    return out
  })
  const [note, setNote] = useState(initial?.note ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? [])
  const [error, setError] = useState('')

  if (!open) return null

  const setField = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const handlePhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const compressed = await Promise.all(files.map((f) => compressImageFile(f, 1000, 0.8)))
    setPhotos((prev) => [...prev, ...compressed])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const fields: Record<string, RecordFieldValue> = {}
    let filledCount = 0
    for (const def of moduleDef.fields) {
      const raw = values[def.key]?.trim() ?? ''
      if (raw === '' || (def.type === 'rating' && raw === '0')) {
        if (def.required) {
          setError(`请填写「${def.label}」`)
          return
        }
        continue
      }
      fields[def.key] = def.type === 'number' || def.type === 'rating' ? Number(raw) : raw
      filledCount++
    }
    if (moduleDef.requireAtLeastOne && filledCount === 0) {
      setError('请至少填写一项')
      return
    }
    onSubmit({ date, fields, note: note.trim() || undefined, photos })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            {initial ? `编辑${moduleDef.label}` : moduleDef.addLabel}
          </h3>
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

          {moduleDef.fields.map((def) => (
            <div key={def.key}>
              <label className="text-sm text-gray-500">
                {def.label}
                {def.unit ? `（${def.unit}）` : ''}
                {def.required ? ' *' : ''}
              </label>
              <FieldInput def={def} value={values[def.key]} onChange={(v) => setField(def.key, v)} />
            </div>
          ))}

          {moduleDef.hasNote && (
            <div>
              <label className="text-sm text-gray-500">备注</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="可选"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
          )}

          {moduleDef.hasPhotos && (
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
          )}

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
