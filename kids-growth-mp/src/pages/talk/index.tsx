import { useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  dialogsByLevel,
  cartoonsByLevel,
  retellByLevel,
  defaultLevelFor,
  dialogCounts,
  LEVEL_LABEL,
  LEVEL_DESC,
  RHYMES,
  DIALOGS,
  CARTOONS,
  type Dialog,
  type Cartoon,
  type DialogLevel,
  type RetellSentence,
  type Rhyme,
} from '../../core/talkContent'
import {
  OPENERS,
  newChatState,
  respond,
  suggestions,
  type ChatState,
} from '../../core/chatEngine'
import {
  getLevelChoice,
  setLevelChoice,
  getRecord,
  noteFinished,
  levelProgress,
  sanitizeTalk,
  type LevelChoice,
} from '../../store/talk'
import { getStage, adjustPoints } from '../../store/study'
import {
  playWordAudio,
  playEnglishSlow,
  stopAudio,
  getFailedSentence,
  playWordByWord,
} from '../../lib/audio'
import { startRecord, stopRecord, playFile } from '../../lib/recorder'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { isSpeechAvailable } from '../../lib/speech'
import { scorePronunciation } from '../../core/score'
import CorrectBurst from '../../components/CorrectBurst'
import { withGuard } from '../../components/Guard'
import './index.scss'

type Tab = 'chat' | 'dialog' | 'retell' | 'cartoon' | 'rhyme'

const TABS: Array<[Tab, string, string]> = [
  ['chat', '🤖', '自由对话'],
  ['dialog', '💬', '情景对话'],
  ['retell', '👂', '听力复述'],
  ['cartoon', '🎬', '动画短片'],
  ['rhyme', '🎵', '英文儿歌'],
]

/** 聊天记录的一条 */
interface ChatLine {
  who: 'bot' | 'me'
  en: string
  zh: string
}

/** 每完成一句跟读给的成长值 */
const POINTS_PER_LINE = 1

const LEVELS: DialogLevel[] = ['easy', 'medium', 'hard']

function Talk() {
  const [tab, setTab] = useState<Tab>('dialog')
  const stage = getStage()
  /*
    幼儿段不显示「自由对话」。

    不是因为它做得不好,是这个年纪**结构上就用不了**:自由对话要么打字、
    要么读屏幕上的英文句子,而 4 岁半的孩子两样都不会。摆在第一个位置上,
    他每次点进来先撞见一个用不了的东西 —— 那个位置该留给他真能玩的。
    大一点的孩子照常保留。
  */
  const visibleTabs = TABS.filter(([k]) => !(k === 'chat' && stage === 'toddler'))

  /**
   * 难度:默认跟学段走,选过之后就按选的来。
   * choice 存的是 'auto' 或具体某一档,level 是最终生效的那一档。
   */
  const [choice, setChoice] = useState<LevelChoice>('auto')
  const [showLevels, setShowLevels] = useState(false)
  /** 'all' 时不筛选;其余情况算出最终生效的那一档 */
  const showAll = choice === 'all'
  const level: DialogLevel =
    choice === 'auto' || choice === 'all' ? defaultLevelFor(stage) : choice

  const dialogs = useMemo(() => (showAll ? DIALOGS : dialogsByLevel(level)), [level, showAll])
  const cartoons = useMemo(() => (showAll ? CARTOONS : cartoonsByLevel(level)), [level, showAll])
  const retells = useMemo(() => retellByLevel(level), [level])
  const counts = useMemo(() => dialogCounts(), [])
  /** 这一档练过几个,给孩子一个「打通这档」的目标 */
  const progress = useMemo(
    () => levelProgress(dialogs.map((d) => d.key)),
    [dialogs, tab],
  )

  /** 本段对话里拿到的最高星,练完时存进记录 */
  const [bestStars, setBestStars] = useState(0)

  // ---------------- 自由对话 ----------------
  const [chatLines, setChatLines] = useState<ChatLine[]>([])
  const [chatState, setChatState] = useState<ChatState>(newChatState())
  const [lastTopic, setLastTopic] = useState('')
  const [chatListening, setChatListening] = useState(false)
  const [chatHint, setChatHint] = useState('')
  const [chatZh, setChatZh] = useState(false)
  /** 打字输入的内容 —— 没有语音识别时,这是主要的说话方式 */
  const [chatTyped, setChatTyped] = useState('')

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

  useDidShow(() => {
    setChoice(getLevelChoice())
    // 内容改版后可能留下指向已删场景的练习记录,进页面时顺手清一次。
    // 放在这里而不是 app 启动:否则整份对话内容会被打进公共包。
    sanitizeTalk([...DIALOGS.map((d) => d.key), ...CARTOONS.map((c) => c.key)])
  })

  const pickLevel = (v: LevelChoice) => {
    setChoice(v)
    setLevelChoice(v)
    setShowLevels(false)
    // 换档后把正在练的收起来,否则会停在上一档的内容里
    setDialog(null)
    setCartoon(null)
    setRetellIdx(0)
    setStep(0)
    resetLine()
  }

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

  /** `alts` 是同样正确的其它说法,打分时一并比对,取最高分 */
  const gradeSpeak = (target: string, alts?: string[]) => {
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
        const r = scorePronunciation(text, target, alts)
        setStars(r.stars)
        setBestStars((b) => Math.max(b, r.stars))
        setMsg(r.message + (text ? `(听到:${text})` : ''))
        if (r.stars >= 2) reward()
      },
      onError: (m) => {
        setListening(false)
        setMsg(m + '(可以点「我读对了」)')
      },
    })
  }

  /**
   * 整句读不出来的提示。
   *
   * ⚠️ 不自动逐词播 —— 用户明确说过「一个一个字往外蹦」不能接受。
   * 只在真读不出来时给一个按钮,要不要逐词听由他自己决定。
   */
  const [failedSent, setFailedSent] = useState('')

  const listen = (sentence: string) => {
    setFailedSent('')
    playWordAudio(sentence)
    // 全部音源试完大约要几秒,之后再看这一句是不是彻底没读出来
    setTimeout(() => setFailedSent(getFailedSentence()), 6000)
  }

  /** 一句台词下面通用的「听 / 慢 / 录 / 对比 / 打分」工具条 */
  const toolbar = (sentence: string, alts?: string[]) => (
    <View className='tools'>
      <View className='tool' onClick={() => listen(sentence)}>
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
      <View className='tool' onClick={() => gradeSpeak(sentence, alts)}>
        <Text className='tool__t'>{listening ? '✅ 读完了' : '⭐ 打分'}</Text>
      </View>
    </View>
  )

  const feedback = () => (
    <View>
      {failedSent ? (
        <View className='failbox'>
          <Text className='failbox__t'>这一句所有发音接口都没读出来。</Text>
          <View className='failbox__btn' onClick={() => playWordByWord(failedSent)}>
            <Text className='failbox__bt'>一个词一个词地听</Text>
          </View>
          <Text className='failbox__h'>
            逐词听不连贯,所以不自动播 —— 想听再点。回首页跑一次「声音自检」能看到是哪一步卡住了。
          </Text>
        </View>
      ) : null}
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

  // ---------------- 自由对话 ----------------

  /** 开一段新对话:随机挑个开场白,免得每次都是同一句 */
  const startChat = () => {
    const o = OPENERS[Math.floor(Math.random() * OPENERS.length)]
    setChatLines([{ who: 'bot', en: o.en, zh: o.zh }])
    setChatState(newChatState())
    setLastTopic('')
    setChatHint('')
    playWordAudio(o.en)
  }

  /**
   * 孩子说完一句之后。
   *
   * 这里有个刻意的设计:**不打分、不判错**。
   * 自由聊天要的是「敢开口」,一旦开始纠正发音,孩子立刻就不敢说了 ——
   * 打分留在情景对话那一栏,那里有标准答案可比。
   */
  const onChildSaid = (text: string) => {
    const said = (text || '').trim()
    if (!said) {
      setChatHint('没听清呀,再说一遍试试')
      return
    }
    const out = respond(said, chatState)
    setChatState(out.next)
    setLastTopic(out.reply.topic)
    setChatLines((ls) => [
      ...ls,
      { who: 'me', en: said, zh: '' },
      { who: 'bot', en: out.reply.en, zh: out.reply.zh },
    ])
    setChatHint(out.reply.fallback ? '这句我没太懂,换个简单点的说法试试' : '')
    playWordAudio(out.reply.en)
    // 说了就有分:自由对话奖励的是「开口」这个行为本身
    reward()
  }

  const chatSpeak = () => {
    if (chatListening) {
      stopRecognize()
      return
    }
    setChatListening(true)
    setChatHint('聆听中…说完点「说完了」')
    startRecognize('en_US', {
      onResult: (t) => {
        setChatListening(false)
        onChildSaid(t)
      },
      onError: (m) => {
        setChatListening(false)
        setChatHint(m + '(也可以点下面的句子)')
      },
    })
  }

  const renderChat = () => {
    if (chatLines.length === 0) {
      return (
        <View className='chatstart'>
          <Text className='chatstart__e'>🤖</Text>
          <Text className='chatstart__t'>和小机器人聊天</Text>
          <Text className='chatstart__d'>
            这里没有标准答案,也不打分 —— 想说什么就说什么。
            {isSpeechAvailable()
              ? '可以直接说,也可以点现成的句子。'
              : '这台设备用不了语音识别,所以是点句子或打字来说 —— 机器人照样会回应你。'}
          </Text>
          <View className='next' onClick={startChat}>
            <Text className='next__t'>开始聊天</Text>
          </View>
        </View>
      )
    }
    const tips = suggestions(level, lastTopic)
    return (
      <View className='play'>
        <View className='play__bar'>
          <Text className='play__back' onClick={() => setChatLines([])}>
            ← 结束
          </Text>
          <Text className='play__t'>和小机器人聊天</Text>
          <Text className='play__n'>{chatState.turns} 轮</Text>
        </View>

        {chatLines.map((l, i) => (
          <View key={i} className={l.who === 'bot' ? 'bubble bubble--bot' : 'bubble bubble--me'}>
            {l.who === 'bot' ? <Text className='bubble__e'>🤖</Text> : null}
            <View className='bubble__body'>
              <Text className='bubble__en' onClick={() => playWordAudio(l.en)}>
                {l.en}
              </Text>
              {l.zh && chatZh ? <Text className='bubble__zh'>{l.zh}</Text> : null}
            </View>
          </View>
        ))}

        {chatHint ? <Text className='msg'>{chatHint}</Text> : null}

        {/*
          说话方式。
          语音识别要靠「微信同声传译」插件,而这个小程序没装(装不上,已放弃)——
          所以麦克风按钮**只在真的可用时才出现**。
          不可用时给输入框,家长可以帮着打字,孩子照样能跟机器人来回聊。
          原先无论如何都画一个「🎤 按住说英语」,点了却毫无反应,
          还写着「按住」但其实是点击 —— 三重误导,必须改掉。
        */}
        {isSpeechAvailable() ? (
          <View className='mic2' onClick={chatSpeak}>
            <Text className='mic2__t'>{chatListening ? '✅ 说完了' : '🎤 点一下说英语'}</Text>
          </View>
        ) : null}

        {!isSpeechAvailable() ? (
          <View className='typebar'>
            <Input
              className='typebar__in'
              value={chatTyped}
              placeholder='打字告诉它你想说什么'
              confirmType='send'
              onInput={(e) => setChatTyped(e.detail.value)}
              onConfirm={() => {
                onChildSaid(chatTyped)
                setChatTyped('')
              }}
            />
            <View
              className='typebar__go'
              onClick={() => {
                onChildSaid(chatTyped)
                setChatTyped('')
              }}
            >
              <Text className='typebar__got'>说</Text>
            </View>
          </View>
        ) : null}

        {/*
          「可以这样说」的脚手架。
          自由对话最大的门槛不是不会说,是**不知道能说什么** ——
          尤其五六岁的孩子,给个空框子等于把他晾在那儿。
          点一句就当他说了这句,先跑起来,说顺了自然就不看提示了。
        */}
        <Text className='tiplab'>不知道说什么?点一句照着说:</Text>
        <View className='tips'>
          {tips.map((t) => (
            <View key={t} className='tipbtn' onClick={() => onChildSaid(t)}>
              <Text className='tipbtn__t'>{t}</Text>
            </View>
          ))}
        </View>

        <View className='row row--wrap'>
          <View className='tool' onClick={() => setChatZh(!chatZh)}>
            <Text className='tool__t'>{chatZh ? '🙈 藏中文' : '👀 看中文'}</Text>
          </View>
          <View className='tool' onClick={startChat}>
            <Text className='tool__t'>🔄 重新开始</Text>
          </View>
        </View>

        <Text className='chatnote'>
          小机器人是按规则回应的,不是真的 AI —— 它答得不一定完美,
          但胜在随时都在、不会不耐烦,而且不会纠正你的发音。
          先敢开口,说准是后面的事。
        </Text>
      </View>
    )
  }

  const renderDialog = () => {
    if (!dialog) {
      return (
        <View className='list'>
          {dialogs.map((d) => {
            // 练过的标出来 —— 列表上没有任何痕迹时,孩子只会一直点第一个
            const rec = getRecord(d.key)
            return (
              <View
                key={d.key}
                className={rec ? 'item item--done' : 'item'}
                onClick={() => {
                  setDialog(d)
                  setStep(0)
                  setBestStars(0)
                  resetLine()
                  playWordAudio(d.turns[0].bot)
                }}
              >
                <Text className='item__e'>{d.icon}</Text>
                <View className='item__meta'>
                  <Text className='item__t'>{d.title}</Text>
                  <Text className='item__sub'>
                    {LEVEL_LABEL[d.level]} · {d.turns.length} 轮 ·{' '}
                    {rec ? `练过 ${rec.times} 遍,最好 ${'⭐'.repeat(rec.bestStars) || '—'}` : '还没练过'}
                  </Text>
                </View>
                <Text className='item__n'>{rec ? '✓' : `${d.turns.length} 轮`}</Text>
              </View>
            )
          })}
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
            {/*
              ⚠️ 这里必须是**同一个节点**在两种状态间切换,不能写成
              「有 onClick 的 Text」和「没有 onClick 的 Text」二选一。
              Taro 对带事件和不带事件的节点编译方式不同,在同一位置互换会让
              节点别名对不上,真机上报 `componentsAlias[...]._num` 的错。
            */}
            <Text
              className={showZh ? 'bubble__zh' : 'bubble__peek'}
              onClick={() => setShowZh(true)}
            >
              {showZh ? turn.expectZh : '看中文提示'}
            </Text>
          </View>
        </View>

        {toolbar(turn.expect, turn.alts)}
        {turn.alts && turn.alts.length > 0 ? (
          <Text className='alts'>这样说也对:{turn.alts.join(' / ')}</Text>
        ) : null}
        {feedback()}

        <View
          className='next'
          onClick={() => {
            if (last) {
              // 记一笔:练过几遍、最好几星。列表上会标出来
              noteFinished(dialog.key, bestStars)
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
          {/* 同上:保持同一个可点节点,只换样式和内容 */}
          <Text
            className={showZh ? 'card2__en' : 'card2__peek'}
            onClick={() => setShowZh(true)}
          >
            {showZh ? s.en : '看原句'}
          </Text>
          {showZh ? <Text className='card2__zh'>{s.zh}</Text> : null}
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
              noteFinished(cartoon.key, bestStars)
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
          {visibleTabs.map(([k, icon, label]) => (
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

      {/*
        难度选择。
        只按年龄自动分档不够用 —— 同一个孩子听力可能超前、口语落后,
        或者今天状态好想挑一档难的。把选择权交出去比替他决定管用。
      */}
      {!inDetail && tab !== 'chat' ? (
        <View className='lv'>
          <View className='lv__hd' onClick={() => setShowLevels(!showLevels)}>
            <View className='lv__meta'>
              <Text className='lv__t'>
                {showAll ? `全部 ${DIALOGS.length} 段` : `难度:${LEVEL_LABEL[level]}`}
                {choice === 'auto' ? '(按年龄自动)' : ''}
              </Text>
              <Text className='lv__d'>
                {showAll ? '不筛选,想练哪段练哪段' : LEVEL_DESC[level]}
              </Text>
            </View>
            <Text className='lv__a'>{showLevels ? '收起' : '换一档'}</Text>
          </View>

          {showLevels ? (
            <View className='lv__opts'>
              <View
                className={choice === 'auto' ? 'lvopt lvopt--on' : 'lvopt'}
                onClick={() => pickLevel('auto')}
              >
                <Text className='lvopt__t'>跟着年龄走</Text>
                <Text className='lvopt__d'>现在会给「{LEVEL_LABEL[defaultLevelFor(stage)]}」</Text>
              </View>
              <View
                className={choice === 'all' ? 'lvopt lvopt--on' : 'lvopt'}
                onClick={() => pickLevel('all')}
              >
                <Text className='lvopt__t'>全部 {DIALOGS.length} 段</Text>
                <Text className='lvopt__d'>不筛选,每段旁边标着难度,自己挑</Text>
              </View>
              {LEVELS.map((lv) => (
                <View
                  key={lv}
                  className={choice === lv ? 'lvopt lvopt--on' : 'lvopt'}
                  onClick={() => pickLevel(lv)}
                >
                  <Text className='lvopt__t'>
                    {LEVEL_LABEL[lv]} · {counts[lv]} 段对话
                  </Text>
                  <Text className='lvopt__d'>{LEVEL_DESC[lv]}</Text>
                </View>
              ))}
              <Text className='lv__tip'>
                觉得太简单就往上调一档,一直答不上来就往下调。练英语最怕的是卡在
                「听不懂又不敢说」那一档上。
              </Text>
            </View>
          ) : null}

          {tab === 'dialog' && progress.total > 0 ? (
            <View className='lv__prog'>
              <View className='lv__track'>
                <View
                  className='lv__fill'
                  style={{ width: `${Math.round((progress.practiced / progress.total) * 100)}%` }}
                />
              </View>
              <Text className='lv__pn'>
                这一档练过 {progress.practiced}/{progress.total} 段
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'chat' ? renderChat() : null}
      {tab === 'dialog' ? renderDialog() : null}
      {tab === 'retell' ? renderRetell() : null}
      {tab === 'cartoon' ? renderCartoon() : null}
      {tab === 'rhyme' ? renderRhyme() : null}
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Talk)
