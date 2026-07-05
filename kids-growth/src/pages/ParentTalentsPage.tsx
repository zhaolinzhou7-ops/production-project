import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { getModulesByGroup } from '../lib/recordModules'
import { InterestFormModal, type InterestFormValues } from '../components/interests/InterestFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { Interest } from '../types'

export function ParentTalentsPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const modules = getModulesByGroup('talent')

  const interests = useLiveQuery(async (): Promise<Interest[]> => {
    if (!currentChildId) return []
    const rows = await db.interests.where('childId').equals(currentChildId).toArray()
    return rows.sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt)
  }, [currentChildId])

  const moduleCounts = useLiveQuery(async () => {
    if (!currentChildId) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const m of modules) {
      map.set(
        m.module,
        await db.records.where('[childId+module]').equals([currentChildId, m.module]).count(),
      )
    }
    return map
  }, [currentChildId])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Interest | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Interest | null>(null)

  if (!currentChildId || !interests || !moduleCounts) return null

  const handleSubmit = async (values: InterestFormValues) => {
    if (editing) {
      await db.interests.update(editing.id, values as Partial<Interest>)
    } else {
      await db.interests.add({
        id: newId(),
        childId: currentChildId,
        createdAt: Date.now(),
        ...values,
      })
    }
    setFormOpen(false)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">兴趣特长</h1>
      </div>

      {interests.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
          <div className="text-4xl mb-2">🎹</div>
          记录孩子正在学的兴趣项目
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {interests.map((it) => (
            <div
              key={it.id}
              className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${
                it.active ? 'bg-white/70' : 'bg-white/40 opacity-60'
              }`}
            >
              <div className="text-2xl">{it.icon}</div>
              <div className="flex-1">
                <div className="font-bold text-gray-800">
                  {it.name}
                  {!it.active && <span className="ml-1 text-[11px] text-gray-400">（已暂停）</span>}
                </div>
                <div className="text-xs text-gray-400">
                  {it.category}
                  {it.startedAt ? ` · ${it.startedAt} 开始` : ''}
                  {it.note ? ` · ${it.note}` : ''}
                </div>
              </div>
              <button
                onClick={() => {
                  setEditing(it)
                  setFormOpen(true)
                }}
                className="p-1.5 text-gray-400"
              >
                <Pencil size={16} />
              </button>
              <button onClick={() => setDeleteTarget(it)} className="p-1.5 text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          setEditing(undefined)
          setFormOpen(true)
        }}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition mb-6"
      >
        <Plus size={18} />
        添加兴趣特长
      </button>

      <h2 className="font-bold text-gray-700 mb-2">考级与获奖</h2>
      <div className="space-y-3">
        {modules.map((m) => (
          <button
            key={m.module}
            onClick={() => navigate(`/parent/records/${m.module}`)}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
          >
            <div className="text-2xl">{m.icon}</div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">{m.label}</div>
              <div className="text-xs text-gray-400">{moduleCounts.get(m.module) ?? 0} 条记录</div>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        ))}
      </div>

      {formOpen && (
        <InterestFormModal
          key={editing?.id ?? 'new'}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除兴趣「${deleteTarget?.name}」？`}
        description="相关的考级/获奖记录不会被删除。"
        confirmLabel="删除"
        onConfirm={async () => {
          if (deleteTarget) await db.interests.delete(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
