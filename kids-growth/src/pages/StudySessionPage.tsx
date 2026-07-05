import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { Volume2, ArrowRight, Mic } from 'lucide-react'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { getSessionCards, applyGrade, finishSession, type DueCard } from '../db/study'
import { evaluateAchievements } from '../db/achievements'
import { computeLevelInfo, getChildPointStats } from '../lib/points'
import { playWordAudio, recognizeOnce, isSpeechRecognitionSupported, normalizeForCompare } from '../lib/audio'
import { LevelUpModal } from '../components/points/LevelUpModal'
import { AchievementUnlockModal } from '../components/points/AchievementUnlockModal'
import type { Achievement, LevelStep, PracticeMode } from '../types'

type Phase = 'prompt' | 'reveal' | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function StudySessionPage() {
  const navigate = useNavigate()
  const { deckId, mode } = useParams<{ deckId: string; mode: PracticeMode }>()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, tone } = useCurrentChild()

  const [cards, setCards] = useState<DueCard[] | null>(null)
  const [pool, setPool] = useState<string[]>([]) // 干扰项池(同卡组的所有释义)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [correctCount, setCorrectCount] = useState(0)
  const [startedAt] = useState(Date.now())
  const [spellInput, setSpellInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [speakMsg, setSpeakMsg] = useState('')
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number } | null>(null)
  const [levelUp, setLevelUp] = useState<LevelStep | null>(null)
  const [newAch, setNewAch] = useState<Achievement | null>(null)

  useEffect(() => {
    if (!currentChildId || !deckId) return
    let alive = true
    void (async () => {
      const list = await getSessionCards(currentChildId, deckId, 12)
      const allCards = await db.cards.where('deckId').equals(deckId).toArray()
      if (!alive) return
      setPool(allCards.map((c) => c.back))
      setCards(list)
    })()
    return () => {
      alive = false
    }
  }, [currentChildId, deckId])

  const current = cards?.[idx]

  // 听音选义 4 选项
  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    const distractors = shuffle(pool.filter((b) => b !== current.card.back)).slice(0, 3)
    return shuffle([current.card.back, ...distractors])
  }, [current, mode, pool])

  // 进入每张卡时,认词/听音/跟读自动播放发音
  useEffect(() => {
    if (!current || phase !== 'prompt') return
    if (mode === 'listenChoose' || mode === 'speak') {
      void playWordAudio(current.card.audioText ?? current.card.front)
    }
  }, [current, phase, mode])

  const finish = useCallback(
    async (finalCorrect: number, total: number) => {
      if (!currentChildId || !deckId || !mode || !child) return
      const settings = await db.settings.get('singleton')
      const before = await getChildPointStats(currentChildId)
      const res = await finishSession({
        childId: currentChildId,
        deckId,
        mode,
        total,
        correct: finalCorrect,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      })
      setSummary({ correct: finalCorrect, total, points: res.pointsAwarded })
      // 升级判定
      if (settings) {
        const lvBefore = computeLevelInfo(before.xp, settings.levelLadder).level
        const lvAfter = computeLevelInfo(res.newXp, settings.levelLadder).level
        if (lvAfter.level > lvBefore.level) setLevelUp(lvAfter)
      }
      const unlocked = await evaluateAchievements(currentChildId)
      if (unlocked.length > 0) setNewAch(unlocked[0])
      if (tone === 'playful') confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } })
      setPhase('done')
    },
    [currentChildId, deckId, mode, child, startedAt, tone],
  )

  const advance = useCallback(
    async (wasCorrect: boolean) => {
      if (!current) return
      await applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
      const nextCorrect = correctCount + (wasCorrect ? 1 : 0)
      setCorrectCount(nextCorrect)
      const total = cards!.length
      if (idx + 1 >= total) {
        await finish(nextCorrect, total)
      } else {
        setIdx(idx + 1)
        setPhase('prompt')
        setSpellInput('')
        setPicked(null)
        setSpeakMsg('')
      }
    },
    [current, correctCount, cards, idx, finish],
  )

  if (!child || !currentChildId) return null

  if (cards && cards.length === 0 && phase !== 'done') {
    return (
      <div className="pt-16 text-center px-6">
        <div className="text-5xl mb-3">🎉</div>
        <p className="text-gray-600 font-medium">这个词库今天已经学完啦!</p>
        <p className="text-sm text-gray-400 mt-1">明天到期的卡片会自动出现</p>
        <button
          onClick={() => navigate('/learn')}
          className="mt-6 rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95 transition"
        >
          返回
        </button>
      </div>
    )
  }

  if (!cards) return <div className="pt-20 text-center text-3xl">📚</div>

  // 结算页
  if (phase === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    return (
      <>
        <div className="pt-12 text-center px-6">
          <div className="text-6xl mb-3">{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</div>
          <h1 className="text-2xl font-bold text-gray-800">练完啦!</h1>
          <div className="mt-6 rounded-3xl bg-white/70 p-6 shadow-sm max-w-xs mx-auto">
            <div className="flex justify-around">
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {summary.correct}/{summary.total}
                </div>
                <div className="text-xs text-gray-400">答对</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sun-500">+{summary.points}</div>
                <div className="text-xs text-gray-400">积分</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/learn')}
            className="mt-8 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 transition"
          >
            完成
          </button>
        </div>
        <LevelUpModal level={levelUp} tone={tone} onClose={() => setLevelUp(null)} />
        <AchievementUnlockModal achievement={newAch} tone={tone} onClose={() => setNewAch(null)} />
      </>
    )
  }

  if (!current) return <div className="pt-20 text-center text-3xl">📚</div>

  const progress = ((idx + (phase === 'reveal' ? 0.5 : 0)) / cards.length) * 100

  const AudioBtn = ({ big }: { big?: boolean }) => (
    <button
      onClick={() => void playWordAudio(current.card.audioText ?? current.card.front)}
      className={`inline-flex items-center justify-center rounded-full bg-brand-100 text-brand-600 active:scale-90 transition ${
        big ? 'h-16 w-16' : 'h-10 w-10'
      }`}
      aria-label="播放发音"
    >
      <Volume2 size={big ? 28 : 18} />
    </button>
  )

  return (
    <div className="pt-4 pb-10 min-h-screen flex flex-col">
      {/* 顶部进度 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/learn')} className="text-gray-400 text-sm">
          退出
        </button>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">
          {idx + 1}/{cards.length}
        </span>
      </div>

      {/* ---- 认词 ---- */}
      {mode === 'recognize' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="text-4xl font-bold text-gray-800 mb-2">{current.card.front}</div>
          {current.card.phonetic && <div className="text-sm text-gray-400 mb-3">/{current.card.phonetic}/</div>}
          <AudioBtn />
          {phase === 'reveal' ? (
            <>
              <div className="mt-6 text-lg text-brand-600 font-medium">{current.card.back}</div>
              <div className="mt-8 flex gap-3">
                <button onClick={() => void advance(false)} className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-500 active:scale-95">
                  没记住
                </button>
                <button onClick={() => void advance(true)} className="rounded-2xl bg-mint-500 px-8 py-3 font-bold text-white active:scale-95">
                  记住了
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setPhase('reveal')} className="mt-8 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
              看意思
            </button>
          )}
        </div>
      )}

      {/* ---- 听音选义 ---- */}
      {mode === 'listenChoose' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="mt-4 mb-8">
            <AudioBtn big />
          </div>
          <p className="text-sm text-gray-400 mb-4">听发音,选出正确的意思</p>
          <div className="w-full max-w-sm space-y-3">
            {options.map((opt) => {
              const isCorrect = opt === current.card.back
              const show = picked !== null
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    setTimeout(() => void advance(opt === current.card.back), 900)
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-left font-medium transition ${
                    show && isCorrect
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- 拼写 ---- */}
      {mode === 'spell' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="text-lg text-brand-600 font-medium mt-4 mb-2 text-center">{current.card.back}</div>
          <AudioBtn />
          <p className="text-sm text-gray-400 mt-4 mb-3">拼出这个单词</p>
          {phase === 'reveal' ? (
            <div className="flex flex-col items-center">
              <div
                className={`text-3xl font-bold ${
                  normalizeForCompare(spellInput) === normalizeForCompare(current.card.front)
                    ? 'text-mint-500'
                    : 'text-red-400'
                }`}
              >
                {current.card.front}
              </div>
              {normalizeForCompare(spellInput) !== normalizeForCompare(current.card.front) && (
                <div className="text-sm text-gray-400 mt-1">你写的:{spellInput || '(空)'}</div>
              )}
              <button
                onClick={() => void advance(normalizeForCompare(spellInput) === normalizeForCompare(current.card.front))}
                className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 flex items-center gap-1"
              >
                下一个 <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPhase('reveal')
              }}
              className="w-full max-w-xs flex flex-col items-center"
            >
              <input
                autoFocus
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 text-center text-2xl outline-none focus:border-brand-400"
                placeholder="输入英文"
              />
              <button type="submit" className="mt-5 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
                检查
              </button>
            </form>
          )}
        </div>
      )}

      {/* ---- 跟读 ---- */}
      {mode === 'speak' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="text-4xl font-bold text-gray-800 mb-2">{current.card.front}</div>
          {current.card.phonetic && <div className="text-sm text-gray-400 mb-1">/{current.card.phonetic}/</div>}
          <div className="text-brand-600 mb-4">{current.card.back}</div>
          <AudioBtn big />
          <p className="text-xs text-gray-400 mt-3">先听范读,再点麦克风跟读一遍</p>
          {isSpeechRecognitionSupported() ? (
            <>
              <button
                onClick={async () => {
                  setSpeakMsg('聆听中…请读出来')
                  try {
                    const r = await recognizeOnce(current.card.front, 'en-US')
                    if (r.matched) {
                      setSpeakMsg('👍 读得很棒!')
                      setTimeout(() => void advance(true), 800)
                    } else {
                      setSpeakMsg(`听到的是"${r.transcript || '…'}",再试一次或跳过`)
                    }
                  } catch {
                    setSpeakMsg('没听清,可再试或跳过(识别需联网)')
                  }
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95"
              >
                <Mic size={18} /> 跟读
              </button>
              {speakMsg && <div className="mt-3 text-sm text-gray-500">{speakMsg}</div>}
              <div className="mt-5 flex gap-3">
                <button onClick={() => void advance(false)} className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
                  跳过
                </button>
                <button onClick={() => void advance(true)} className="rounded-xl bg-mint-100 px-4 py-2 text-sm text-mint-600">
                  我读对了
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-orange-500 mb-3">此设备不支持语音识别,可自己跟读后点"读好了"</p>
              <button onClick={() => void advance(true)} className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
                读好了
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
