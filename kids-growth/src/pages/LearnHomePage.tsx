import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { packsForStage } from '../lib/learningContent'
import { ensureBuiltinDeck, countDue } from '../db/study'
import { modesFor } from '../lib/practiceModes'
import type { LearnDeck, PracticeMode } from '../types'

export function LearnHomePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()
  const [provisioning, setProvisioning] = useState(true)

  // 首次进入:按学段自动实例化默认词库(幂等)
  useEffect(() => {
    if (!currentChildId || !child) return
    let alive = true
    void (async () => {
      setProvisioning(true)
      for (const p of packsForStage(stage)) {
        await ensureBuiltinDeck(currentChildId, p.key)
      }
      if (alive) setProvisioning(false)
    })()
    return () => {
      alive = false
    }
  }, [currentChildId, child, stage])

  const decks = useLiveQuery(async (): Promise<LearnDeck[]> => {
    if (!currentChildId) return []
    return db.decks.where('childId').equals(currentChildId).toArray()
  }, [currentChildId, provisioning])

  const dueCounts = useLiveQuery(async () => {
    if (!currentChildId || !decks) return {}
    const out: Record<string, number> = {}
    for (const d of decks) out[d.id] = await countDue(currentChildId, d.id)
    return out
  }, [currentChildId, decks])

  const [openDeck, setOpenDeck] = useState<string | null>(null)

  if (!child || !currentChildId) return null

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">
          {tone === 'playful' ? '开始学习 📚' : '学习中心'}
        </h1>
      </div>

      {provisioning || !decks ? (
        <div className="pt-10 text-center text-3xl">📚</div>
      ) : decks.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          还没有词库,去家长模式分配吧
        </div>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => {
            const due = dueCounts?.[deck.id] ?? 0
            const modes = modesFor(deck.itemType, stage === 'toddler' || stage === 'primary')
            const open = openDeck === deck.id
            return (
              <div key={deck.id} className="rounded-2xl bg-white/70 shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenDeck(open ? null : deck.id)}
                  className="w-full flex items-center gap-3 p-4 text-left active:scale-[0.99] transition"
                >
                  <div className="text-2xl">{deck.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{deck.name}</div>
                    <div className="text-xs text-gray-400">{deck.subject}</div>
                  </div>
                  {due > 0 ? (
                    <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">
                      待学 {due}
                    </span>
                  ) : (
                    <span className="rounded-full bg-mint-400/30 px-2.5 py-1 text-xs font-medium text-mint-600">
                      已清空
                    </span>
                  )}
                </button>
                {open && (
                  <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                    {modes.map((m) => (
                      <button
                        key={m.mode}
                        onClick={() => navigate(`/learn/session/${deck.id}/${m.mode as PracticeMode}`)}
                        className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-left active:scale-95 transition"
                      >
                        <span className="text-lg">{m.icon}</span>
                        <span className="text-sm">
                          <span className="font-medium text-gray-700 block">{m.label}</span>
                          <span className="text-[11px] text-gray-400">{m.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-[11px] text-gray-400">
        单词发音来自网络真人音源,首次播放需联网、之后可离线重播;跟读的语音识别需联网且仅部分浏览器支持。
      </p>
    </div>
  )
}
