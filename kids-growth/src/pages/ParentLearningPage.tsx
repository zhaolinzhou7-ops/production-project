import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Target, Play } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { BUILTIN_PACKS } from '../lib/learningContent'
import {
  ensureBuiltinDeck,
  createCustomWordDeck,
  parseWordList,
  deleteDeck,
  getLearningStats,
  getDailyGoal,
  setDailyGoal,
  type DeckStat,
} from '../db/study'
import { db } from '../db/db'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

export function ParentLearningPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const stats = useLiveQuery(
    () => (currentChildId ? getLearningStats(currentChildId) : null),
    [currentChildId],
  )
  const dailyGoal = useLiveQuery(
    () => (currentChildId ? getDailyGoal(currentChildId) : 15),
    [currentChildId],
  )
  const assignedKeys = useLiveQuery(async () => {
    if (!currentChildId) return new Set<string>()
    const decks = await db.decks.where('childId').equals(currentChildId).toArray()
    return new Set(decks.map((d) => d.builtinKey).filter(Boolean) as string[])
  }, [currentChildId])

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWords, setNewWords] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeckStat | null>(null)
  const [goalDraft, setGoalDraft] = useState<string>('')

  if (!child || !currentChildId || !stats || dailyGoal === undefined || !assignedKeys) {
    return <div className="pt-20 text-center text-3xl">📚</div>
  }

  const goalPct = Math.min(100, Math.round((stats.todayReviewed / Math.max(1, dailyGoal)) * 100))
  const parsedPreview = parseWordList(newWords)

  const handleCreate = async () => {
    if (parsedPreview.length === 0) return
    await createCustomWordDeck(currentChildId, newName, parsedPreview)
    setNewName('')
    setNewWords('')
    setShowCreate(false)
  }

  const handleSaveGoal = async () => {
    const n = Number(goalDraft)
    if (Number.isFinite(n) && n > 0) await setDailyGoal(currentChildId, n)
    setGoalDraft('')
  }

  const unassignedPacks = BUILTIN_PACKS.filter((p) => !assignedKeys.has(p.key))

  return (
    <div className="pt-4 pb-12">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">学习管理</h1>
      </div>
      <p className="text-sm text-gray-400 mb-4">正在管理：{child.nickname || child.name} 的学习</p>

      {/* 今日学习目标 */}
      <div className="mb-4 rounded-3xl bg-white/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-bold text-gray-700">
            <Target size={16} className="text-brand-500" /> 今日学习
          </div>
          <div className="text-xs text-gray-400">
            目标 {dailyGoal} 卡 / 今日已练 {stats.todayReviewed}
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${goalPct >= 100 ? 'bg-mint-500' : 'bg-brand-400'}`}
            style={{ width: `${goalPct}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            placeholder={String(dailyGoal)}
            className="w-24 rounded-xl border-2 border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
          />
          <button
            onClick={() => void handleSaveGoal()}
            className="rounded-xl bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-600 active:scale-95"
          >
            设为每日目标
          </button>
        </div>
      </div>

      {/* 掌握概览 */}
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <StatCell label="掌握" value={stats.mastered} color="text-mint-600" bg="bg-mint-400/15" />
        <StatCell label="学习中" value={stats.learning} color="text-brand-600" bg="bg-brand-100" />
        <StatCell label="未学" value={stats.fresh} color="text-gray-500" bg="bg-gray-100" />
        <StatCell label="今日待学" value={stats.dueToday} color="text-sun-500" bg="bg-sun-400/15" />
        <StatCell label="连续天数" value={stats.studyStreak} color="text-orange-500" bg="bg-orange-100/70" />
        <StatCell label="总词卡" value={stats.totalCards} color="text-gray-700" bg="bg-white/80" />
      </div>

      {/* 学习曲线 */}
      <div className="mb-4 rounded-3xl bg-white/70 p-4 shadow-sm">
        <div className="font-bold text-gray-700 mb-2 text-sm">近 14 天练习量</div>
        {stats.curve.every((c) => c.count === 0) ? (
          <p className="py-6 text-center text-sm text-gray-400">还没有学习记录,去练一练吧</p>
        ) : (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.curve} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                  interval={2}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(d) => `${d}`}
                  formatter={(v) => [`${v} 卡`, '练习'] as [string, string]}
                  contentStyle={{ fontSize: 12, borderRadius: 12, border: 'none' }}
                />
                <Bar dataKey="count" fill="#f9497a" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 薄弱词 */}
      {stats.weak.length > 0 && (
        <div className="mb-4 rounded-3xl bg-white/70 p-4 shadow-sm">
          <div className="font-bold text-gray-700 mb-2 text-sm">薄弱词(易忘,建议多练)</div>
          <div className="flex flex-wrap gap-2">
            {stats.weak.map((w) => (
              <span
                key={w.front}
                className="rounded-full bg-red-50 px-3 py-1 text-xs text-gray-600"
                title={w.back}
              >
                {w.front}
                <span className="ml-1 text-red-400">×{w.lapses}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 词库管理 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-gray-700">词库</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-1.5 text-sm font-medium text-white active:scale-95"
        >
          <Plus size={15} /> 自定义词本
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 rounded-3xl bg-white/80 p-4 shadow-sm">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="词本名称,如「课本 Unit 5」"
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 mb-2"
          />
          <textarea
            value={newWords}
            onChange={(e) => setNewWords(e.target.value)}
            rows={5}
            placeholder={'每行一个词,单词和释义用空格或逗号分隔,例如:\napple 苹果\nbanana, 香蕉\ncat /kæt/ 猫'}
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-400 resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">已识别 {parsedPreview.length} 个词</span>
            <button
              onClick={() => void handleCreate()}
              disabled={parsedPreview.length === 0}
              className="rounded-xl bg-brand-500 px-4 py-1.5 text-sm font-medium text-white active:scale-95 disabled:opacity-40"
            >
              创建
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {stats.decks.map((d) => (
          <div key={d.deckId} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 shadow-sm">
            <div className="text-2xl">{d.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 truncate">
                {d.name}
                {d.source === 'wrong' && <span className="ml-1 text-xs text-red-400">自动收录</span>}
                {d.source === 'custom' && <span className="ml-1 text-xs text-brand-400">自定义</span>}
              </div>
              <div className="text-xs text-gray-400">
                {d.total} 词 · 已掌握 {d.mastered} · 待学 {d.due}
              </div>
            </div>
            {d.source !== 'builtin' && (
              <button
                onClick={() => setDeleteTarget(d)}
                className="p-2 text-gray-300 hover:text-red-400"
                aria-label="删除词本"
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}
        {stats.decks.length === 0 && (
          <p className="rounded-2xl bg-white/60 p-6 text-center text-sm text-gray-400">
            还没有词库,从下面添加分级词库或创建自定义词本
          </p>
        )}
      </div>

      {/* 可添加的内置分级词库 */}
      {unassignedPacks.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-400 mb-2">添加分级词库</div>
          <div className="space-y-2">
            {unassignedPacks.map((p) => (
              <button
                key={p.key}
                onClick={() => void ensureBuiltinDeck(currentChildId, p.key)}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/60 p-3 text-left active:scale-95 transition"
              >
                <div className="text-2xl">{p.icon}</div>
                <div className="flex-1">
                  <div className="font-medium text-gray-700">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.subject}</div>
                </div>
                <Plus size={18} className="text-brand-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate('/learn')}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-brand-100 py-3 text-sm font-medium text-brand-600 active:scale-95 transition"
      >
        <Play size={15} /> 预览孩子学习端
      </button>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除「${deleteTarget?.name}」?`}
        description="该词本及其学习进度将被移除,此操作不可撤销。"
        confirmLabel="删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await deleteDeck(deleteTarget.deckId)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function StatCell({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className={`rounded-2xl ${bg} py-3`}>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
