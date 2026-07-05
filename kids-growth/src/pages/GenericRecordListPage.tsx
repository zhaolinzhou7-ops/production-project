import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { getRecordModule } from '../lib/recordModules'
import { TrendChart, type TrendPoint } from '../components/common/TrendChart'
import {
  GenericRecordFormModal,
  type GenericRecordFormValues,
} from '../components/records/GenericRecordFormModal'
import { PhotoLightbox } from '../components/archive/PhotoLightbox'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { LogRecord } from '../types'

export function GenericRecordListPage() {
  const navigate = useNavigate()
  const { module } = useParams<{ module: string }>()
  const moduleDef = module ? getRecordModule(module) : undefined
  const currentChildId = useAppStore((s) => s.currentChildId)

  const records = useLiveQuery(async (): Promise<LogRecord[]> => {
    if (!currentChildId || !moduleDef) return []
    const rows = await db.records
      .where('[childId+module]')
      .equals([currentChildId, moduleDef.module])
      .toArray()
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [currentChildId, moduleDef?.module])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LogRecord | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<LogRecord | null>(null)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  if (!moduleDef) return <Navigate to="/parent" replace />
  if (!currentChildId || !records) return null

  const handleSubmit = async (values: GenericRecordFormValues) => {
    if (editing) {
      await db.records.update(editing.id, {
        date: values.date,
        fields: values.fields,
        note: values.note,
        photos: values.photos,
      })
    } else {
      await db.records.add({
        id: newId(),
        childId: currentChildId,
        module: moduleDef.module,
        date: values.date,
        fields: values.fields,
        note: values.note,
        photos: values.photos,
        createdAt: Date.now(),
      })
    }
    setFormOpen(false)
  }

  // 趋势数据:按日期升序,取配置的 trendFields 中有值的字段
  const trendSeries = (moduleDef.trendFields ?? []).filter((tf) =>
    records.some((r) => typeof r.fields[tf.key] === 'number'),
  )
  const trendData: TrendPoint[] = [...records]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const point: TrendPoint = { x: r.date.slice(2) }
      for (const tf of trendSeries) {
        const v = r.fields[tf.key]
        point[tf.key] = typeof v === 'number' ? v : null
      }
      return point
    })
    .filter((p) => trendSeries.some((tf) => p[tf.key] != null))
  const showTrend = trendSeries.length > 0 && trendData.length >= 2

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          {moduleDef.icon} {moduleDef.label}
        </h1>
      </div>

      {showTrend && (
        <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
          <h2 className="font-bold text-gray-700 mb-2">变化趋势</h2>
          <TrendChart data={trendData} series={trendSeries} />
        </div>
      )}

      {moduleDef.disclaimer && (
        <p className="text-[11px] text-orange-500 mb-4">{moduleDef.disclaimer}</p>
      )}

      {records.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
          <div className="text-4xl mb-2">{moduleDef.icon}</div>
          还没有{moduleDef.label}
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {records.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white/70 p-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{r.date}</div>
                  <div className="text-xs text-gray-500">{moduleDef.summarize(r.fields)}</div>
                  {r.note && <div className="text-xs text-gray-400 mt-0.5">{r.note}</div>}
                </div>
                <button
                  onClick={() => {
                    setEditing(r)
                    setFormOpen(true)
                  }}
                  className="p-1.5 text-gray-400"
                >
                  <Pencil size={16} />
                </button>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
              {r.photos.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {r.photos.map((p, i) => (
                    <button key={i} onClick={() => setLightbox({ photos: r.photos, index: i })}>
                      <img src={p} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          setEditing(undefined)
          setFormOpen(true)
        }}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
      >
        <Plus size={18} />
        {moduleDef.addLabel}
      </button>

      {formOpen && (
        <GenericRecordFormModal
          key={editing?.id ?? 'new'}
          open={formOpen}
          moduleDef={moduleDef}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除这条${moduleDef.label}？`}
        description={deleteTarget ? `日期：${deleteTarget.date}` : undefined}
        confirmLabel="删除"
        onConfirm={async () => {
          if (deleteTarget) await db.records.delete(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {lightbox && (
        <PhotoLightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
