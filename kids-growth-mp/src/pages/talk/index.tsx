import { useMemo, useState, useRef, useEffect } from 'react'
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
import { getStage, adjustPointsDetailed } from '../../store/study'
import {
  playWordAudio,
  playEnglishSlow,
  stopAudio,
  getFailedSentence,
  playWordByWord,
} from '../../lib/audio'
import { startRecord, stopRecord, playFile, keepRecording, fileExists } from '../../lib/recorder'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { isSpeechAvailable } from '../../lib/speech'
import { scorePronunciation } from '../../core/score'
import CorrectBurst from '../../components/CorrectBurst'
import { getMyVoice, saveMyVoice, deleteMyVoice, myVoiceCount, pruneMissing } from '../../store/voice'
import {
  buildPlaylist,
  ownVoiceCount,
  selfTalkReady,
  swapRoles,
  type DialogLine,
} from '../../core/playlist'
import { rankForRecording, type RankedSentence } from '../../core/voicePriority'
import { useParentGate } from '../../components/ParentGate'
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
  const { ask: askParent, gate: parentGate } = useParentGate()
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

  /** 家长录音模式:开着的时候每句下面多一排录音按钮 */
  const [recMode, setRecMode] = useState(false)
  /** 正在录的是哪一句(空 = 没在录) */
  const [parentRec, setParentRec] = useState('')
  /** 录/删之后用它逼界面重读一次,否则按钮状态不会变 */
  const [, setVoiceTick] = useState(0)

  /*
    先录哪些。

    对话内容有几百句,而家长真正会坐下来录的大概二十句。让他自己从几百句里
    挑,结果通常是录了开头几段就放弃 —— 而开头几段未必是孩子最常碰到的。
    所以由程序排:重复出现的、短的、简单档的排前面,录一次到处都用得上。
  */
  const toRecord = useMemo<RankedSentence[]>(() => {
    const cands: Array<{ text: string; level: string; where: string }> = []
    for (const d of DIALOGS) {
      for (const t of d.turns) {
        cands.push({ text: t.bot, level: d.level, where: d.title })
        cands.push({ text: t.expect, level: d.level, where: d.title })
      }
    }
    return rankForRecording(cands, 15)
  }, [])

  const startParentRec = (sentence: string) => {
    if (parentRec) return
    stopConvo()
    setParentRec(sentence)
    startRecord(
      (tempPath) => {
        // 一定要转成长期文件 —— 临时文件退出小程序就可能被清掉,
        // 家长录了几十句第二天全没了,这个功能就白做了
        keepRecording(
          tempPath,
          (saved) => {
            saveMyVoice(sentence, saved)
            setParentRec('')
            setVoiceTick((n) => n + 1)
            Taro.showToast({ title: '录好了', icon: 'success' })
          },
          (msg) => {
            setParentRec('')
            Taro.showModal({ title: '没存下来', content: msg, showCancel: false })
          },
        )
      },
      (msg) => {
        setParentRec('')
        Taro.showModal({ title: '录音失败', content: msg, showCancel: false })
      },
    )
  }

  const stopParentRec = () => stopRecord()

  const dropVoice = (sentence: string) => {
    deleteMyVoice(sentence)
    setVoiceTick((n) => n + 1)
    Taro.showToast({ title: '已删掉', icon: 'none' })
  }

  /*
    开关走家长闸门 —— 录音会覆盖已录好的那一条,孩子乱按一下就没了。
    关掉不用问:退出录音模式是无害的。
  */
  const toggleRecMode = () => {
    if (recMode) {
      setRecMode(false)
      return
    }
    askParent(
      '打开家长录音',
      '打开后,每句英文下面会多一排录音按钮,你念一遍存在手机里。以后这句就放你的声音,不再依赖网络。录音只存本机,不会上传。',
      () => setRecMode(true),
    )
  }

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

  /*
    ---- 角色互换(真的换,不只是回放时换) ----

    原来只有一个方向:机器问、他答。他练到的永远是**回答**。
    可提问是另一半能力,而且更难 —— 回答只要听懂了接一句,
    提问得先想清楚「我想知道什么」。4 岁半正是满脑子问号的年纪,
    把提问这一半交给他,他反而更来劲:问完机器真的会答,那是他触发的。

    打开之后这一轮里:上面那句(原本机器问的)变成**他要说的**,
    下面那句(原本他答的)变成**机器答的**。录音、打分的目标句跟着换,
    所以他录下来的是问句 —— 这也正是「自问自答」回放能成立的前提。
  */
  const [swap, setSwap] = useState(false)

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
  /** 今天的成长值已经拿满了 —— 照常练,但要说明一声为什么不加分了 */
  const [capped, setCapped] = useState(false)
  const [recPath, setRecPath] = useState('')
  const [recording, setRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const [stars, setStars] = useState(-1)
  const [msg, setMsg] = useState('')

  useDidShow(() => {
    /*
      清掉指向「已经不存在的文件」的录音条目。

      两种情况会产生它们:①手机空间紧张时系统回收了长期文件;
      ②换了台手机、从备份恢复 —— 备份里存的是**索引**,音频文件本身
      不会跟着走。留着这类条目的表现是「显示已录音,点了不响」,
      那比没录还让人恼火。
    */
    pruneMissing(fileExists, 'parent')
    pruneMissing(fileExists, 'kid')
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
    setSwap(false)
    setDialog(null)
    setCartoon(null)
    setRhyme(null)
    setStep(0)
    resetLine()
  }

  /*
    ---- 连贯对话回放 ----
    排期是纯逻辑(core/playlist),这里只负责按排期一句一句放。
    用定时器串,不靠 onEnded —— 音源偶尔不出声时靠 onEnded 会卡死不动,
    这个坑在磨耳朵那里已经踩过一次了。
  */
  /*
    录音期间不许放声音。

    真正的闸门在 lib/audioLock:一开录,所有在放的声音立刻停,
    录音期间任何播放请求都不响应 —— 因为喇叭里的范读会被麦克风一起录进去,
    回放时听到的是自己念一半、机器念一半糊在一起。

    但光靠闸门不够:按钮照样能点、点了却没反应,那看起来就是「坏了」。
    所以这里再挡一层,并告诉他为什么 —— **静默失败比出错更难查**。
  */
  const blocked = () => {
    if (!recording && !parentRec) return false
    Taro.showToast({ title: '正在录音,先点 ⏹ 停止', icon: 'none' })
    return true
  }

  const [playing, setPlaying] = useState(false)
  const convoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /*
    这两个延时任务也要存下来。
    不存的话离开页面它们照样会到点开火 —— 人已经回到首页了,
    兜里的手机突然念一句英文。
  */
  const abTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 点击反馈动画的收尾定时器 */
  const fxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dialogLines = (d: Dialog, swapped = false): DialogLine[] => {
    const lines: DialogLine[] = []
    for (const t of d.turns) {
      lines.push({ speaker: 'bot', text: t.bot })
      lines.push({ speaker: 'kid', text: t.expect })
    }
    return swapped ? swapRoles(lines) : lines
  }

  const convoStats = (d: Dialog) =>
    ownVoiceCount(buildPlaylist(dialogLines(d), (t) => getMyVoice(t, 'kid')))

  /** 自问自答放不放得起来:问句和答句各要有至少一句是他自己录的 */
  const selfTalk = (d: Dialog) => selfTalkReady(dialogLines(d), (t) => getMyVoice(t, 'kid'))

  const stopConvo = () => {
    if (convoTimer.current) clearTimeout(convoTimer.current)
    convoTimer.current = null
    stopAudio()
    setPlaying(false)
  }

  const playConvo = (d: Dialog, swapped = false, ownAll = false) => {
    if (blocked()) return
    stopConvo()
    const items = buildPlaylist(dialogLines(d, swapped), (t) => getMyVoice(t, 'kid'), { ownAll })
    if (items.length === 0) return
    setPlaying(true)
    let i = 0
    const step = () => {
      if (i >= items.length) {
        setPlaying(false)
        return
      }
      const it = items[i]
      i += 1
      // 他自己录过就放他的;没录过用机器音顶上,不跳过
      if (it.voice) playFile(it.voice)
      else void playWordAudio(it.text)
      // 句子越长读得越久,停顿也要跟着长一点,否则会互相打断
      const dur = 900 + it.text.split(/\s+/).length * 320
      convoTimer.current = setTimeout(step, dur + it.gapMs)
    }
    step()
  }

  // 离开页面把连播停掉,免得返回首页还在响。
  // 顺便把两个延时任务清掉、把没停的录音停掉 ——
  // 录音不停的话互斥闸会一直锁着,回到别的页面就变成「哪儿都没声音」。
  useEffect(
    () => () => {
      stopConvo()
      if (abTimer.current) clearTimeout(abTimer.current)
      if (failTimer.current) clearTimeout(failTimer.current)
      if (replyTimer.current) clearTimeout(replyTimer.current)
      if (fxTimer.current) clearTimeout(fxTimer.current)
      stopRecord()
    },
    [],
  )

  const reward = () => {
    // 撞上每日上限时不再加分,但照常练 —— 记下来给结算页说明一句
    if (adjustPointsDetailed(POINTS_PER_LINE).actual <= 0) setCapped(true)
    setBurst((b) => b + 1)
    try {
      Taro.vibrateShort({ type: 'light' })
    } catch {
      /* 忽略 */
    }
  }

  // ---------------- 跟读:录音 / 打分 / A-B 对比 ----------------

  /*
    `replyAfter`:他说完之后机器接的那一句。

    这是角色互换真正的回报。他问出 "How many ducks?" 之后,
    要是屏幕只回一句「录好啦」,那他刚才做的事和跟读没区别 ——
    **提问之所以是提问,是因为有人答**。所以录音一停,隔半秒机器就答上,
    像真的被他问到了一样。半秒不是随便定的:立刻接会像回声,
    太久他的注意力就跑了。
  */
  const toggleRecord = (kidTarget: string, replyAfter?: string) => {
    if (!recording) {
      /*
        开录之前把连播掐掉。
        lib/audioLock 会停掉正在响的声音,但连播是一串定时器 ——
        声音停了,定时器还在,过一秒它又放下一句。必须从这里停。
      */
      stopConvo()
      if (replyTimer.current) clearTimeout(replyTimer.current)
      setRecording(true)
      setMsg('录音中…读完再点一次')
      startRecord(
        (path) => {
          // 跟读/复述的录音同样存成长期文件,同一句重录覆盖旧的
          keepRecording(
            path,
            (saved) => {
              setRecPath(saved)
              if (kidTarget) saveMyVoice(kidTarget, saved, 'kid')
            },
            () => setRecPath(path),
          )
          setRecording(false)
          setMsg(replyAfter ? '问得好!听它怎么答 👇' : '录好啦,可以对比听听')
          if (replyAfter) {
            replyTimer.current = setTimeout(() => {
              replyTimer.current = null
              playWordAudio(replyAfter)
            }, 600)
          }
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
    if (blocked()) return
    if (abTimer.current) clearTimeout(abTimer.current)
    playWordAudio(sentence)
    abTimer.current = setTimeout(() => {
      abTimer.current = null
      if (recPath) playFile(recPath)
    }, 2600)
  }

  /** `alts` 是同样正确的其它说法,打分时一并比对,取最高分 */
  const gradeSpeak = (target: string, alts?: string[]) => {
    // 识别本身要占麦克风,和录音撞车
    if (!listening && blocked()) return
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
    if (blocked()) return
    setFailedSent('')
    if (failTimer.current) clearTimeout(failTimer.current)
    playWordAudio(sentence)
    // 全部音源试完大约要几秒,之后再看这一句是不是彻底没读出来
    failTimer.current = setTimeout(() => {
      failTimer.current = null
      setFailedSent(getFailedSentence())
    }, 6000)
  }

  /** 一句台词下面通用的「听 / 慢 / 录 / 对比 / 打分」工具条 */
  /*
    家长录音条。

    英语**整句**没有可用的免费音源 —— 单词能读是因为有道词典存了真人录音,
    整句它没有,其它免费接口要么不给整句,要么读出来是机器拼的。
    换了七八个音源都绕不过去,这不是代码问题,是没有料。

    家长自己录一遍就一次解决:不依赖网络、不会被接口下线、发音稳定,
    而且是**爸爸的声音** —— 对 4 岁半的孩子来说这比任何合成音都强,
    他会为了听那个声音多点两遍。录的音只存在本机,不传任何地方。

    只在「家长录音模式」打开时出现,免得孩子乱按把录好的盖掉。
  */
  const voiceBar = (sentence: string) => {
    if (!recMode) return null
    const mine = getMyVoice(sentence)
    const busy = parentRec === sentence
    return (
      <View className='vbar'>
        {busy ? (
          <View className='vbar__b vbar__b--rec' onClick={stopParentRec}>
            <Text className='vbar__t'>⏹ 录完了</Text>
          </View>
        ) : null}
        {!busy ? (
          <View className='vbar__b' onClick={() => startParentRec(sentence)}>
            <Text className='vbar__t'>{mine ? '🔁 重录这句' : '🎤 录这句'}</Text>
          </View>
        ) : null}
        {mine && !busy ? (
          <View
            className='vbar__b'
            onClick={() => {
              if (blocked()) return
              playFile(mine)
            }}
          >
            <Text className='vbar__t'>▶️ 试听</Text>
          </View>
        ) : null}
        {mine && !busy ? (
          <View className='vbar__b' onClick={() => dropVoice(sentence)}>
            <Text className='vbar__t'>🗑 删掉</Text>
          </View>
        ) : null}
        {mine && !busy ? <Text className='vbar__ok'>已录 —— 以后这句就放你的声音</Text> : null}
      </View>
    )
  }

  /*
    录音时,除了「⏹ 停止」以外的按钮全部灰掉。

    灰掉不等于拿掉 —— 拿掉会让按钮位置整排跳动,4 岁半的孩子手指已经
    伸过去了,按钮却挪了地方。灰在原处、点了给一句话说明,才是他能懂的。
    (而且节点数量保持不变,Taro 也不会在同一位置上换节点类型。)
  */
  const toolCls = () => (recording ? 'tool tool--off' : 'tool')

  /*
    ---- 点击反馈 ----

    用户报「点完之后看不到反馈」。手指点下去屏幕上没有任何东西动,
    他不知道自己点中了没有,于是再点一次 —— 而按钮又挨着,
    第二下很容易落到旁边那个上。所以「没反馈」和「点错」是一件事的两头。
    不用 :active:那个只在按着的一瞬间有效,他点得又快又轻,那一帧看不到。
  */
  const [tapFx, setTapFx] = useState('')
  const fx = (key: string) => {
    if (fxTimer.current) clearTimeout(fxTimer.current)
    setTapFx(key)
    fxTimer.current = setTimeout(() => {
      fxTimer.current = null
      setTapFx('')
    }, 700)
  }
  const toolFx = (key: string) => `${toolCls()}${tapFx === key ? ' chip--on' : ''}`

  /*
    **听的按钮和说的按钮分成两排。**

    原先六个按钮挤在同一排里,中间只隔 12px —— 他想听一遍范读,
    手指偏一点就开始录音了;而录音一开互斥闸会把声音全停掉
    (见 lib/audioLock),表现成「点了没声音」,他根本不知道自己按了录音。

    两排各带一个图标标签:他不识字,但 👂 和 🎤 分得清,
    这比任何文字说明都管用。
  */
  const toolbar = (sentence: string, alts?: string[], replyAfter?: string) => (
    <View className='tools'>
      {voiceBar(sentence)}
      <View className='grp'>
        <Text className='grp__lab'>👂</Text>
        <View
          className={toolFx('t-listen')}
          onClick={() => {
            fx('t-listen')
            listen(sentence)
          }}
        >
          <Text className='tool__t'>🔊 听</Text>
        </View>
        <View
          className={toolFx('t-slow')}
          onClick={() => {
            if (blocked()) return
            fx('t-slow')
            playEnglishSlow(sentence)
          }}
        >
          <Text className='tool__t'>🐢 慢速</Text>
        </View>
      </View>
      <View className='grp'>
        <Text className='grp__lab'>🎤</Text>
        <View
          className={recording ? 'tool tool--rec' : 'tool'}
          onClick={() => toggleRecord(sentence, replyAfter)}
        >
          <Text className='tool__t'>{recording ? '⏹ 停止' : '🎙 录我的'}</Text>
        </View>
        {/*
          回放要看**存档**,不是这次会话的临时状态。
          v47 起孩子的录音是存下来的,但界面一直只看 recPath ——
          退出再进来按钮就没了,用户的感受就是「没有回放功能」。
        */}
        {recPath || getMyVoice(sentence, 'kid') ? (
          <View
            className={toolFx('t-replay')}
            onClick={() => {
              if (blocked()) return
              fx('t-replay')
              playFile(recPath || getMyVoice(sentence, 'kid'))
            }}
          >
            <Text className='tool__t'>▶️ 回放</Text>
          </View>
        ) : null}
        {recPath ? (
          <View
            className={toolFx('t-ab')}
            onClick={() => {
              fx('t-ab')
              compareAB(sentence)
            }}
          >
            <Text className='tool__t'>🆚 对比</Text>
          </View>
        ) : null}
        <View
          className={toolFx('t-grade')}
          onClick={() => {
            fx('t-grade')
            gradeSpeak(sentence, alts)
          }}
        >
          <Text className='tool__t'>{listening ? '✅ 读完了' : '⭐ 打分'}</Text>
        </View>
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
      {/* 今天的分拿满了要说一声,否则「读了半天不涨分」看着像坏了 */}
      {capped ? (
        <Text className='msg'>🌙 今天的成长值已经拿满啦,继续练照样有记录,明天再来涨分</Text>
      ) : null}
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
                  setSwap(false)
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
    /*
      互换之后,「他要说的那句」和「机器说的那句」整个对调:
      平时他要说 turn.expect(回答),互换后他要说 turn.bot(提问)。
      录音、打分、连播全都跟着这一个变量走 —— 只在这里算一次,
      下面各处都引用它,免得漏改某一处导致「录的是 A、打分打的是 B」。
    */
    const mine = swap ? turn.bot : turn.expect
    const mineZh = swap ? turn.botZh : turn.expectZh
    const theirs = swap ? turn.expect : turn.bot
    const theirsZh = swap ? turn.expectZh : turn.botZh
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

        {/*
          换边开关。
          两个分支都是同一个带 onClick 的 View,只换 class 和文字 ——
          带事件/不带事件的节点在同一位置互换会让 Taro 报 `_num`。
        */}
        <View
          className={swap ? 'swapbar swapbar--on' : 'swapbar'}
          onClick={() => {
            stopConvo()
            setSwap(!swap)
            resetLine()
            /*
              换完先放一遍 turn.bot —— 两个方向要听的都是它:
              换成他来问,turn.bot 就是他要说的那句;
              换回机器问,turn.bot 就是机器开口的那句。
              他还不识字,不听就不知道要说什么。
            */
            playWordAudio(turn.bot)
          }}
        >
          {/*
            措辞要准。这些对话里 bot 那句**大多**是问句(What is it? / How many ducks?),
            但也有几句是招呼(Hello! / Here you are!)。一律写成「你来问」,
            碰到招呼句时孩子会对不上;写成「你先说、它来答」两种都对,
            而且照样说清楚了「这回轮到你起头」。
          */}
          <Text className='swapbar__t'>{swap ? '🙋 你先说,它来答' : '🤖 它先说,你来答'}</Text>
          <Text className='swapbar__d'>
            {swap
              ? '你问完它就回答你 —— 点一下换回去'
              : '点一下换成你先说(问问题比回答更难,也更好玩)'}
          </Text>
        </View>

        {/*
          互换时,他那句排在前面(他先问),机器那句排在后面(它后答)。
          顺序不能只靠文字说明 —— 4 岁半是照着屏幕从上往下走的,
          谁在上面谁就先说。
        */}
        {swap ? (
          <View className='bubble bubble--me'>
            <View className='bubble__body'>
              <Text className='bubble__lab'>轮到你先说</Text>
              <Text className='bubble__en'>{mine}</Text>
              <Text
                className={showZh ? 'bubble__zh' : 'bubble__peek'}
                onClick={() => setShowZh(true)}
              >
                {showZh ? mineZh : '看中文提示'}
              </Text>
            </View>
          </View>
        ) : null}

        <View className='bubble bubble--bot'>
          <Text className='bubble__e'>{turn.emoji ?? '🤖'}</Text>
          <View className='bubble__body'>
            {swap ? <Text className='bubble__lab'>它这样回答你 · 点一下听</Text> : null}
            <Text
              className='bubble__en'
              onClick={() => {
                if (blocked()) return
                playWordAudio(theirs)
              }}
            >
              {theirs}
            </Text>
            <Text className='bubble__zh'>{theirsZh}</Text>
          </View>
        </View>

        {!swap ? (
          <View className='bubble bubble--me'>
            <View className='bubble__body'>
              <Text className='bubble__lab'>轮到你说</Text>
              <Text className='bubble__en'>{mine}</Text>
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
                {showZh ? mineZh : '看中文提示'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* 互换时把机器要答的那句一起传进去 —— 他问完,它就答 */}
        {toolbar(mine, swap ? undefined : turn.alts, swap ? theirs : undefined)}
        {!swap && turn.alts && turn.alts.length > 0 ? (
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

        {/*
          **把整段串起来放一遍。**

          现在的练习是一句一句割裂的:机器说一句、他跟一句、翻页、再来一句。
          练完他脑子里留下的是十个碎片,而不是「我和人说了一段话」。

          而语言真正的成就感来自**连起来那一刻** —— 机器的声音和他自己的声音
          一来一回地放出来,他会发现「原来这一整段是我说的」。
          这一下比十次正确率反馈都管用。

          没录过的那几句用机器音顶上,**不跳过** ——
          跳过会让整段缺一半,听起来像机器在自言自语。
        */}
        <View className='convo'>
          <View
            className={playing ? 'convo__b convo__b--on' : 'convo__b'}
            onClick={() => (playing ? stopConvo() : playConvo(dialog, swap))}
          >
            <Text className='convo__t'>
              {playing ? '⏹ 停止播放' : '▶️ 连起来听一遍(像真的对话)'}
            </Text>
          </View>
          <Text className='convo__n'>
            {(() => {
              const st = convoStats(dialog)
              return st.kid > 0
                ? `这段里有 ${st.own}/${st.kid} 句是你自己的声音`
                : ''
            })()}
          </Text>
          {/*
            **自问自答。**

            平时连播是「机器一句、他一句」,他听到的只有一半自己。
            但只要他在「你来问」那一边也录过,这段两边就都有他的声音了 ——
            这时候整段放出来,是他自己在跟自己一问一答。

            这个功能不是为了好玩才做的(虽然确实好玩):
            好玩他就会反复放,反复放就是反复输入 —— 趣味在这里是复读机,
            比任何「再练一遍」的提示都有效。

            按钮只在两边都有他的录音时才出现 —— 只有一边时点开听到的
            仍然是半个机器人,那会让他觉得这个按钮坏了。
          */}
          {(() => {
            const st = selfTalk(dialog)
            if (st.ok) {
              return (
                <View
                  className='convo__b convo__b--self'
                  onClick={() => playConvo(dialog, false, true)}
                >
                  <Text className='convo__t'>
                    🙋‍♂️ 全是我的声音(自己问自己答 · {st.own}/{st.total} 句)
                  </Text>
                </View>
              )
            }
            return (
              <Text className='convo__hint'>
                {st.answerOwn && !st.askOwn
                  ? '想听「自己问自己答」?把上面切到「你来问」,再录几句问话就能听了'
                  : '想听「自己问自己答」?两边都录上几句 —— 答的录几句,再切到「你来问」录几句'}
              </Text>
            )
          })()}
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
      {parentGate}
      {burst > 0 ? <CorrectBurst seed={burst} combo={0} /> : null}

      {/*
        家长录音入口。
        英语整句没有可用的免费音源 —— 这是唯一能真正解决它的办法,
        所以入口要一直在,而不是藏在设置里。
      */}
      <View className={recMode ? 'recmode recmode--on' : 'recmode'} onClick={toggleRecMode}>
        <Text className='recmode__t'>
          {recMode ? '🎤 家长录音中 · 点这里退出' : '🎤 家长录音'}
        </Text>
        <Text className='recmode__n'>
          {myVoiceCount() > 0 ? `已录 ${myVoiceCount()} 句` : '录一句,以后这句就放你的声音'}
        </Text>
      </View>

      {/* 打开录音模式时,先把「最该录的 15 句」摆出来 */}
      {recMode ? (
        <View className='toprec'>
          <Text className='toprec__t'>先录这 15 句(重复出现最多、最短)</Text>
          {toRecord.map((r) => {
            const done = !!getMyVoice(r.text)
            return (
              <View key={r.text} className={done ? 'toprec__r toprec__r--on' : 'toprec__r'}>
                <Text className='toprec__s'>{r.text}</Text>
                <Text className='toprec__w'>
                  {done ? '✅ 已录' : `出现 ${r.times} 次 · ${r.where.join('/')}`}
                </Text>
                {!done ? (
                  <View className='toprec__b' onClick={() => startParentRec(r.text)}>
                    <Text className='toprec__bt'>{parentRec === r.text ? '录制中…' : '🎤 录'}</Text>
                  </View>
                ) : null}
                {parentRec === r.text ? (
                  <View className='toprec__b toprec__b--stop' onClick={stopParentRec}>
                    <Text className='toprec__bt'>⏹ 录完</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : null}

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
