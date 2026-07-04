import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { evaluateAchievements } from '../db/achievements'
import { PortfolioFormModal, type PortfolioFormValues } from '../components/archive/PortfolioFormModal'
import { DiaryFormModal, type DiaryFormValues } from '../components/archive/DiaryFormModal'
import { MOOD_OPTIONS } from '../lib/moods'
import { PhotoLightbox } from '../components/archive/PhotoLightbox'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { DiaryEntry, Portfolio } from '../types'

type Tab = 'portfolio' | 'diary'

export function ParentArchivePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const [tab, setTab] = useState<Tab>('portfolio')

  const portfolios = useLiveQuery(async (): Promise<Portfolio[]> => {
    if (!currentChildId) return []
    return db.portfolios.where('childId').equals(currentChildId).reverse().sortBy('date')
  }, [currentChildId])
  const diaryEntries = useLiveQuery(async (): Promise<DiaryEntry[]> => {
    if (!currentChildId) return []
    return db.diaryEntries.where('childId').equals(currentChildId).reverse().sortBy('date')
  }, [currentChildId])

  const [portfolioFormOpen, setPortfolioFormOpen] = useState(false)
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | undefined>(undefined)
  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<Portfolio | null>(null)

  const [diaryFormOpen, setDiaryFormOpen] = useState(false)
  const [editingDiary, setEditingDiary] = useState<DiaryEntry | undefined>(undefined)
  const [deleteDiaryTarget, setDeleteDiaryTarget] = useState<DiaryEntry | null>(null)

  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)

  if (!currentChildId || !portfolios || !diaryEntries) return null

  const handlePortfolioSubmit = async (values: PortfolioFormValues) => {
    if (editingPortfolio) {
      await db.portfolios.update(editingPortfolio.id, values as Partial<Portfolio>)
    } else {
      await db.portfolios.add({ id: newId(), childId: currentChildId, createdAt: Date.now(), ...values })
      await evaluateAchievements(currentChildId)
    }
    setPortfolioFormOpen(false)
  }

  const handleDiarySubmit = async (values: DiaryFormValues) => {
    if (editingDiary) {
      await db.diaryEntries.update(editingDiary.id, values as Partial<DiaryEntry>)
    } else {
      await db.diaryEntries.add({ id: newId(), childId: currentChildId, createdAt: Date.now(), ...values })
    }
    setDiaryFormOpen(false)
  }

  const moodEmoji = (mood?: string) => MOOD_OPTIONS.find((m) => m.value === mood)?.emoji

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">学习成长档案</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('portfolio')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
            tab === 'portfolio' ? 'bg-brand-500 text-white' : 'bg-white/60 text-gray-500'
          }`}
        >
          🎨 作品集
        </button>
        <button
          onClick={() => setTab('diary')}
          className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${
            tab === 'diary' ? 'bg-brand-500 text-white' : 'bg-white/60 text-gray-500'
          }`}
        >
          💌 家长寄语
        </button>
      </div>

      {tab === 'portfolio' && (
        <>
          {portfolios.length === 0 ? (
            <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
              <div className="text-4xl mb-2">🎨</div>
              还没有作品，把孩子的第一幅画收进来吧
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {portfolios.map((p) => (
                <div key={p.id} className="rounded-2xl bg-white/70 shadow-sm overflow-hidden">
                  {p.photos.length > 0 ? (
                    <button
                      className="block w-full"
                      onClick={() => setLightbox({ photos: p.photos, index: 0 })}
                    >
                      <img src={p.photos[0]} alt={p.title} className="h-32 w-full object-cover" />
                    </button>
                  ) : (
                    <div className="h-32 w-full bg-brand-50 flex items-center justify-center text-4xl">
                      🎨
                    </div>
                  )}
                  <div className="p-2.5">
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-600">
                        {p.type}
                      </span>
                      {p.photos.length > 1 && (
                        <span className="text-[10px] text-gray-400">{p.photos.length} 张</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-bold text-gray-800 truncate">{p.title}</div>
                    <div className="text-[10px] text-gray-400">{p.date}</div>
                    {p.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <span key={t} className="text-[10px] text-mint-500">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-1.5 flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingPortfolio(p)
                          setPortfolioFormOpen(true)
                        }}
                        className="p-1 text-gray-400"
                      >
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeletePortfolioTarget(p)} className="p-1 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setEditingPortfolio(undefined)
              setPortfolioFormOpen(true)
            }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
          >
            <Plus size={18} />
            作品入档
          </button>
        </>
      )}

      {tab === 'diary' && (
        <>
          {diaryEntries.length === 0 ? (
            <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
              <div className="text-4xl mb-2">💌</div>
              还没有寄语，写下第一段想对孩子说的话吧
            </div>
          ) : (
            <div className="space-y-3 mb-3">
              {diaryEntries.map((d) => (
                <div key={d.id} className="rounded-2xl bg-white/70 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {moodEmoji(d.mood) && <span className="text-lg">{moodEmoji(d.mood)}</span>}
                      <span className="text-xs text-gray-400">{d.date}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingDiary(d)
                          setDiaryFormOpen(true)
                        }}
                        className="p-1 text-gray-400"
                      >
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteDiaryTarget(d)} className="p-1 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {d.title && <div className="mt-1 font-bold text-gray-800">{d.title}</div>}
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{d.content}</p>
                  {d.photos.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {d.photos.map((p, i) => (
                        <button key={i} onClick={() => setLightbox({ photos: d.photos, index: i })}>
                          <img src={p} alt="" className="h-16 w-16 rounded-lg object-cover" />
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
              setEditingDiary(undefined)
              setDiaryFormOpen(true)
            }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
          >
            <Plus size={18} />
            写一段寄语
          </button>
        </>
      )}

      {portfolioFormOpen && (
        <PortfolioFormModal
          key={editingPortfolio?.id ?? 'new'}
          open={portfolioFormOpen}
          initial={editingPortfolio}
          onClose={() => setPortfolioFormOpen(false)}
          onSubmit={handlePortfolioSubmit}
        />
      )}
      <ConfirmDialog
        open={!!deletePortfolioTarget}
        title={`删除作品「${deletePortfolioTarget?.title}」？`}
        description="作品和照片将被永久删除。"
        confirmLabel="删除"
        onConfirm={async () => {
          if (deletePortfolioTarget) await db.portfolios.delete(deletePortfolioTarget.id)
          setDeletePortfolioTarget(null)
        }}
        onCancel={() => setDeletePortfolioTarget(null)}
      />

      {diaryFormOpen && (
        <DiaryFormModal
          key={editingDiary?.id ?? 'new'}
          open={diaryFormOpen}
          initial={editingDiary}
          onClose={() => setDiaryFormOpen(false)}
          onSubmit={handleDiarySubmit}
        />
      )}
      <ConfirmDialog
        open={!!deleteDiaryTarget}
        title="删除这段寄语？"
        confirmLabel="删除"
        onConfirm={async () => {
          if (deleteDiaryTarget) await db.diaryEntries.delete(deleteDiaryTarget.id)
          setDeleteDiaryTarget(null)
        }}
        onCancel={() => setDeleteDiaryTarget(null)}
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
