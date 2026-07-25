import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { ArrowLeft, Mic, Volume2, Play, Square, Disc, Turtle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { finishDrill } from '../db/study'
import { speak, recognizeOnce, isSpeechRecognitionSupported, normalizeForCompare } from '../lib/audio'
import { scorePronunciation, isRecordingSupported, startRecording, playRecording, type Recorder } from '../lib/pronounce'
import { sfxCorrect, sfxFanfare, sfxSticker } from '../lib/sfx'
import { qualifiesForSticker, awardSticker, type StickerDef } from '../lib/stickers'
import { feedPet, type FeedResult } from '../lib/pets'
import { dialogsFor, retellSentencesFor, RHYMES, type Dialog, type Rhyme } from '../lib/talkContent'
import { getMelody, playMelodyLine, stopMelody } from '../lib/melody'

type Tab = 'dialog' | 'retell' | 'rhyme'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 说英文(浏览器 TTS;句子无免费真人音源,如实用合成音) */
function sayEn(text: string, rate = 0.85): void {
  speak(text, 'en-US', rate)
}

/** 打分:整句相似度;若识别文本包含期望句(去标点空格),直接满星 */
function scoreReply(recognized: string, expect: string) {
  const base = scorePronunciation(recognized, expect)
  if (normalizeForCompare(recognized).includes(normalizeForCompare(expect)) && normalizeForCompare(expect)) {
    return { ...base, stars: 3 as const, message: '棒极了!说得很标准' }
  }
  return base
}

export function EnglishTalkPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()

  const [tab, setTab] = useState<Tab>('dialog')

  // ---- 对话状态 ----
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [turnIdx, setTurnIdx] = useState(0)
  const [turnStars, setTurnStars] = useState<number[]>([])
  const [listening, setListening] = useState(false)
  const [msg, setMsg] = useState('')
  const [lastStars, setLastStars] = useState(-1)
  const [showHint, setShowHint] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [done, setDone] = useState<{ correct: number; total: number; points: number; capped: boolean } | null>(null)
  const [wonSticker, setWonSticker] = useState<StickerDef | null>(null)
  const [petResult, setPetResult] = useState<FeedResult | null>(null)

  // ---- 复述状态 ----
  const [retells] = useState(() => shuffle(retellSentencesFor(stage)).slice(0, 8))
  const myDialogs = dialogsFor(stage)
  const [retellStarted, setRetellStarted] = useState(false)
  const [rIdx, setRIdx] = useState(0)
  const [rStars, setRStars] = useState<number[]>([])
  const [recBlob, setRecBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<Recorder | null>(null)

  // ---- 儿歌状态 ----
  const [rhyme, setRhyme] = useState<Rhyme | null>(null)
  const [lineIdx, setLineIdx] = useState(-1)
  const [rhymeMode, setRhymeMode] = useState<'melody' | 'read'>('melody')
  const rhymeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recognitionOk = isSpeechRecognitionSupported()

  const resetPerTurn = () => {
    setMsg('')
    setLastStars(-1)
    setShowHint(false)
    setRecBlob(null)
    setListening(false)
  }

  const settle = useCallback(
    async (kind: string, stars: number[], total: number) => {
      if (!currentChildId) return
      const correct = stars.filter((s) => s >= 2).length
      const res = await finishDrill({
        childId: currentChildId,
        kind,
        total,
        correct,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      })
      setDone({ correct, total, points: res.pointsAwarded, capped: res.capped })
      if (qualifiesForSticker(correct, total)) {
        const win = await awardSticker(currentChildId)
        if (win) {
          setWonSticker(win)
          setTimeout(sfxSticker, 500)
        }
      }
      const fed = await feedPet(currentChildId, correct)
      if (fed) setPetResult(fed)
      sfxFanfare()
      if (tone === 'playful') confetti({ particleCount: 100, spread: 75, origin: { y: 0.7 } })
    },
    [currentChildId, startedAt, tone],
  )

  // ---- 对话逻辑 ----
  const startDialog = (d: Dialog) => {
    setDialog(d)
    setTurnIdx(0)
    setTurnStars([])
    setDone(null)
    setWonSticker(null)
    setPetResult(null)
    setStartedAt(Date.now())
    resetPerTurn()
    setTimeout(() => sayEn(d.turns[0].bot), 400)
  }

  const nextTurn = (stars: number) => {
    if (!dialog) return
    const newStars = [...turnStars, stars]
    setTurnStars(newStars)
    if (stars >= 2) sfxCorrect()
    if (turnIdx + 1 >= dialog.turns.length) {
      void settle('talk', newStars, dialog.turns.length)
    } else {
      const ni = turnIdx + 1
      setTurnIdx(ni)
      resetPerTurn()
      setTimeout(() => sayEn(dialog.turns[ni].bot), 500)
    }
  }

  const listenDialog = async () => {
    if (!dialog) return
    const turn = dialog.turns[turnIdx]
    setListening(true)
    setMsg('聆听中…请用英语回答')
    try {
      const r = await recognizeOnce(turn.expect, 'en-US')
      const score = scoreReply(r.transcript, turn.expect)
      setListening(false)
      setLastStars(score.stars)
      setMsg(score.message + (r.transcript ? `(听到:${r.transcript})` : ''))
      if (score.stars >= 2) setTimeout(() => nextTurn(score.stars), 1400)
    } catch {
      setListening(false)
      setMsg('没听清,再试一次;也可以点「我说对了」继续')
    }
  }

  // ---- 复述逻辑 ----
  const startRetellRound = () => {
    setDone(null)
    setWonSticker(null)
    setPetResult(null)
    setRetellStarted(true)
    setRIdx(0)
    setRStars([])
    setStartedAt(Date.now())
    resetPerTurn()
    setTimeout(() => sayEn(retells[0].en), 400)
  }

  const nextRetell = (stars: number) => {
    const newStars = [...rStars, stars]
    setRStars(newStars)
    if (stars >= 2) sfxCorrect()
    if (rIdx + 1 >= retells.length) {
      void settle('retell', newStars, retells.length)
    } else {
      const ni = rIdx + 1
      setRIdx(ni)
      resetPerTurn()
      setTimeout(() => sayEn(retells[ni].en), 500)
    }
  }

  const listenRetell = async () => {
    const sent = retells[rIdx]
    setListening(true)
    setMsg('聆听中…把刚才的句子复述出来')
    try {
      const r = await recognizeOnce(sent.en, 'en-US')
      const score = scoreReply(r.transcript, sent.en)
      setListening(false)
      setLastStars(score.stars)
      setMsg(score.message + (r.transcript ? `(听到:${r.transcript})` : ''))
      if (score.stars >= 2) setTimeout(() => nextRetell(score.stars), 1400)
    } catch {
      setListening(false)
      setMsg('没听清,再试一次;也可以点「我说对了」继续')
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      setRecording(false)
      const rec = recorderRef.current
      recorderRef.current = null
      if (rec) setRecBlob(await rec.stop())
      return
    }
    try {
      setRecBlob(null)
      recorderRef.current = await startRecording()
      setRecording(true)
    } catch {
      setMsg('麦克风不可用,检查浏览器授权')
    }
  }

  // ---- 儿歌逻辑:逐句朗读 + 高亮 ----
  const playRhyme = useCallback(
    (r: Rhyme, from = 0) => {
      if (rhymeTimer.current) clearTimeout(rhymeTimer.current)
      stopMelody()
      setRhyme(r)
      setRhymeMode('read')
      setLineIdx(from)
      sayEn(r.lines[from], 0.8)
      const step = (i: number) => {
        rhymeTimer.current = setTimeout(() => {
          if (i + 1 < r.lines.length) {
            setLineIdx(i + 1)
            sayEn(r.lines[i + 1], 0.8)
            step(i + 1)
          } else {
            setLineIdx(-1)
          }
        }, Math.max(2600, r.lines[i].length * 90))
      }
      step(from)
    },
    [],
  )

  // ---- 儿歌逻辑:音乐盒旋律 + 逐行高亮(无旋律数据时回退朗读) ----
  const playRhymeMelody = useCallback(
    (r: Rhyme, from = 0) => {
      const melody = getMelody(r.key)
      if (!melody) {
        playRhyme(r, from)
        return
      }
      if (rhymeTimer.current) clearTimeout(rhymeTimer.current)
      stopMelody()
      setRhyme(r)
      setRhymeMode('melody')
      const step = (i: number) => {
        setLineIdx(i)
        const durMs = playMelodyLine(melody[i] ?? [], 100)
        rhymeTimer.current = setTimeout(() => {
          if (i + 1 < r.lines.length) step(i + 1)
          else setLineIdx(-1)
        }, durMs + 350)
      }
      step(from)
    },
    [playRhyme],
  )

  const stopRhymePlayback = useCallback(() => {
    if (rhymeTimer.current) clearTimeout(rhymeTimer.current)
    stopMelody()
    setLineIdx(-1)
  }, [])

  useEffect(() => () => {
    if (rhymeTimer.current) clearTimeout(rhymeTimer.current)
    stopMelody()
  }, [])

  if (!child || !currentChildId) return null

  const TabBtn = ({ t, label }: { t: Tab; label: string }) => (
    <button
      onClick={() => {
        setTab(t)
        setDone(null)
        setDialog(null)
        setRhyme(null)
        setRetellStarted(false)
        resetPerTurn()
        stopRhymePlayback()
      }}
      className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
        tab === t ? 'bg-brand-500 text-white' : 'bg-white/70 text-gray-500'
      }`}
    >
      {label}
    </button>
  )

  // 结算视图(对话/复述共用)
  if (done) {
    const pct = done.total > 0 ? Math.round((done.correct / done.total) * 100) : 0
    const sessStars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct > 0 ? 1 : 0
    return (
      <div className="pt-12 text-center px-6">
        <div className="text-6xl mb-2">{pct >= 80 ? '🌟' : '💪'}</div>
        <h1 className="text-2xl font-bold text-gray-800">说完啦!</h1>
        <div className="mt-2 text-3xl tracking-wider">
          {'⭐'.repeat(sessStars)}
          <span className="opacity-30">{'⭐'.repeat(3 - sessStars)}</span>
        </div>
        <div className="mt-5 rounded-3xl bg-white/70 p-6 shadow-sm max-w-xs mx-auto">
          <div className="flex justify-around">
            <div>
              <div className="text-2xl font-bold text-gray-800">{done.correct}/{done.total}</div>
              <div className="text-xs text-gray-400">说得好</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-sun-500">+{done.points}</div>
              <div className="text-xs text-gray-400">积分</div>
            </div>
          </div>
        </div>
        {done.capped && (
          <p className="mt-2 text-[11px] text-gray-400">今天的学习积分已经拿满啦,继续练习照样有记录,明天再来赚积分~</p>
        )}
        {wonSticker && (
          <div className="mt-5 mx-auto max-w-xs rounded-3xl bg-gradient-to-br from-sun-400/25 to-brand-100 p-5">
            <div className="text-xs font-bold text-sun-500 mb-1">🎁 获得新贴纸!</div>
            <div className="animate-sticker-pop text-6xl">{wonSticker.emoji}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">{wonSticker.name}</div>
          </div>
        )}
        {petResult && !petResult.evolved && (
          <div className="mt-4 mx-auto max-w-xs rounded-3xl bg-mint-400/15 p-4 text-sm text-gray-700">
            {petResult.pet.stage.emoji} {petResult.pet.stage.label}吃了 {done.correct} 口
          </div>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={() => {
              setDone(null)
              setDialog(null)
              setRetellStarted(false)
            }}
            className="rounded-2xl bg-white/80 px-6 py-3 font-bold text-gray-600 active:scale-95 transition"
          >
            再来
          </button>
          <button onClick={() => navigate('/learn')} className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 transition">
            完成
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/learn')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-xl font-bold text-gray-800">英语小剧场 🎭</h1>
      </div>

      <div className="mb-4 flex gap-2">
        <TabBtn t="dialog" label="🗣 对话" />
        <TabBtn t="retell" label="👂 听力复述" />
        <TabBtn t="rhyme" label="🎵 儿歌" />
      </div>

      {!recognitionOk && tab !== 'rhyme' && (
        <div className="mb-3 rounded-2xl bg-orange-50 p-3 text-xs text-orange-500">
          此浏览器不支持语音识别打分(建议用 Chrome/Safari);仍可听句子、录音回放,并用「我说对了」按钮继续。
        </div>
      )}

      {/* ---- 对话 ---- */}
      {tab === 'dialog' && !dialog && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">
            共 {myDialogs.length} 个场景,选一个跟着机器人一句一句说(固定剧本,可反复练)
          </p>
          {(['easy', 'harder'] as const).map((lv) => {
            const group = myDialogs.filter((d) => d.level === lv)
            if (group.length === 0) return null
            return (
              <div key={lv} className="space-y-2">
                <div className="pt-2 text-[11px] font-bold text-gray-400">
                  {lv === 'easy' ? '🌱 入门 · 短对话' : '🚀 进阶 · 长对话'}
                </div>
                {group.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => startDialog(d)}
                    className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-left shadow-sm active:scale-[0.99] transition"
                  >
                    <span className="text-2xl">{d.icon}</span>
                    <span className="flex-1 font-bold text-gray-800">{d.title}</span>
                    <span className="text-xs text-gray-400">{d.turns.length} 句</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'dialog' && dialog && (
        <div className="flex flex-col items-center px-2 text-center">
          <div className="mb-1 text-xs text-gray-400">
            {dialog.title} · 第 {turnIdx + 1}/{dialog.turns.length} 句
          </div>
          {dialog.turns[turnIdx].emoji && (
            <div className="my-3 text-7xl">{dialog.turns[turnIdx].emoji}</div>
          )}
          {/* 机器人气泡 */}
          <div className="w-full max-w-sm rounded-3xl rounded-tl-md bg-white/85 p-4 text-left shadow-sm">
            <div className="text-lg font-bold text-gray-800">🤖 {dialog.turns[turnIdx].bot}</div>
            <div className="mt-0.5 text-xs text-gray-400">{dialog.turns[turnIdx].botZh}</div>
            <button
              onClick={() => sayEn(dialog.turns[turnIdx].bot)}
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-600 active:scale-95"
            >
              <Volume2 size={13} /> 再听一遍
            </button>
          </div>

          {/* 提示 */}
          <button onClick={() => setShowHint((v) => !v)} className="mt-3 text-xs text-gray-400 underline">
            {showHint ? '收起提示' : '💡 不会说?看提示'}
          </button>
          {showHint && (
            <div className="mt-2 w-full max-w-sm rounded-2xl bg-sun-400/15 p-3">
              <div className="font-bold text-gray-700">{dialog.turns[turnIdx].expect}</div>
              <div className="text-xs text-gray-400">{dialog.turns[turnIdx].expectZh}</div>
              <button
                onClick={() => sayEn(dialog.turns[turnIdx].expect)}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs text-gray-600 active:scale-95"
              >
                <Volume2 size={12} /> 听答案示范
              </button>
            </div>
          )}

          {recognitionOk && (
            <button
              onClick={() => void listenDialog()}
              disabled={listening}
              className={`mt-5 inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 font-bold text-white active:scale-95 ${
                listening ? 'bg-orange-400' : 'bg-brand-500'
              }`}
            >
              <Mic size={18} /> {listening ? '在听…' : '按一下,开始说'}
            </button>
          )}
          {lastStars >= 0 && (
            <div className="mt-3 text-3xl tracking-wider">
              {'⭐'.repeat(lastStars)}
              <span className="opacity-30">{'⭐'.repeat(3 - lastStars)}</span>
            </div>
          )}
          {msg && <div className="mt-2 text-sm text-gray-500">{msg}</div>}
          <div className="mt-5 flex gap-3">
            <button onClick={() => nextTurn(0)} className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-500 active:scale-95">
              跳过
            </button>
            <button onClick={() => nextTurn(3)} className="rounded-xl bg-mint-100 px-4 py-2 text-sm text-mint-600 active:scale-95">
              我说对了
            </button>
          </div>
        </div>
      )}

      {/* ---- 听力复述 ---- */}
      {tab === 'retell' && !retellStarted ? (
        <div className="text-center">
          <div className="rounded-3xl bg-white/70 p-6 shadow-sm">
            <div className="text-4xl mb-2">👂</div>
            <p className="font-bold text-gray-700 mb-1">听一句 → 复述一句</p>
            <p className="text-xs text-gray-400 mb-4">共 {retells.length} 句,可以慢速重听;说得好加积分喂宠物</p>
            <button onClick={startRetellRound} className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
              开始
            </button>
          </div>
        </div>
      ) : tab === 'retell' ? (
        <div className="flex flex-col items-center px-2 text-center">
          <div className="mb-3 text-xs text-gray-400">第 {rIdx + 1}/{retells.length} 句</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => sayEn(retells[rIdx].en)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-600 active:scale-95"
            >
              <Volume2 size={15} /> 再听
            </button>
            <button
              onClick={() => sayEn(retells[rIdx].en, 0.6)}
              className="inline-flex items-center gap-1.5 rounded-full bg-mint-400/25 px-4 py-2 text-sm font-medium text-mint-600 active:scale-95"
            >
              <Turtle size={15} /> 慢速
            </button>
            {isRecordingSupported() && (
              <button
                onClick={() => void toggleRecord()}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium active:scale-95 ${
                  recording ? 'bg-orange-100 text-orange-600' : 'bg-brand-100 text-brand-600'
                }`}
              >
                {recording ? <Square size={15} /> : <Disc size={15} />}
                {recording ? '停止' : '录音'}
              </button>
            )}
            {recBlob && (
              <button
                onClick={() => playRecording(recBlob)}
                className="inline-flex items-center gap-1.5 rounded-full bg-mint-400/25 px-4 py-2 text-sm font-medium text-mint-600 active:scale-95"
              >
                <Play size={15} /> 回放
              </button>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">{retells[rIdx].zh}</div>

          {recognitionOk && (
            <button
              onClick={() => void listenRetell()}
              disabled={listening}
              className={`mt-6 inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 font-bold text-white active:scale-95 ${
                listening ? 'bg-orange-400' : 'bg-brand-500'
              }`}
            >
              <Mic size={18} /> {listening ? '在听…' : '复述这句'}
            </button>
          )}
          {lastStars >= 0 && (
            <div className="mt-3 text-3xl tracking-wider">
              {'⭐'.repeat(lastStars)}
              <span className="opacity-30">{'⭐'.repeat(3 - lastStars)}</span>
            </div>
          )}
          {msg && <div className="mt-2 text-sm text-gray-500">{msg}</div>}
          <div className="mt-5 flex gap-3">
            <button onClick={() => nextRetell(0)} className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-500 active:scale-95">
              跳过
            </button>
            <button onClick={() => nextRetell(3)} className="rounded-xl bg-mint-100 px-4 py-2 text-sm text-mint-600 active:scale-95">
              我说对了
            </button>
          </div>
        </div>
      ) : null}

      {/* ---- 儿歌 ---- */}
      {tab === 'rhyme' && !rhyme && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-2">经典英文童谣:🎼 音乐盒旋律 + 📖 逐句朗读磨耳朵(公有领域曲目)</p>
          {RHYMES.map((r) => (
            <button
              key={r.key}
              onClick={() => playRhymeMelody(r)}
              className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-left shadow-sm active:scale-[0.99] transition"
            >
              <span className="text-2xl">{r.icon}</span>
              <span className="flex-1">
                <span className="block font-bold text-gray-800">{r.title}</span>
                <span className="text-xs text-gray-400">{r.titleZh}</span>
              </span>
              <Play size={16} className="text-brand-500" />
            </button>
          ))}
        </div>
      )}

      {tab === 'rhyme' && rhyme && (
        <div className="px-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-bold text-gray-800">{rhyme.icon} {rhyme.title}</div>
              <div className="text-xs text-gray-400">{rhyme.titleZh}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => playRhymeMelody(rhyme)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium active:scale-95 ${
                  rhymeMode === 'melody' ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-600'
                }`}
              >
                🎼 听旋律
              </button>
              <button
                onClick={() => playRhyme(rhyme)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium active:scale-95 ${
                  rhymeMode === 'read' ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-600'
                }`}
              >
                📖 朗读
              </button>
            </div>
          </div>
          <div className="rounded-3xl bg-white/75 p-4 shadow-sm space-y-1.5">
            {rhyme.lines.map((line, i) => (
              <button
                key={i}
                onClick={() => sayEn(line, 0.8)}
                className={`block w-full rounded-xl px-3 py-2 text-left text-[15px] transition ${
                  i === lineIdx ? 'bg-sun-400/25 font-bold text-gray-800' : 'text-gray-600'
                }`}
              >
                {line}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            旋律为简化音乐盒版(合成音,非真人演唱);点任意一句可单独重听;高亮行为正在播放的句子。
          </p>
          <button
            onClick={() => {
              setRhyme(null)
              stopRhymePlayback()
            }}
            className="mt-4 rounded-2xl bg-gray-100 px-6 py-2.5 text-sm font-bold text-gray-500 active:scale-95"
          >
            返回列表
          </button>
        </div>
      )}
    </div>
  )
}
