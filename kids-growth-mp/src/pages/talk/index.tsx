import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  dialogsFor,
  cartoonsFor,
  retellSentencesFor,
  RHYMES,
  type Dialog,
  type Cartoon,
  type RetellSentence,
  type Rhyme,
} from '../../core/talkContent'
import { getStage, adjustPoints } from '../../store/study'
import { playWordAudio, playEnglishSlow, stopAudio } from '../../lib/audio'
import { startRecord, stopRecord, playFile } from '../../lib/recorder'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { isSpeechAvailable } from '../../lib/speech'
import { scorePronunciation } from '../../core/score'
import CorrectBurst from '../../components/CorrectBurst'
import './index.scss'

type Tab = 'dialog' | 'retell' | 'cartoon' | 'rhyme'

const TABS: Array<[Tab, string, string]> = [
  ['dialog', '💬', '情景对话'],
  ['retell', '👂', '听力复述'],
  ['cartoon', '🎬', '动画短片'],
  ['rhyme', '🎵', '英文儿歌'],
]

/** 每完成一句跟读给的成长值 */
const POINTS_PER_LINE = 1

export default function Talk() {
  const [tab, setTab] = useState<Tab>('dialog')
  const stage = getStage()

  const dialogs = useMemo(() => dialogsFor(stage), [stage])
  const cartoons = useMemo(() => cartoonsFor(stage), [stage])
  const retells = useMemo(() => retellSentencesFor(stage), [stage])

  // 选中的条目(null = 显示列表)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [cartoon, setCartoon] = useState<Cartoon | null>(null)
  const [rhyme, setRhyme] = useState<Rhyme | null>(null)
  const [retellIdx, setRetellIdx] = useState(0)

  const [step, setStep] = useState(0)
  const [showZh, setShowZh] = useState(false)
  const [burst, setBurst] = useState(0)
  const [recPath, setRecPath] = useState('')
  const [recording, setRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const [stars, setStars] = useState(-1)
  const [msg, setMsg] = useState('')

  useDidShow(() => undefined)

  const resetLine = () => {
    setShowZh(false)
    setRecPath('')
    setRecording(false)
    setListening(false)
    setStars(-1)
    setMsg('')
  }

  const back = () => {
    stopAudio()
    setDialog(null)
    setCartoon(null)
    setRhyme(null)
    setStep(0)
    resetLine()
  }

  const reward = () => {
    adjustPoints(POINTS_PER_LINE)
    setBurst((b) => b + 1)
    try {
      Taro.vibrateShort({ type: 'light' })
    } catch {
      /* 忽略 */
    }
  }

  // ---------------- 跟读:录音 / 打分 / A-B 对比 ----------------

  const toggleRecord = () => {
    if (!recording) {
      setRecording(true)
      setMsg('录音中…读完再点一次')
      startRecord(
        (path) => {
          setRecPath(path)
          setRecording(false)
          setMsg('录好啦,可以对比听听')
        },
        () => {
          setRecording(false)
          setMsg('没录上,再试一次')
        },
      )
    } else {
      stopRecord()
    }
  }

  /** A/B 对比:先放范读,再放自己的,差别一听就出来 */
  const compareAB = (sentence: string) => {
    playWordAudio(sentence)
    setTimeout(() => {
      if (recPath) playFile(recPath)
    }, 2600)
  }

  const gradeSpeak = (target: string) => {
    if (!isSpeechAvailable()) {
      setMsg('这台设备没有语音识别,读完自己点「我读对了」就好')
      return
    }
    if (listening) {
      stopRecognize()
      setMsg('识别中…')
      return
    }
    setListening(true)
    setMsg('聆听中…读完点「读完了」')
    startRecognize('en_US', {
      onResult: (text) => {
        setListening(false)
        const r = scorePronunciation(text, target)
        setStars(r.stars)
        setMsg(r.message + (text ? `(听到:${text})` : ''))
        if (r.stars >= 2) reward()
      },
      onError: (m) => {
        setListening(false)
        setMsg(m + '(可以点「我读对了」)')
      },
    })
  }

  /** 一句台词下面通用的「听 / 慢 / 录 / 对比 / 打分」工具条 */
  const toolbar = (sentence: string) => (
    <View className='tools'>
      <View className='tool' onClick={() => playWordAudio(sentence)}>
        <Text className='tool__t'>🔊 听</Text>
      </View>
      <View className='tool' onClick={() => playEnglishSlow(sentence)}>
        <Text className='tool__t'>🐢 慢速</Text>
      </View>
      <View className={recording ? 'tool tool--rec' : 'tool'} onClick={toggleRecord}>
        <Text className='tool__t'>{recording ? '⏹ 停止' : '🎙 录我的'}</Text>
      </View>
      {recPath ? (
        <View className='tool' onClick={() => compareAB(sentence)}>
          <Text className='tool__t'>🆚 对比</Text>
        </View>
      ) : null}
      <View className='tool' onClick={() => gradeSpeak(sentence)}>
        <Text className='tool__t'>{listening ? '✅ 读完了' : '⭐ 打分'}</Text>
      </View>
    </View>
  )

  const feedback = () => (
    <View>
      {stars >= 0 ? (
        <Text className='stars'>
          {'⭐'.repeat(stars)}
          {'☆'.repeat(3 - stars)}
        </Text>
      ) : null}
      {msg ? <Text className='msg'>{msg}</Text> : null}
    </View>
  )

  // ---------------- 情景对话 ----------------

  const renderDialog = () => {
    if (!dialog) {
      return (
        <View className='list'>
          {dialogs.map((d) => (
            <View
              key={d.key}
              className='item'
              onClick={() => {
                setDialog(d)
                setStep(0)
                resetLine()
                playWordAudio(d.turns[0].bot)
              }}
            >
              <Text className='item__e'>{d.icon}</Text>
              <Text className='item__t'>{d.title}</Text>
              <Text className='item__n'>{d.turns.length} 轮</Text>
            </View>
          ))}
        </View>
      )
    }
    const turn = dialog.turns[step]
    const last = step >= dialog.turns.length - 1
    return (
      <View className='play'>
        <View className='play__bar'>
          <Text className='play__back' onClick={back}>
            ← 返回
          </Text>
          <Text className='play__t'>{dialog.title}</Text>
          <Text className='play__n'>
            {step + 1}/{dialog.turns.length}
          </Text>
        </View>

        <View className='bubble bubble--bot'>
          <Text className='bubble__e'>{turn.emoji ?? '🤖'}</Text>
          <View className='bubble__body'>
            <Text className='bubble__en' onClick={() => playWordAudio(turn.bot)}>
              {turn.bot}
            </Text>
            <Text className='bubble__zh'>{turn.botZh}</Text>
          </View>
        </View>

        <View className='bubble bubble--me'>
          <View className='bubble__body'>
            <Text className='bubble__lab'>轮到你说</Text>
            <Text className='bubble__en'>{turn.expect}</Text>
            {showZh ? (
              <Text className='bubble__zh'>{turn.expectZh}</Text>
            ) : (
              <Text className='bubble__peek' onClick={() => setShowZh(true)}>
                看中文提示
              </Text>
            )}
          </View>
        </View>

        {toolbar(turn.expect)}
        {feedback()}

        <View
          className='next'
          onClick={() => {
            if (last) {
              back()
              Taro.showToast({ title: '这段练完啦 🎉', icon: 'none' })
              return
            }
            const n = step + 1
            setStep(n)
            resetLine()
            playWordAudio(dialog.turns[n].bot)
          }}
        >
          <Text className='next__t'>{last ? '完成' : '下一句 →'}</Text>
        </View>
      </View>
    )
  }

  // ---------------- 听力复述 ----------------

  const renderRetell = () => {
    const s: RetellSentence | undefined = retells[retellIdx]
    if (!s) return <Text className='empty'>这个学段还没有复述内容</Text>
    return (
      <View className='play'>
        <Text className='play__n play__n--right'>
          {retellIdx + 1}/{retells.length}
        </Text>
        <View className='card2'>
          <Text className='card2__hint'>先听一遍,再照着说出来</Text>
          <View className='bigplay' onClick={() => playWordAudio(s.en)}>
            <Text className='bigplay__t'>🔊</Text>
          </View>
          {showZh ? (
            <View>
              <Text className='card2__en'>{s.en}</Text>
              <Text className='card2__zh'>{s.zh}</Text>
            </View>
          ) : (
            <Text className='card2__peek' onClick={() => setShowZh(true)}>
              看原句
            </Text>
          )}
        </View>

        {toolbar(s.en)}
        {feedback()}

        <View
          className='next'
          onClick={() => {
            setRetellIdx((i) => (i + 1) % retells.length)
            resetLine()
          }}
        >
          <Text className='next__t'>换一句 →</Text>
        </View>
      </View>
    )
  }

  // ---------------- 动画短片 ----------------

  const renderCartoon = () => {
    if (!cartoon) {
      return (
        <View className='list'>
          {cartoons.map((c) => (
            <View
              key={c.key}
              className='item'
              onClick={() => {
                setCartoon(c)
                setStep(0)
                resetLine()
                playWordAudio(c.lines[0].en)
              }}
            >
              <Text className='item__e'>{c.icon}</Text>
              <View className='item__meta'>
                <Text className='item__t'>{c.title}</Text>
                <Text className='item__sub'>{c.titleZh}</Text>
              </View>
              <Text className='item__n'>{c.lines.length} 幕</Text>
            </View>
          ))}
        </View>
      )
    }
    const line = cartoon.lines[step]
    const last = step >= cartoon.lines.length - 1
    return (
      <View className='play'>
        <View className='play__bar'>
          <Text className='play__back' onClick={back}>
            ← 返回
          </Text>
          <Text className='play__t'>{cartoon.titleZh}</Text>
          <Text className='play__n'>
            {step + 1}/{cartoon.lines.length}
          </Text>
        </View>

        {/* key 换了动画才会重播 */}
        <View className='stage' key={`${cartoon.key}-${step}`}>
          <Text className={`stage__e anim-${line.anim ?? 'pop'}`}>{line.scene}</Text>
        </View>

        <Text className='stage__en' onClick={() => playWordAudio(line.en)}>
          {line.en}
        </Text>
        <Text className='stage__zh'>{line.zh}</Text>

        {toolbar(line.en)}
        {feedback()}

        <View
          className='next'
          onClick={() => {
            if (last) {
              back()
              Taro.showToast({ title: '看完啦 🎬', icon: 'none' })
              return
            }
            const n = step + 1
            setStep(n)
            resetLine()
            playWordAudio(cartoon.lines[n].en)
          }}
        >
          <Text className='next__t'>{last ? '看完了' : '下一幕 →'}</Text>
        </View>
      </View>
    )
  }

  // ---------------- 英文儿歌 ----------------

  const renderRhyme = () => {
    if (!rhyme) {
      return (
        <View>
          <Text className='note'>
            小程序里放不了伴奏(没有音频合成能力),这里是**跟读版**:一句一句听、一句一句跟着说。
          </Text>
          <View className='list'>
            {RHYMES.map((r) => (
              <View
                key={r.key}
                className='item'
                onClick={() => {
                  setRhyme(r)
                  setStep(0)
                  resetLine()
                  playWordAudio(r.lines[0])
                }}
              >
                <Text className='item__e'>{r.icon}</Text>
                <View className='item__meta'>
                  <Text className='item__t'>{r.title}</Text>
                  <Text className='item__sub'>{r.titleZh}</Text>
                </View>
                <Text className='item__n'>{r.lines.length} 句</Text>
              </View>
            ))}
          </View>
        </View>
      )
    }
    return (
      <View className='play'>
        <View className='play__bar'>
          <Text className='play__back' onClick={back}>
            ← 返回
          </Text>
          <Text className='play__t'>{rhyme.titleZh}</Text>
        </View>
        <View className='lyrics'>
          {rhyme.lines.map((l, i) => (
            <Text
              key={`${rhyme.key}-${i}`}
              className={i === step ? 'lyric lyric--on' : 'lyric'}
              onClick={() => {
                setStep(i)
                resetLine()
                playWordAudio(l)
              }}
            >
              {l}
            </Text>
          ))}
        </View>
        {toolbar(rhyme.lines[step])}
        {feedback()}
        <View
          className='next'
          onClick={() => {
            const n = (step + 1) % rhyme.lines.length
            setStep(n)
            resetLine()
            playWordAudio(rhyme.lines[n])
          }}
        >
          <Text className='next__t'>下一句 →</Text>
        </View>
      </View>
    )
  }

  const inDetail = !!dialog || !!cartoon || !!rhyme

  return (
    <View className='talk'>
      {burst > 0 ? <CorrectBurst seed={burst} combo={0} /> : null}

      {!inDetail ? (
        <View className='tabs2'>
          {TABS.map(([k, icon, label]) => (
            <View
              key={k}
              className={k === tab ? 'tab2 tab2--on' : 'tab2'}
              onClick={() => {
                setTab(k)
                back()
              }}
            >
              <Text className='tab2__i'>{icon}</Text>
              <Text className='tab2__t'>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'dialog' ? renderDialog() : null}
      {tab === 'retell' ? renderRetell() : null}
      {tab === 'cartoon' ? renderCartoon() : null}
      {tab === 'rhyme' ? renderRhyme() : null}
    </View>
  )
}
