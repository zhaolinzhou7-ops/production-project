import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { evaluateAchievements } from '../db/achievements'
import { AnecdoteFormModal, type AnecdoteFormValues } from '../components/anecdotes/AnecdoteFormModal'
import { PhotoLightbox } from '../components/archive/PhotoLightbox'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { Anecdote } from '../types'

export function ParentAnecdotesPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)

  const anecdotes = useLiveQuery(async (): Promise<Anecdote[]> => {
    if (!currentChildId) return []
    const rows = await db.anecdotes.where('childId').equals(currentChildId).toArray()
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [currentChildId])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Anecdote | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Anecdote | null>(null)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  if (!currentChildId || !anecdotes) return null

  const handleSubmit = async (values: AnecdoteFormValues) => {
    if (editing) {
      await db.anecdotes.update(editing.id, values as Partial<Anecdote>)
    } else {
      await db.anecdotes.add({
        id: newId(),
        childId: currentChildId,
        createdAt: Date.now(),
        ...values,
      })
      await evaluateAchievements(currentChildId)
    }
    setFormOpen(false)
  }

  // 品格画像:按维度聚合出现次数
  const traitCounts = new Map<string, number>()
  for (const a of anecdotes) {
    for (const t of a.traits) traitCounts.set(t, (traitCounts.get(t) ?? 0) + 1)
  }
  const traitProfile = [...traitCounts.entries()].sort((a, b) => b[1] - a[1])
  const maxCount = traitProfile[0]?.[1] ?? 1

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">成长事例</h1>
      </div>

      {traitProfile.length > 0 && (
        <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
          <h2 className="font-bold text-gray-700 mb-1">品格画像</h2>
          <p className="text-[11px] text-gray-400 mb-3">来自 {anecdotes.length} 条具体事例的聚合</p>
          <div className="space-y-2">
            {traitProfile.slice(0, 8).map(([trait, count]) => (
              <div key={trait} className="flex items-center gap-2">
                <span className="w-14 text-xs text-gray-600">{trait}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs text-gray-400">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {anecdotes.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
          <div className="text-4xl mb-2">✨</div>
          记录孩子的具体行为——闪光时刻和成长时刻，
          <br />
          日积月累就是一幅真实的品格画像
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {anecdotes.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white/70 p-3.5 shadow-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    a.kind === 'shine' ? 'bg-sun-400/25 text-sun-500' : 'bg-mint-400/20 text-mint-500'
                  }`}
                >
                  {a.kind === 'shine' ? '✨ 闪光时刻' : '🌱 成长时刻'}
                </span>
                <span className="ml-auto text-[11px] text-gray-400">{a.date}</span>
              </div>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{a.content}</p>
              {a.traits.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {a.traits.map((t) => (
                    <span key={t} className="text-[11px] text-brand-500">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
              {a.parentAction && (
                <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  💬 我的引导：{a.parentAction}
                </div>
              )}
              {a.photos.length > 0 && (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {a.photos.map((p, i) => (
                    <button key={i} onClick={() => setLightbox({ photos: a.photos, index: i })}>
                      <img src={p} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-1.5 flex justify-end gap-1">
                <button
                  onClick={() => {
                    setEditing(a)
                    setFormOpen(true)
                  }}
                  className="p-1 text-gray-400"
                >
                  <Pencil size={15} />
                </button>
                <button onClick={() => setDeleteTarget(a)} className="p-1 text-red-400">
                  <Trash2 size={15} />
                </button>
              </div>
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
        记一个成长事例
      </button>

      {formOpen && (
        <AnecdoteFormModal
          key={editing?.id ?? 'new'}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这条事例？"
        confirmLabel="删除"
        onConfirm={async () => {
          if (deleteTarget) await db.anecdotes.delete(deleteTarget.id)
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
