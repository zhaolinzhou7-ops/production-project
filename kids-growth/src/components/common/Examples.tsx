import { useEffect, useState } from 'react'
import { Volume2, Mic, Square, Play } from 'lucide-react'
import { examplesFor, pluralPhrase } from '../../lib/examples'
import { playWordAudio, hasParentVoice } from '../../lib/audio'
import { isRecordingSupported, startRecording, playRecording, type Recorder } from '../../lib/pronounce'
import { saveMyVoice, getMyVoice, hasMyVoice } from '../../db/voices'

/**
 * 例句面板 —— 一个词学完之后,给他这个词**待在句子里的样子**。
 *
 * 为什么必须有:孤立地背单词是效率最低的一种学法。孩子记住 "apple" 之后
 * 并不会用它 —— 他没见过它在句子里长什么样。而
 * **"an apple" → "I see an apple." → "The apple is here."** 这一串,
 * 才是他真正能开口说出来的东西。
 *
 * 三件事都在这一块里:听(家长录过的优先放家长的声音)、说(录下来)、
 * 回放(录音存在本机,退出重进还在)。
 *
 * 全程纯英文:不显示中文释义。这个年纪要建立的是「英语—画面」的直接联系,
 * 中间插一道翻译,他会养成「先翻成中文再理解」的习惯,那个习惯以后要花好几年去掉。
 */
export function Examples({
  word,
  packKey,
  topic,
  emoji,
  zh,
}: {
  /** 要学的那个英文词 */
  word: string
  /** 内容包 key —— 决定这个词按哪一类套句型(见 lib/examples) */
  packKey: string
  /** 字母卡专用:A 对应的那个词(Apple) */
  topic?: string
  /** 这张卡的大图,帮他把句子和画面对上 */
  emoji?: string
  /** 中文意思 —— 只给家长看(默认藏起来) */
  zh?: string
}) {
  const [recordingOf, setRecordingOf] = useState('')
  const [rec, setRec] = useState<Recorder | null>(null)
  /*
    纯英文有一个副作用:**家长也看不懂了**。
    而这个年纪判「读对了没有」的人是家长 —— 他得知道这个词是什么意思。
    所以给家长一个小开关,默认关着。
  */
  const [showZh, setShowZh] = useState(false)
  /** 改一下就重新渲染:录音索引是同步读的,不会自己通知 React */
  const [tick, setTick] = useState(0)

  // 换一个词就把展开状态收回去,免得下一张卡一进来就摆着中文
  useEffect(() => {
    setShowZh(false)
  }, [word])

  const lines: string[] = examplesFor(word, packKey, topic)
  const phrase = pluralPhrase(word, packKey)
  // 可数名词额外给一条复数组词(two cats)—— 单复数是这个年纪最容易漏掉的一环
  if (phrase && lines.length < 4) lines.splice(1, 0, phrase)

  if (lines.length === 0) return null

  const toggle = async (line: string) => {
    if (recordingOf === line) {
      const r = rec
      setRec(null)
      setRecordingOf('')
      if (!r) return
      const blob = await r.stop()
      // 存成 kid 那一份:绝不会被当成范读放给他听
      await saveMyVoice(line, blob, 'kid')
      setTick((n) => n + 1)
      return
    }
    if (recordingOf) return
    try {
      const r = await startRecording()
      setRec(r)
      setRecordingOf(line)
    } catch {
      setRecordingOf('')
    }
  }

  /** 三条连起来读一遍:组词 → 句子,一次听完整 */
  const playAll = () => {
    lines.forEach((line, i) => {
      // 每条之间留够时间,不然会互相打断
      setTimeout(() => playWordAudio(line, 2, 1), i * 2200)
    })
  }

  return (
    <div className="mt-6 w-full max-w-md rounded-3xl bg-white/70 p-4" key={tick}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">Read it 读一读</span>
        <div className="flex items-center gap-2">
          <button
            onClick={playAll}
            className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-600 active:scale-95"
          >
            ▶ 连读
          </button>
          {zh && (
            <button
              onClick={() => setShowZh((v) => !v)}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-400 active:scale-95"
            >
              {showZh ? zh : '中文(家长)'}
            </button>
          )}
        </div>
      </div>
      {emoji && <div className="mb-1 text-center text-5xl leading-none">{emoji}</div>}
      {lines.map((line) => {
        const mine = hasMyVoice(line, 'kid')
        const busy = recordingOf === line
        return (
          <div key={line} className="flex items-center gap-2 border-b border-black/5 py-2 last:border-0">
            <button
              onClick={() => playWordAudio(line, 2, 1)}
              className="min-w-0 flex-1 text-left text-lg text-gray-800 active:opacity-60"
            >
              {line}
              {hasParentVoice(line) && (
                <span className="ml-2 align-middle text-[10px] text-brand-400">爸爸妈妈的声音</span>
              )}
            </button>
            <button
              onClick={() => playWordAudio(line, 2, 1)}
              className="rounded-full bg-brand-100 p-2 text-brand-600 active:scale-90"
              aria-label="听一听"
            >
              <Volume2 size={16} />
            </button>
            {isRecordingSupported() && (
              <button
                onClick={() => void toggle(line)}
                className={`rounded-full p-2 active:scale-90 ${
                  busy ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-500'
                }`}
                aria-label={busy ? '停止录音' : '录我读的'}
              >
                {busy ? <Square size={16} /> : <Mic size={16} />}
              </button>
            )}
            {mine && !busy && (
              <button
                onClick={() => void getMyVoice(line, 'kid').then((b) => b && playRecording(b))}
                className="rounded-full bg-mint-400/25 p-2 text-mint-600 active:scale-90"
                aria-label="回放"
              >
                <Play size={16} />
              </button>
            )}
          </div>
        )
      })}
      <p className="mt-2 text-[11px] text-gray-400">
        点句子听一遍,🎤 录下自己读的,▶ 放出来比一比
      </p>
    </div>
  )
}
