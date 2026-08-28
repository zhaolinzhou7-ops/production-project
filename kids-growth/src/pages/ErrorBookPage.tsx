import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Camera, Play, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { addErrorCard, deleteCard, graduateErrorCards } from '../db/study'
import { isDue } from '../lib/srs'
import { compressImageFile } from '../lib/image'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { LearnCard, LearnDeck, StudyState } from '../types'

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '其他']

export function ErrorBookPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const errorDeck = useLiveQuery(
    (): Promise<LearnDeck | undefined> =>
      currentChildId
        ? db.decks
            .where('childId')
            .equals(currentChildId)
            .filter((d) => d.source === 'wrong' && d.itemType === 'wrong')
            .first()
        : Promise.resolve(undefined),
    [currentChildId],
  )
  const cards = useLiveQuery(
    (): Promise<LearnCard[]> =>
      errorDeck ? db.cards.where('deckId').equals(errorDeck.id).toArray() : Promise.resolve([]),
    [errorDeck?.id],
  )
  const states = useLiveQuery(
    (): Promise<StudyState[]> =>
      errorDeck && currentChildId
        ? db.studyStates.where('[childId+deckId]').equals([currentChildId, errorDeck.id]).toArray()
        : Promise.resolve([]),
    [errorDeck?.id, currentChildId],
  )

  /*
    进页面时先让「已经连对两次」的错题毕业。

    原先错题只进不出。一个每天做题的孩子两个月就能攒出两三百道 ——
    家长打开一看,再也不会点第二次。**一个只增不减的错题本最后一定会被放弃**,
    那前面自动收集做得再好也没用。
    放在进页面时做而不是答对时做:答对的那一刻孩子还在做题,
    让题目从列表里消失是家长的事,不该打断他。
  */
  const [graduated, setGraduated] = useState(0)
  /** 展开答案的那一条(空串=都藏着) */
  const [shown, setShown] = useState('')
  useEffect(() => {
    if (!currentChildId) return
    void graduateErrorCards(currentChildId).then((n) => {
      if (n > 0) setGraduated(n)
    })
  }, [currentChildId])

  const [showForm, setShowForm] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [subject, setSubject] = useState('数学')
  const [photo, setPhoto] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<LearnCard | null>(null)

  if (!child || !currentChildId) return <div className="pt-20 text-center text-3xl">📕</div>

  const dueCount = (states ?? []).filter((s) => isDue(s)).length

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(await compressImageFile(file, 800, 0.8))
  }

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) return
    setSaving(true)
    await addErrorCard(currentChildId, { front, back, subject, photo })
    setFront('')
    setBack('')
    setPhoto(undefined)
    setSaving(false)
    setShowForm(false)
  }

  return (
    <div className="pt-4 pb-12">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/learn')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">错题本 📕</h1>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95 transition"
        >
          <Plus size={18} /> 记一道错题
        </button>
        {errorDeck && (cards?.length ?? 0) > 0 && (
          <button
            onClick={() => navigate(`/learn/session/${errorDeck.id}/review`)}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-mint-500 px-5 py-3 font-bold text-white active:scale-95 transition disabled:opacity-40"
            disabled={dueCount === 0}
          >
            <Play size={16} /> 重做{dueCount > 0 ? ` ${dueCount}` : ''}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 rounded-3xl bg-white/80 p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUBJECTS.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  subject === s ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            rows={3}
            placeholder="题目(可只写关键词,或配一张拍照)"
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 resize-none mb-2"
          />
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={2}
            placeholder="正确答案 / 解析"
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 resize-none mb-2"
          />
          {photo ? (
            <div className="relative mb-2 inline-block">
              <img src={photo} alt="错题" className="max-h-40 rounded-xl object-contain" />
              <button
                onClick={() => setPhoto(undefined)}
                className="absolute -right-2 -top-2 rounded-full bg-gray-700 p-1 text-white"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-600">
              <Camera size={16} /> 拍照 / 选图
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
          )}
          <div className="flex justify-end">
            <button
              onClick={() => void handleSave()}
              disabled={saving || !front.trim() || !back.trim()}
              className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {(cards?.length ?? 0) === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          <div className="text-4xl mb-2">📕</div>
          还没有错题。把平时做错的题记进来,按遗忘曲线定期重做,才是提分关键。
        </div>
      ) : (
        <div className="space-y-2">
          {cards!.map((c) => {
            const st = (states ?? []).find((s) => s.cardId === c.id)
            const mastered = st?.status === 'mastered'
            return (
              <div key={c.id} className="rounded-2xl bg-white/70 p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {(c.extra as { subject?: string } | undefined)?.subject && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                          {(c.extra as { subject?: string }).subject}
                        </span>
                      )}
                      {mastered && (
                        <span className="rounded-full bg-mint-400/20 px-2 py-0.5 text-[10px] text-mint-600">
                          已掌握
                        </span>
                      )}
                    </div>
                    {/* 点题干就直接做这一道 —— 家长常常是有目标的:先把昨天那道弄懂 */}
                    <button
                      onClick={() =>
                        errorDeck &&
                        navigate(`/learn/session/${errorDeck.id}/review?cardId=${c.id}`)
                      }
                      className="w-full text-left"
                    >
                      <div className="text-sm text-gray-800 line-clamp-2 whitespace-pre-line">{c.front}</div>
                    </button>
                    {/*
                      答案默认**藏起来**。摊在列表上等于每次翻错题本都把答案
                      又看了一遍 —— 看多了记住的是答案的样子,不是这道题。
                    */}
                    {shown === c.id ? (
                      <div className="mt-0.5 text-xs text-gray-400 whitespace-pre-line">答案:{c.back}</div>
                    ) : (
                      <button
                        onClick={() => setShown(c.id)}
                        className="mt-0.5 text-xs text-gray-300 underline"
                      >
                        看答案
                      </button>
                    )}
                    <button
                      onClick={() =>
                        errorDeck &&
                        navigate(`/learn/session/${errorDeck.id}/review?cardId=${c.id}`)
                      }
                      className="mt-1.5 rounded-full bg-brand-100 px-3 py-1 text-[11px] font-bold text-brand-600 active:scale-95"
                    >
                      做这道
                    </button>
                  </div>
                  {(c.extra as { photo?: string } | undefined)?.photo && (
                    <img
                      src={(c.extra as { photo?: string }).photo}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  )}
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-1.5 text-gray-300 hover:text-red-400"
                    aria-label="删除错题"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/*
        毕业提示。错题本能长期用下去的前提是它**会变短** ——
        家长要看得见「消化掉了几道」,否则只看到越攒越多,很快就不点了。
      */}
      {graduated > 0 && (
        <p className="mt-3 text-xs text-mint-600">
          🎓 有 {graduated} 道已经连着做对两次,移出错题本了
        </p>
      )}

      <p className="mt-4 text-[11px] text-gray-400">
        错题按间隔重复(SRS)排期:重做答对则拉长下次出现间隔,答错则很快再现。
        选择题错的还是选择题(A–E),算错的算术题还是让他算一遍 ——
        重做是真的再做一次,不是看一眼答案。连着做对两次就自动毕业。
      </p>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除这道错题?"
        description="将从错题本中移除,此操作不可撤销。"
        confirmLabel="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteCard(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
