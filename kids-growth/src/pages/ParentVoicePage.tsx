import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mic, Square, Play, Trash2, Check } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { getAgeStage } from '../lib/ageStage'
import { topEnglishSentences } from '../lib/voiceTargets'
import { BUILTIN_PACKS, type BuiltinPackData, type BuiltinPicCard, type BuiltinWordCard } from '../lib/learningContent'
import { isRecordingSupported, startRecording, type Recorder } from '../lib/pronounce'
import {
  hasMyVoice,
  saveMyVoice,
  deleteMyVoice,
  listMyVoices,
  loadVoiceIndex,
} from '../db/voices'
import { playParentVoice } from '../lib/audio'
import type { VoiceClip } from '../types'

/**
 * 家长录音室 —— 网页版英语声音的**真正解法**。
 *
 * 前面为英语声音做过的所有事(七八个在线音源、健康度、自检面板)都绕不过
 * 同一堵墙:英语**整句**没有可用的免费音源。有道那套是词典,只有单词有真人
 * 录音;别的免费接口要么不给整句,要么读出来是机器拼的。
 *
 * 家长自己录一遍就全解决了:不依赖网络、不会被接口下线、发音稳定,
 * 而且是**爸爸的声音**。录完之后孩子点「听」放的就是它,排在所有音源前面。
 *
 * 这一页只做三件事,因为家长的耐心很有限:
 * 1. 告诉他**先录哪些**(按出现频次和句子长短排好序,不用他自己挑)
 * 2. 一句一个按钮,按住录、松开存,不需要理解任何概念
 * 3. 已录的一眼能看出来,能试听、能重录、能删
 */

type Tab = 'todo' | 'packs' | 'mine'

export function ParentVoicePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const [tab, setTab] = useState<Tab>('todo')
  const [recorder, setRecorder] = useState<Recorder | null>(null)
  const [recordingText, setRecordingText] = useState<string>('')
  /** 改一下就让整页重新判断「录了没有」—— 索引是内存里的,不会自己通知 React */
  const [tick, setTick] = useState(0)
  const [mine, setMine] = useState<VoiceClip[]>([])
  const [packKey, setPackKey] = useState<string>('')
  const [packData, setPackData] = useState<BuiltinPackData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    void loadVoiceIndex().then(() => setTick((n) => n + 1))
  }, [])

  useEffect(() => {
    void listMyVoices('parent').then(setMine)
  }, [tick])

  useEffect(() => {
    if (!packKey) {
      setPackData(null)
      return
    }
    const meta = BUILTIN_PACKS.find((p) => p.key === packKey)
    if (!meta) return
    void meta.load().then(setPackData)
  }, [packKey])

  const stage = child ? getAgeStage(child.birthdate) : 'toddler'
  const todo = useMemo(() => topEnglishSentences(stage, 20), [stage])

  if (!child || !currentChildId) return <div className="pt-20 text-center text-3xl">🎤</div>

  const supported = isRecordingSupported()

  const start = async (text: string) => {
    setErr('')
    try {
      const r = await startRecording()
      setRecorder(r)
      setRecordingText(text)
    } catch {
      // 最常见的原因是没给麦克风权限,或页面不是 https —— 说清楚,别只说「失败」
      setErr('打不开麦克风。请在浏览器里允许本页使用麦克风(网址栏左边的图标),并确认是 https 打开的。')
    }
  }

  const stop = async () => {
    if (!recorder) return
    const text = recordingText
    const r = recorder
    setRecorder(null)
    setRecordingText('')
    const blob = await r.stop()
    // 重录直接覆盖原存档 —— 家长重录通常就是因为上一条不满意
    await saveMyVoice(text, blob, 'parent')
    setTick((n) => n + 1)
  }

  const cancel = () => {
    recorder?.cancel()
    setRecorder(null)
    setRecordingText('')
  }

  const remove = async (text: string) => {
    await deleteMyVoice(text, 'parent')
    setTick((n) => n + 1)
  }

  /** 一行:句子 + 录/停 + 试听 + 删 */
  const Row = ({ text, sub }: { text: string; sub?: string }) => {
    const done = hasMyVoice(text, 'parent')
    const busy = recordingText === text
    return (
      <div
        className={`flex items-center gap-2 rounded-2xl p-3 ${done ? 'bg-mint-400/10' : 'bg-white/70'}`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800">{text}</div>
          {sub && <div className="truncate text-xs text-gray-400">{sub}</div>}
        </div>
        {done && !busy && (
          <>
            <button
              onClick={() => void playParentVoice(text)}
              className="rounded-full bg-brand-100 p-2 text-brand-600 active:scale-95"
              aria-label="试听"
            >
              <Play size={16} />
            </button>
            <button
              onClick={() => void remove(text)}
              className="rounded-full bg-gray-100 p-2 text-gray-400 active:scale-95"
              aria-label="删除"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
        {busy ? (
          <button
            onClick={() => void stop()}
            className="flex items-center gap-1 rounded-full bg-red-500 px-3 py-2 text-sm font-bold text-white active:scale-95"
          >
            <Square size={14} /> 停
          </button>
        ) : (
          <button
            disabled={!supported || !!recorder}
            onClick={() => void start(text)}
            className="flex items-center gap-1 rounded-full bg-brand-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-40 active:scale-95"
          >
            <Mic size={14} /> {done ? '重录' : '录'}
          </button>
        )}
      </div>
    )
  }

  const doneCount = todo.filter((s) => hasMyVoice(s.text, 'parent')).length

  return (
    <div className="pt-4 pb-12">
      <div className="mb-2 flex items-center gap-3">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">英语声音 · 家长录音</h1>
      </div>
      <p className="mb-4 text-sm text-gray-400">
        英语整句没有可用的免费真人音源。你录一遍,孩子点「听」放的就是你的声音 ——
        排在所有网络音源前面,断网也能响。录音只存在这台设备上,不会上传。
      </p>

      {!supported && (
        <div className="mb-4 rounded-2xl bg-orange-100/70 p-3 text-sm text-orange-700">
          这个浏览器不支持录音。请用 Chrome / Edge / Safari 打开,并确认网址是 https 开头。
        </div>
      )}
      {err && <div className="mb-4 rounded-2xl bg-red-100 p-3 text-sm text-red-700">{err}</div>}
      {recorder && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-red-50 p-3">
          <div className="min-w-0 flex-1 truncate text-sm text-red-700">
            正在录:{recordingText}
          </div>
          <button onClick={cancel} className="ml-2 text-xs text-gray-400 underline">
            取消
          </button>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {(
          [
            ['todo', `先录这些 ${doneCount}/${todo.length}`],
            ['packs', '按内容包'],
            ['mine', `已录 ${mine.length}`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === k ? 'bg-brand-500 text-white' : 'bg-white/70 text-gray-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'todo' && (
        <div className="space-y-2">
          <p className="px-1 text-xs text-gray-400">
            按「出现次数最多、句子最短、最简单档优先」排好了 —— 从上往下录,
            录满这 20 句,孩子日常碰到的英语大半就都是你的声音了。
          </p>
          {todo.map((s) => (
            <Row key={s.text} text={s.text} sub={`${s.where.join(' / ')}${s.times > 1 ? ` · 出现 ${s.times} 次` : ''}`} />
          ))}
        </div>
      )}

      {tab === 'packs' && (
        <div className="space-y-3">
          <select
            value={packKey}
            onChange={(e) => setPackKey(e.target.value)}
            className="w-full rounded-2xl border-2 border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
          >
            <option value="">选一个内容包…</option>
            {BUILTIN_PACKS.filter((p) => p.itemType === 'pic' || p.itemType === 'word').map((p) => (
              <option key={p.key} value={p.key}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
          {packData && (
            <div className="space-y-2">
              {packTexts(packData).map((t) => (
                <Row key={t} text={t} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <div className="space-y-2">
          {mine.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">还没有录音</p>
          )}
          {mine.map((v) => (
            <Row key={v.key} text={v.text} />
          ))}
          {mine.length > 0 && (
            <p className="px-1 pt-2 text-xs text-gray-400">
              <Check size={12} className="inline" /> 这些句子在任何地方出现,放的都是你的声音。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** 内容包里要录的文本:英语内容录英文(中文有在线音源,不用占家长的时间) */
function packTexts(pack: BuiltinPackData): string[] {
  const out: string[] = []
  for (const c of pack.cards) {
    if (pack.itemType === 'pic') {
      const p = c as BuiltinPicCard
      if (p.en) out.push(p.en)
    } else if (pack.itemType === 'word') {
      const w = c as BuiltinWordCard
      if (w.w) out.push(w.w)
    }
  }
  return Array.from(new Set(out))
}
