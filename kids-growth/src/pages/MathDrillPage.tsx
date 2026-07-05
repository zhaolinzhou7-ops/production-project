import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { ArrowLeft, Timer } from 'lucide-react'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { finishDrill } from '../db/study'
import { evaluateAchievements } from '../db/achievements'
import { computeLevelInfo, getChildPointStats } from '../lib/points'
import { MATH_KINDS, generateDrill, type MathKind, type MathProblem } from '../lib/mathDrill'
import { LevelUpModal } from '../components/points/LevelUpModal'
import { AchievementUnlockModal } from '../components/points/AchievementUnlockModal'
import type { Achievement, LevelStep } from '../types'

type Screen = 'config' | 'run' | 'done'
const COUNT_OPTIONS = [10, 20, 30]

export function MathDrillPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()

  const [screen, setScreen] = useState<Screen>('config')
  const [kind, setKind] = useState<MathKind>('add')
  const [count, setCount] = useState(20)
  const [problems, setProblems] = useState<MathProblem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<'none' | 'ok' | 'no'>('none')
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number; sec: number } | null>(null)
  const [levelUp, setLevelUp] = useState<LevelStep | null>(null)
  const [newAch, setNewAch] = useState<Achievement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 计时器
  useEffect(() => {
    if (screen !== 'run') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250)
    return () => clearInterval(t)
  }, [screen, startedAt])

  const start = () => {
    setProblems(generateDrill(kind, count, stage))
    setIdx(0)
    setCorrect(0)
    setInput('')
    setFeedback('none')
    setStartedAt(Date.now())
    setElapsed(0)
    setScreen('run')
  }

  const finish = useCallback(
    async (finalCorrect: number, total: number, sec: number) => {
      if (!currentChildId || !child) return
      const settings = await db.settings.get('singleton')
      const before = await getChildPointStats(currentChildId)
      const res = await finishDrill({ childId: currentChildId, kind, total, correct: finalCorrect, durationSec: sec })
      setSummary({ correct: finalCorrect, total, points: res.pointsAwarded, sec })
      if (settings) {
        const lvBefore = computeLevelInfo(before.xp, settings.levelLadder).level
        const lvAfter = computeLevelInfo(res.newXp, settings.levelLadder).level
        if (lvAfter.level > lvBefore.level) setLevelUp(lvAfter)
      }
      const unlocked = await evaluateAchievements(currentChildId)
      if (unlocked.length > 0) setNewAch(unlocked[0])
      if (tone === 'playful') confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } })
      setScreen('done')
    },
    [currentChildId, child, kind, tone],
  )

  const submit = () => {
    if (feedback !== 'none') return
    const val = Number(input.trim())
    const isRight = input.trim() !== '' && val === problems[idx].answer
    const nextCorrect = correct + (isRight ? 1 : 0)
    setCorrect(nextCorrect)
    setFeedback(isRight ? 'ok' : 'no')
    setTimeout(() => {
      if (idx + 1 >= problems.length) {
        void finish(nextCorrect, problems.length, Math.floor((Date.now() - startedAt) / 1000))
      } else {
        setIdx(idx + 1)
        setInput('')
        setFeedback('none')
        inputRef.current?.focus()
      }
    }, isRight ? 450 : 1100)
  }

  if (!child || !currentChildId) return null

  // ---- 配置 ----
  if (screen === 'config') {
    return (
      <div className="pt-4 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/learn')} className="p-1 text-gray-500">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">口算练习 🧮</h1>
        </div>

        <div className="text-sm font-medium text-gray-500 mb-2">选择题型</div>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {MATH_KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={() => setKind(k.kind)}
              className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left transition active:scale-95 ${
                kind === k.kind ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-gray-700'
              }`}
            >
              <span className="text-xl">{k.icon}</span>
              <span>
                <span className="block font-bold text-sm">{k.label}</span>
                <span className={`text-[11px] ${kind === k.kind ? 'text-white/80' : 'text-gray-400'}`}>
                  {k.desc}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="text-sm font-medium text-gray-500 mb-2">题目数量</div>
        <div className="flex gap-2 mb-8">
          {COUNT_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`flex-1 rounded-2xl py-3 font-bold transition active:scale-95 ${
                count === c ? 'bg-brand-500 text-white' : 'bg-white/70 text-gray-600'
              }`}
            >
              {c} 题
            </button>
          ))}
        </div>

        <button
          onClick={start}
          className="w-full rounded-2xl bg-gradient-to-r from-brand-400 to-brand-500 py-4 font-bold text-white shadow-sm active:scale-95 transition"
        >
          开始限时口算
        </button>
        <p className="mt-3 text-[11px] text-gray-400">题目随机生成、限时作答,答对越多、用时越短越棒;答对即得积分。</p>
      </div>
    )
  }

  // ---- 结算 ----
  if (screen === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    const avg = summary.total > 0 ? (summary.sec / summary.total).toFixed(1) : '0'
    return (
      <>
        <div className="pt-12 text-center px-6">
          <div className="text-6xl mb-3">{pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : '💪'}</div>
          <h1 className="text-2xl font-bold text-gray-800">练完啦!</h1>
          <div className="mt-6 rounded-3xl bg-white/70 p-6 shadow-sm max-w-xs mx-auto">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xl font-bold text-gray-800">{summary.correct}/{summary.total}</div>
                <div className="text-[10px] text-gray-400">答对</div>
              </div>
              <div>
                <div className="text-xl font-bold text-brand-500">{summary.sec}s</div>
                <div className="text-[10px] text-gray-400">用时(均 {avg}s/题)</div>
              </div>
              <div>
                <div className="text-xl font-bold text-sun-500">+{summary.points}</div>
                <div className="text-[10px] text-gray-400">积分</div>
              </div>
            </div>
          </div>
          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={() => setScreen('config')}
              className="rounded-2xl bg-white/80 px-6 py-3 font-bold text-gray-600 active:scale-95 transition"
            >
              再来一组
            </button>
            <button
              onClick={() => navigate('/learn')}
              className="rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95 transition"
            >
              完成
            </button>
          </div>
        </div>
        <LevelUpModal level={levelUp} tone={tone} onClose={() => setLevelUp(null)} />
        <AchievementUnlockModal achievement={newAch} tone={tone} onClose={() => setNewAch(null)} />
      </>
    )
  }

  // ---- 作答 ----
  const p = problems[idx]
  const progress = (idx / problems.length) * 100
  return (
    <div className="pt-4 pb-10 min-h-screen flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/learn')} className="text-gray-400 text-sm">
          退出
        </button>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-400 tabular-nums">
          <Timer size={13} /> {elapsed}s
        </span>
        <span className="text-xs text-gray-400 tabular-nums">{idx + 1}/{problems.length}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="flex items-center gap-3 text-5xl font-bold text-gray-800 mb-8">
          <span>{p.text}</span>
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/[^0-9-]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            inputMode="numeric"
            disabled={feedback !== 'none'}
            className={`w-32 rounded-2xl border-2 px-3 py-2 text-center outline-none transition ${
              feedback === 'ok'
                ? 'border-mint-500 text-mint-600'
                : feedback === 'no'
                  ? 'border-red-400 text-red-500'
                  : 'border-gray-200 focus:border-brand-400 text-gray-800'
            }`}
            placeholder="?"
          />
        </div>

        {feedback === 'no' && (
          <div className="mb-4 text-lg text-red-500">正确答案:{p.answer}</div>
        )}

        <button
          onClick={submit}
          disabled={feedback !== 'none' || input.trim() === ''}
          className="rounded-2xl bg-brand-500 px-10 py-3 font-bold text-white active:scale-95 transition disabled:opacity-40"
        >
          {feedback === 'none' ? '确定' : feedback === 'ok' ? '✓ 答对了' : '看下一题'}
        </button>
      </div>
    </div>
  )
}
