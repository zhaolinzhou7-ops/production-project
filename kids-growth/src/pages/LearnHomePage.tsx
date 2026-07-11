import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calculator, NotebookPen, ChevronRight, Volume2, VolumeX } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { packsForStage } from '../lib/learningContent'
import { ensureBuiltinDeck, countDue, getDailyGoal } from '../db/study'
import { modesFor } from '../lib/practiceModes'
import { isMuted, setMuted } from '../lib/sfx'
import { STICKER_CATALOG, getOwnedStickers } from '../lib/stickers'
import { PET_LINES, getPet, choosePet } from '../lib/pets'
import { todayISO } from '../lib/dateUtils'
import type { LearnDeck, PracticeMode } from '../types'

export function LearnHomePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()
  const [provisioning, setProvisioning] = useState(true)
  const [muted, setMutedState] = useState(isMuted())
  const [showStickers, setShowStickers] = useState(false)

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
    const all = await db.decks.where('childId').equals(currentChildId).toArray()
    // 手动错题本(itemType 'wrong')单独由「错题本」入口管理,不进通用卡组列表
    return all.filter((d) => !(d.source === 'wrong' && d.itemType === 'wrong'))
  }, [currentChildId, provisioning])

  const dueCounts = useLiveQuery(async () => {
    if (!currentChildId || !decks) return {}
    const out: Record<string, number> = {}
    for (const d of decks) out[d.id] = await countDue(currentChildId, d.id)
    return out
  }, [currentChildId, decks])

  // 每日挑战:今日已练卡次(单词/古诗/识字会话 + 口算题数) vs 每日目标
  const challenge = useLiveQuery(async () => {
    if (!currentChildId) return null
    const today = todayISO()
    const [sessions, drills, goal] = await Promise.all([
      db.studySessions.where('[childId+date]').equals([currentChildId, today]).toArray(),
      db.drillResults
        .where('childId')
        .equals(currentChildId)
        .filter((d) => d.date === today)
        .toArray(),
      getDailyGoal(currentChildId),
    ])
    const done =
      sessions.reduce((s, x) => s + x.total, 0) + drills.reduce((s, x) => s + x.total, 0)
    return { done, goal }
  }, [currentChildId])

  const ownedStickers = useLiveQuery(
    async () => (currentChildId ? getOwnedStickers(currentChildId) : []),
    [currentChildId],
  )

  const pet = useLiveQuery(
    async () => (currentChildId ? getPet(currentChildId) : null),
    [currentChildId],
  )

  const [openDeck, setOpenDeck] = useState<string | null>(null)

  if (!child || !currentChildId) return null

  const owned = new Set(ownedStickers ?? [])
  const challengeDone = challenge && challenge.done >= challenge.goal
  const challengePct = challenge ? Math.min(100, Math.round((challenge.done / Math.max(1, challenge.goal)) * 100)) : 0

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-xl font-bold text-gray-800">
          {tone === 'playful' ? '开始学习 📚' : '学习中心'}
        </h1>
        <button
          onClick={toggleMute}
          className="rounded-full bg-white/70 p-2 text-gray-500 shadow-sm active:scale-90 transition"
          aria-label={muted ? '打开音效' : '关闭音效'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* 学习宠物(童趣模式) */}
      {tone === 'playful' && pet !== undefined && (
        <div className="mb-3 rounded-2xl bg-gradient-to-br from-mint-400/20 to-sun-400/15 p-4 shadow-sm">
          {pet === null ? (
            <>
              <div className="mb-2 text-sm font-bold text-gray-700">🥚 选一颗蛋,孵出你的学习宠物!</div>
              <p className="mb-3 text-[11px] text-gray-500">每答对一题就喂它一口,吃饱就会长大、进化</p>
              <div className="flex gap-2">
                {PET_LINES.map((line) => (
                  <button
                    key={line.key}
                    onClick={() => void choosePet(currentChildId, line.key)}
                    className="flex-1 rounded-2xl bg-white/80 py-3 text-center shadow-sm active:scale-95 transition"
                  >
                    <div className="text-3xl">🥚</div>
                    <div className="mt-1 text-xs font-medium text-gray-600">
                      {line.eggName} {line.hint}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-5xl">{pet.stage.emoji}</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-gray-700">{pet.stage.label}</div>
                {pet.toNext ? (
                  <>
                    <div className="mt-1 h-2 rounded-full bg-white/70 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-500 transition-all"
                        style={{ width: `${Math.min(100, Math.round((pet.toNext.have / pet.toNext.need) * 100))}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      再喂 {pet.toNext.need - pet.toNext.have} 口进化 · 答对一题喂一口
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-gray-500">已经是最终形态啦,好厉害! 🎉</div>
                )}
              </div>
              <span className="text-xs text-gray-400 tabular-nums">已喂 {pet.fed}</span>
            </div>
          )}
        </div>
      )}

      {/* 每日挑战 */}
      {challenge && (
        <div className="mb-3 rounded-2xl bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-gray-700">
              {challengeDone ? '🎉 今日挑战完成!' : '🎯 今日挑战'}
            </span>
            <span className="text-xs text-gray-400 tabular-nums">
              {challenge.done}/{challenge.goal} 题
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                challengeDone ? 'bg-mint-500' : 'bg-gradient-to-r from-sun-400 to-brand-400'
              }`}
              style={{ width: `${challengePct}%` }}
            />
          </div>
          {!challengeDone && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              再练 {challenge.goal - challenge.done} 题就完成今天的小目标啦
            </p>
          )}
        </div>
      )}

      {/* 贴纸册 */}
      <button
        onClick={() => setShowStickers((v) => !v)}
        className="mb-3 w-full rounded-2xl bg-white/70 p-4 text-left shadow-sm active:scale-[0.99] transition"
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎁</div>
          <div className="flex-1">
            <div className="font-bold text-gray-800">我的贴纸册</div>
            <div className="text-xs text-gray-400">
              已集 {owned.size}/{STICKER_CATALOG.length} 张 · 练得好(正确率80%+)就掉落新贴纸
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-gray-300 transition-transform ${showStickers ? 'rotate-90' : ''}`}
          />
        </div>
        {showStickers && (
          <div className="mt-3 grid grid-cols-8 gap-1.5">
            {STICKER_CATALOG.map((s) => (
              <div
                key={s.key}
                title={owned.has(s.key) ? s.name : '???'}
                className={`flex h-9 items-center justify-center rounded-lg text-xl ${
                  owned.has(s.key) ? 'bg-sun-400/15' : 'bg-gray-100 opacity-40 grayscale'
                }`}
              >
                {owned.has(s.key) ? s.emoji : '❔'}
              </div>
            ))}
          </div>
        )}
      </button>

      <button
        onClick={() => navigate('/learn/math')}
        className="mb-3 w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sun-400 to-sun-500 p-4 text-left text-white shadow-sm active:scale-[0.99] transition"
      >
        <div className="rounded-xl bg-white/25 p-2.5">
          <Calculator size={22} />
        </div>
        <div className="flex-1">
          <div className="font-bold">口算练习</div>
          <div className="text-xs text-white/85">加减乘除 · 乘法口诀,限时闯关得积分</div>
        </div>
        <ChevronRight size={18} className="text-white/80" />
      </button>

      <button
        onClick={() => navigate('/learn/errorbook')}
        className="mb-3 w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-left shadow-sm active:scale-[0.99] transition"
      >
        <div className="rounded-xl bg-red-100 p-2.5 text-red-500">
          <NotebookPen size={22} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">错题本</div>
          <div className="text-xs text-gray-400">各科错题拍照记录 · 按遗忘曲线重做</div>
        </div>
        <ChevronRight size={18} className="text-gray-300" />
      </button>

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
        单词发音为网络真人音源(需联网播放),取不到时自动改用系统朗读;古诗/识字用系统中文朗读,需设备装有中文语音。跟读的语音识别需联网,且仅部分浏览器(Chrome/Safari)支持;录音只在本机播放、不上传。
      </p>
    </div>
  )
}
