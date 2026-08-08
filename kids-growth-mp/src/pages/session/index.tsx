import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import {
  getCurrentChildId,
  getSessionCards,
  getDeck,
  getDeckCards,
  applyGrade,
  finishSession,
  addStudyTime,
  autoAddErrorCard,
  getStage,
  type DueCard,
} from '../../store/study'
import { noteSessionEnd, claimNewAchievements } from '../../store/progress'
import { getAchievement } from '../../core/achievements'
import { levelOf } from '../../core/levels'
import { playWordAudio, playText, playEnglishSlow, stopAudio, prefetchAudio } from '../../lib/audio'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { startRecord, stopRecord, playFile, keepRecording } from '../../lib/recorder'
import { scorePronunciation, normalizeForCompare } from '../../core/score'
import CorrectBurst from '../../components/CorrectBurst'
import PolyphoneNote from '../../components/PolyphoneNote'
import { awardSticker, feedPetDetailed, bumpChallenge, type FeedResult } from '../../store/fun'
import type { StickerDef } from '../../core/stickers'
import type { LearnCard, LearnDeck, PracticeMode } from '../../types'
import { saveMyVoice, getMyVoice } from '../../store/voice'
import { advancePlan } from '../../store/plan'
import { noteUsage } from '../../store/usage'
import { reportCard } from '../../store/reports'
import { isWindDown, defaultBedtime } from '../../core/ageStage'
import { readObject } from '../../store/db'
import type { PlanStep } from '../../core/dailyPlan'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

type Phase = 'prompt' | 'reveal' | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Session() {
  const router = useRouter()
  const deckId = router.params.deckId || ''
  const mode = (router.params.mode || 'recognize') as PracticeMode
  /**
   * 「再练一遍」模式:忽略「到期」,从整组里随机抽题。
   *
   * 孩子主动想练的时候,程序不该拿间隔重复算法当门禁把他拦住 ——
   * 那是为「记得牢」设计的,不是为「不准多练」设计的。
   * 这一组照常给分、照常喂宠物,但**不动 SRS 的间隔**,免得反复刷把复习节奏搅乱。
   */
  const freePractice = router.params.free === '1'
  /*
    在走「今天就做这个」那条路。做完这一组要**自动接下一步**,
    而不是把 4 岁半的孩子丢回一屏他读不了的首页去自己找下一个。
  */
  const inPlan = router.params.plan === '1'
  const limitParam = Number(router.params.limit)
  const cardLimit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 12
  const [nextStep, setNextStep] = useState<PlanStep | null>(null)
  /** 这一组有没有撞上「今天的分拿满了」 */
  const [capped, setCapped] = useState(false)
  /*
    睡前降刺激:彩带、连击、震动都是提高兴奋度的设计,睡前半小时该反着来。
    只关特效,不关内容 —— 他照常能学,只是屏幕安静下来。
  */
  const quiet = (() => {
    const bed = readObject<string>('bedtime', defaultBedtime(getStage()))
    const d = new Date()
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return isWindDown(hhmm, bed)
  })()

  const [childId, setChildId] = useState('')
  const [deck, setDeck] = useState<LearnDeck | null>(null)
  const [cards, setCards] = useState<DueCard[]>([])
  const [allCards, setAllCards] = useState<LearnCard[]>([])
  const [poolBack, setPoolBack] = useState<string[]>([])
  const [poolFront, setPoolFront] = useState<string[]>([])
  const [linePool, setLinePool] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [correct, setCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [spellInput, setSpellInput] = useState('')
  const [listening, setListening] = useState(false)
  const [stars, setStars] = useState(-1)
  const [speakMsg, setSpeakMsg] = useState('')
  const [recPath, setRecPath] = useState('')
  const [recording, setRecording] = useState(false)
  const [startedAt] = useState(Date.now())
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number } | null>(null)
  /** 答对特效:每答对一次 +1,用来重新触发动画 */
  const [burst, setBurst] = useState(0)
  const [gotSticker, setGotSticker] = useState<StickerDef | null>(null)
  const [evolved, setEvolved] = useState(false)
  /** 这一组喂了几口、离下一次变身还差多少 —— 结算页动态展示 */
  const [feed, setFeed] = useState<FeedResult | null>(null)
  /** 进度条从「喂之前」滑到「喂之后」,滑动才有养成的感觉 */
  const [feedAnim, setFeedAnim] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const [leveledTo, setLeveledTo] = useState('')
  /** 本组最高连对,用于成就统计 */
  const [bestCombo, setBestCombo] = useState(0)
  /** 磨耳朵:自动连播到第几张 */
  const [earIdx, setEarIdx] = useState(0)
  const [earOn, setEarOn] = useState(false)
  const [ready, setReady] = useState(false)

  /*
    卸载时要记「半途退出」,而卸载回调拿到的是**第一次渲染时**的那份状态。
    所以把需要的几个值同步到 ref 里 —— 这是 React 里记录「离开时的现场」
    唯一可靠的办法。
  */
  const summaryRef = useRef(false)
  const cardsRef = useRef<DueCard[]>([])
  const idxRef = useRef(0)
  const deckRef = useRef('')
  const modeRef = useRef<string>(mode)
  cardsRef.current = cards
  idxRef.current = idx
  deckRef.current = deck?.name ?? deckId
  modeRef.current = mode
  summaryRef.current = !!summary

  const itemType = deck?.itemType ?? 'word'
  const isHanzi = itemType === 'hanzi'
  /**
   * 低龄档拼写用点选字母而不是键盘。
   * 幼儿园和小学低年级的孩子还不会打字,给键盘等于把「会不会拼」
   * 变成「会不会打字」——门槛完全跑偏了。
   */
  const useLetters = mode === 'spell' && getStage() === 'toddler'
  const isWord = itemType === 'word'
  const isPic = itemType === 'pic'
  const isFact = itemType === 'fact'
  /** 看图题里的「英语档」:读英文、选英文 */
  const picEn = mode === 'picChooseEn' || mode === 'listenPicEn'

  const playPrompt = (text: string) => {
    if (isWord) playWordAudio(text)
    else void playText(text, 'zh_CN')
  }

  /** 看图卡:按当前模式决定读中文还是读英文 */
  const playPic = (card: LearnCard) => {
    const en = (card.extra as { en?: string } | undefined)?.en
    if (picEn && en) playWordAudio(en)
    else void playText(card.front, 'zh_CN')
  }

  // ⚠️ 整体 try/catch:页面加载阶段抛异常会导致整页渲染不出来(只剩导航栏),
  // 这里捕获后照常渲染,并把原因弹给用户,至少能返回上一页。
  useEffect(() => {
    try {
      const cid = getCurrentChildId()
      const list = getSessionCards(cid, deckId, cardLimit, freePractice)
      const d = getDeck(deckId) ?? null
      const all = getDeckCards(deckId)
      setChildId(cid)
      setDeck(d)
      setAllCards(all)
      setPoolBack(all.map((c) => c.back))
      setPoolFront(all.map((c) => c.front))
      const lines: string[] = []
      for (const c of all) {
        const ls = (c.extra as { lines?: string[] } | undefined)?.lines
        if (Array.isArray(ls)) lines.push(...ls)
      }
      setLinePool(lines)
      setCards(list)
      setReady(true)
      noteUsage('open', d?.name ?? deckId, mode)
      /*
        提前把这一组要用的发音拉下来。
        晚上可能在床上、车上,网络不稳 —— 播的时候才下载,就会卡在
        「点了没声音」。提前拉好,后面每一题都是秒响。
      */
      try {
        prefetchAudio(list.map((x) => x.card.audioText ?? x.card.front).slice(0, 12))
      } catch {
        /* 预取失败不影响做题 */
      }
      const autoPlay = mode === 'listenChoose' || mode === 'dictation' || mode === 'listenPic' || mode === 'listenPicEn'
      if (list[0] && autoPlay) {
        const c0 = list[0].card
        const t = (d?.itemType ?? 'word') as string
        if (mode === 'listenPicEn') {
          const en = (c0.extra as { en?: string } | undefined)?.en
          playWordAudio(en ?? c0.front)
        } else if (mode === 'listenPic') {
          void playText(c0.front, 'zh_CN')
        } else if (t === 'word') {
          playWordAudio(c0.audioText ?? c0.front)
        } else {
          void playText(c0.audioText ?? c0.front, 'zh_CN')
        }
      }
    } catch (e) {
      setReady(true)
      Taro.showModal({
        title: '这组题打不开',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 低龄:每换一张卡就把题目念出来。
   *
   * 这条是给「还不识字」的孩子的 —— 4 岁半的孩子面对一屏汉字,他不是不想做,
   * 是根本读不了。听音类的题本来就会自动播,可「看图选一选」这类是静默的,
   * 于是那道题对他来说等于一片空白。所以幼儿段一律念出来,
   * 而且只念题面、不念答案。
   *
   * 只在 toddler 生效:大一点的孩子自己会读,每张都念反而吵。
   * 磨耳朵有自己的连播逻辑,这里让开。
   */
  useEffect(() => {
    if (getStage() !== 'toddler') return
    if (mode === 'earTrain' || mode === 'listenChoose' || mode === 'dictation') return
    if (mode === 'listenPic' || mode === 'listenPicEn') return
    const card = cards[idx]?.card
    if (!card || phase !== 'prompt') return
    const timer = setTimeout(() => {
      void playText(card.audioText ?? card.front, 'zh_CN')
    }, 420)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cards, mode, phase])

  /**
   * 磨耳朵的自动连播:英文 → 停 → 中文 → 停 → 下一张,循环。
   * 用定时器串起来而不是等 onEnded —— 音源偶尔不出声时,靠 onEnded 会卡死不动。
   */
  useEffect(() => {
    if (!earOn || mode !== 'earTrain' || cards.length === 0) return
    let alive = true
    const card = cards[earIdx % cards.length]?.card
    if (!card) return
    const en = (card.extra as { en?: string } | undefined)?.en
    if (en) playWordAudio(en)
    const t1 = setTimeout(() => {
      if (alive) void playText(card.front, 'zh_CN')
    }, 2400)
    const t2 = setTimeout(() => {
      if (alive) setEarIdx((i) => (i + 1) % cards.length)
    }, 5200)
    return () => {
      alive = false
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [earOn, earIdx, cards, mode])

  /** 离开页面就把声音停掉,免得返回首页还在响 */
  useEffect(() => {
    return () => stopAudio()
  }, [])

  /*
    半途退出也要记。
    「他每次做两题就退出」这件事,只有记下来才看得见 ——
    而那正是「这个练法对他不合适」的最强信号。
  */
  useEffect(() => {
    return () => {
      if (!summaryRef.current && cardsRef.current.length > 0) {
        noteUsage('quit', deckRef.current, modeRef.current, idxRef.current, cardsRef.current.length)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 预取下一题的发音。
   * 「点了要等一下才响」主要是网络耗时,提前拉一遍,轮到它时基本秒响。
   */
  useEffect(() => {
    const nxt = cards[idx + 1]
    if (!nxt) return
    const en = (nxt.card.extra as { en?: string } | undefined)?.en
    if (isWord) prefetchAudio(nxt.card.audioText ?? nxt.card.front, 'en')
    else if (isPic) prefetchAudio(picEn && en ? en : nxt.card.front, picEn ? 'en' : 'zh')
    else prefetchAudio(nxt.card.audioText ?? nxt.card.front, 'zh')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cards])

  const current = cards[idx]

  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    const answer = isHanzi ? current.card.front : current.card.back
    const src = isHanzi ? poolFront : poolBack
    const distractors = shuffle(src.filter((b) => b !== answer)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolBack, poolFront, isHanzi])

  const blank = useMemo(() => {
    if (!current || mode !== 'fillBlank') return null
    const lines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
    if (lines.length === 0) return null
    const hideIdx = Math.floor(Math.random() * lines.length)
    const answer = lines[hideIdx]
    const own = new Set(lines)
    const distractors = shuffle(linePool.filter((l) => !own.has(l) && l.length === answer.length)).slice(0, 3)
    return { lines, hideIdx, answer, options: shuffle([answer, ...distractors]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, linePool, idx])

  /** 看图题「选文字」:选项是中文名或英文名 */
  const picTextOptions = useMemo(() => {
    if (!current || (mode !== 'picChoose' && mode !== 'picChooseEn')) return []
    const pick = (c: LearnCard) => (mode === 'picChooseEn' ? c.back : c.front)
    const answer = pick(current.card)
    const distractors = shuffle(allCards.filter((c) => pick(c) !== answer).map(pick)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /** 看图题「选图片」:选项是 emoji */
  const picEmojiOptions = useMemo(() => {
    if (!current || (mode !== 'listenPic' && mode !== 'listenPicEn')) return []
    const emojiOf = (c: LearnCard) => (c.extra as { emoji?: string } | undefined)?.emoji ?? '❓'
    const answer = emojiOf(current.card)
    const distractors = shuffle(allCards.filter((c) => emojiOf(c) !== answer).map(emojiOf)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /** 看拼音选字:选项是汉字,题面是拼音 */
  const pinyinOptions = useMemo(() => {
    if (!current || mode !== 'pinyin') return []
    const answer = current.card.front
    const distractors = shuffle(allCards.filter((c) => c.front !== answer).map((c) => c.front)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /**
   * 拼写题的字母块:目标单词的字母 + 几个干扰字母,打乱顺序。
   * 只在低龄档用(见下面 useLetters 的说明)。
   */
  const letterPool = useMemo(() => {
    if (!current || mode !== 'spell') return []
    const word = current.card.front.toLowerCase().replace(/[^a-z]/g, '')
    const letters = word.split('')
    // 干扰字母控制在 3 个以内:太多就成了大海捞针,反而打击信心
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('')
    const extras: string[] = []
    while (extras.length < Math.min(3, Math.max(1, 8 - letters.length))) {
      const c = alphabet[Math.floor(Math.random() * alphabet.length)]
      if (letters.indexOf(c) < 0 && extras.indexOf(c) < 0) extras.push(c)
    }
    return shuffle([...letters, ...extras])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, idx])

  /** 常识问答「选一选」:选项是其它题的答案 */
  const quizOptions = useMemo(() => {
    if (!current || mode !== 'quiz') return []
    const answer = current.card.back
    const distractors = shuffle(allCards.filter((c) => c.back !== answer).map((c) => c.back)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  const playCurrent = () => {
    if (!current) return
    if (isPic) playPic(current.card)
    else playPrompt(current.card.audioText ?? current.card.front)
  }

  /**
   * 逐字读一句(古诗用)。
   * 中文整句没有可用音源,只有单字有 —— 所以这是个**明确标注**的功能,
   * 而不是伪装成连贯朗读。孩子知道它是逐字的,就不会觉得「读得很怪」。
   */
  const readLineByChar = (line: string) => {
    const chars = line.split('').filter((c) => /[\u4e00-\u9fa5]/.test(c))
    chars.forEach((ch, i) => {
      setTimeout(() => void playText(ch, 'zh_CN'), i * 1100)
    })
  }

  /** 慢速范读:英语听不清时最有效的一招,比反复原速重放强 */
  const playSlow = () => {
    if (!current) return
    if (isWord) playEnglishSlow(current.card.audioText ?? current.card.front)
    else void playText(current.card.audioText ?? current.card.front, 'zh_CN')
  }

  /** A/B 对比:先放范读,再放孩子自己的录音,差别一听就出来 */
  const compareAB = () => {
    if (!current) return
    playCurrent()
    setTimeout(() => {
      if (recPath) playFile(recPath)
    }, 2400)
  }

  const finish = (finalCorrect: number, total: number) => {
    // 走计划时,做完这一组就把进度推一格,并记下一步是什么
    if (inPlan) setNextStep(advancePlan() ?? null)
    noteUsage('finish', deck?.name ?? deckId, mode, total, total)
    const durationSec = Math.round((Date.now() - startedAt) / 1000)
    addStudyTime(durationSec)
    const res = finishSession({
      childId,
      deckId,
      mode,
      total,
      correct: finalCorrect,
      durationSec,
      // 「再练一遍」不算「今天这组练过了」—— 否则一早点它就会把今天的正课顶掉
      free: freePractice,
    })
    // 结算趣味化:掉贴纸、喂宠物、记每日挑战。任何一步出问题都不能挡住结算页。
    try {
      setGotSticker(awardSticker(finalCorrect, total) ?? null)
      const fed = feedPetDetailed(finalCorrect)
      setFeed(fed)
      setEvolved(fed.evolved)
      // 先画在「喂之前」的位置,下一帧再滑到「喂之后」—— 让孩子看见它长了一截
      setTimeout(() => setFeedAnim(true), 260)
      const chal = bumpChallenge()
      setChallengeDone(chal)
      // 升级判定要用「加分前后」的成长值对比
      const before = levelOf(res.newXp - res.pointsAwarded)
      const after = levelOf(res.newXp)
      if (after.cur.level > before.cur.level) setLeveledTo(`${after.cur.emoji} ${after.cur.name}`)
      noteSessionEnd({ correct: finalCorrect, total, bestCombo, challengeJustDone: chal })
      setNewBadges(claimNewAchievements(childId))
    } catch {
      /* 忽略 */
    }
    setCapped(!!res.capped)
    setSummary({ correct: finalCorrect, total, points: res.pointsAwarded })
    setPhase('done')
    // 一组练完是关键节点,把攒着的写入立刻落盘,别等合并窗口
    flushNow()
  }

  const resetPerCard = (nextIdx: number) => {
    setPhase('prompt')
    setPicked(null)
    setSpellInput('')
    setListening(false)
    setStars(-1)
    setSpeakMsg('')
    setRecPath('')
    setRecording(false)
    if (mode === 'listenChoose' || mode === 'dictation') {
      const c = cards[nextIdx].card
      playPrompt(c.audioText ?? c.front)
    } else if (mode === 'listenPic' || mode === 'listenPicEn') {
      playPic(cards[nextIdx].card)
    }
  }

  const advance = (wasCorrect: boolean) => {
    if (!current) return
    // 「再练一遍」不写 SRS —— 只是练手,不该改变复习计划
    if (!freePractice) applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
    if (wasCorrect) {
      setCombo((c) => {
        const n = c + 1
        setBestCombo((b) => Math.max(b, n))
        return n
      })
      setBurst((b) => b + 1)
      try {
        if (!quiet) Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    } else {
      setCombo(0)
      // 答错的题自动收进错题本,交给 SRS 安排重做
      try {
        autoAddErrorCard(childId, {
          front: current.card.front,
          back: current.card.back,
          subject: deck?.subject,
        })
      } catch {
        /* 忽略 */
      }
    }
    const nextCorrect = correct + (wasCorrect ? 1 : 0)
    setCorrect(nextCorrect)
    const total = cards.length
    if (idx + 1 >= total) finish(nextCorrect, total)
    else {
      const nextIdx = idx + 1
      setIdx(nextIdx)
      resetPerCard(nextIdx)
    }
  }

  const toggleSpeak = () => {
    if (!current) return
    if (!listening) {
      setListening(true)
      setSpeakMsg('聆听中…读完点「读完了」')
      setStars(-1)
      startRecognize(isWord ? 'en_US' : 'zh_CN', {
        onResult: (text) => {
          setListening(false)
          const r = scorePronunciation(text, current.card.front)
          setStars(r.stars)
          setSpeakMsg(r.message + (text ? `(听到:${text})` : ''))
          if (r.stars >= 2) setTimeout(() => advance(true), 1400)
        },
        onError: (msg) => {
          setListening(false)
          setSpeakMsg(msg + '(可点「我读对了」或跳过)')
        },
      })
    } else {
      stopRecognize()
      setSpeakMsg('识别中…')
    }
  }

  const toggleRecord = () => {
    if (!recording) {
      setRecording(true)
      startRecord(
        (path) => {
          /*
            孩子自己的录音也要**存成长期文件**。
            原先这里直接用临时路径 —— 退出小程序就没了,家长陪着录了一晚上,
            第二天想听听进步,什么都不剩。存下来之后,同一句再录会覆盖旧的,
            所以永远留着的是「最后一次」。
          */
          const target = current?.card.front ?? ''
          keepRecording(
            path,
            (saved) => {
              setRecPath(saved)
              if (target) saveMyVoice(target, saved, 'kid')
            },
            // 存不下来也别挡住练习:退回临时文件,这一次还能回放
            () => setRecPath(path),
          )
          setRecording(false)
        },
        () => setRecording(false),
      )
    } else {
      stopRecord()
    }
  }

  if (!ready) return <View className='sess' />

  if (cards.length === 0 && phase !== 'done') {
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>🎉</Text>
        <Text className='sess__big'>这个卡组今天学完啦!</Text>
        <Text className='sess__hint'>明天到期的卡片会自动出现</Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}><Text className='btn__t'>返回</Text></View>
      </View>
    )
  }

  if (phase === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    const sessStars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct > 0 ? 1 : 0
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</Text>
        <Text className='sess__big'>练完啦!</Text>
        <Text className='stars'>{'⭐'.repeat(sessStars)}{'☆'.repeat(3 - sessStars)}</Text>
        <View className='result'>
          <View className='result__cell'><Text className='result__num'>{summary.correct}/{summary.total}</Text><Text className='result__lab'>答对</Text></View>
          <View className='result__cell'><Text className='result__num result__num--sun'>+{summary.points}</Text><Text className='result__lab'>积分</Text></View>
        </View>
        {gotSticker ? (
          <View className='reward'>
            <Text className='reward__e'>{gotSticker.emoji}</Text>
            <Text className='reward__t'>获得新贴纸「{gotSticker.name}」!</Text>
          </View>
        ) : null}
        {leveledTo ? <Text className='reward__line'>🎉 升级啦!现在是 {leveledTo}</Text> : null}
        {newBadges.length > 0 ? (
          <View className='badges'>
            {newBadges.map((code) => {
              const a = getAchievement(code)
              if (!a) return null
              return (
                <View key={code} className='badge'>
                  <Text className='badge__e'>{a.emoji}</Text>
                  <Text className='badge__n'>{a.name}</Text>
                </View>
              )
            })}
            <Text className='reward__line'>解锁新徽章!</Text>
          </View>
        ) : null}
        {/*
          宠物进食过程。
          原先只有「进化了」这一个瞬间可见,中间那段「喂了几口、
          离下一次变身还差多少」全是黑的 —— 而养成类最抓人的恰恰是这段
          看得见的一点点靠近。现在每答对一题就是喂一口,进度条会当场滑一截。
        */}
        {feed && feed.ate > 0 ? (
          <View className='petbox'>
            <View className='petbox__row'>
              <Text className={feed.evolved ? 'petbox__e petbox__e--pop' : 'petbox__e'}>
                {feedAnim ? feed.emojiAfter : feed.emojiBefore}
              </Text>
              <View className='petbox__meta'>
                <Text className='petbox__t'>
                  {feed.evolved ? `变身成「${feed.stageName}」啦!` : `小家伙吃了 ${feed.ate} 口`}
                </Text>
                <Text className='petbox__n'>
                  一共吃了 {feed.after} 口
                  {feed.toNext > 0 ? ` · 再吃 ${feed.toNext} 口就变身` : ' · 已经长大啦'}
                </Text>
              </View>
            </View>
            <View className='petbox__track'>
              <View
                className='petbox__fill'
                style={{ width: `${Math.round((feedAnim ? feed.progress : feed.progressBefore) * 100)}%` }}
              />
            </View>
            <Text className='petbox__h'>每答对一题就喂它一口 —— 你学得越多,它长得越快。</Text>
          </View>
        ) : null}
        {challengeDone ? <Text className='reward__line'>🏆 今日挑战完成!</Text> : null}
        {/*
          撞上每日上限时要**说出来**。
          默默不加分,孩子只会觉得「这次怎么没涨」—— 那比不给分更伤。
          措辞也不能带责备:他没做错任何事,只是今天已经很够了。
        */}
        {capped ? (
          <Text className='reward__line'>🌙 今天的成长值已经拿满啦,明天再来接着涨</Text>
        ) : null}
        {inPlan && nextStep ? (
          <View
            className='btn btn--primary'
            onClick={() =>
              Taro.redirectTo({
                url: `/pages/session/index?deckId=${nextStep.deckId}&mode=${nextStep.mode}&plan=1&limit=${nextStep.limit}`,
              })
            }
          >
            <Text className='btn__t'>继续下一个 →</Text>
          </View>
        ) : null}
        {inPlan && !nextStep ? (
          <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
            <Text className='btn__t'>🎉 今天的做完啦</Text>
          </View>
        ) : null}
        {!inPlan ? (
          <View className='btn btn--primary' onClick={() => Taro.navigateBack()}><Text className='btn__t'>完成</Text></View>
        ) : null}
      </View>
    )
  }

  if (!current) return <View className='sess' />

  const spellCorrect = normalizeForCompare(spellInput) === normalizeForCompare(current.card.front)
  const poemLines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
  const poemMeta = current.card.extra as { author?: string; dynasty?: string } | undefined

  return (
    <View className='sess'>
      <View className='sess__bar'>
        <Text className='sess__exit' onClick={() => Taro.navigateBack()}>退出</Text>
        <View className='sess__track'><View className='sess__fill' style={{ width: `${(idx / cards.length) * 100}%` }} /></View>
        <Text className='sess__count'>{idx + 1}/{cards.length}</Text>
        {/*
          「这道不对」。4737 张卡是我生成的,自测查得了结构、查不了对错。
          错的东西会被孩子直接学进去,所以给家长一个随手能按的按钮 ——
          不弹窗、不打断,按一下就过去了,攒起来一起改。
        */}
        <Text
          className='sess__flag'
          onClick={() => {
            const c = cards[idx]?.card
            if (!c) return
            reportCard({
              id: c.id,
              front: c.front,
              back: c.back,
              deckName: deck?.name ?? '',
              mode: String(mode),
            })
            Taro.showToast({ title: '已标记', icon: 'none' })
          }}
        >
          ⚑
        </Text>
      </View>
      {combo >= 2 ? <Text className='combo'>🔥 连对 {combo}</Text> : null}
      {/* 睡前半小时不放彩带 —— 那是提高兴奋度的设计,这个时段该反着来 */}
      {burst > 0 && !quiet ? <CorrectBurst seed={burst} combo={combo} /> : null}
      {quiet ? <Text className='quiettip'>🌙 安静模式:快睡觉了,先不放彩带啦</Text> : null}

      {/* 认词 / 认字 */}
      {mode === 'recognize' && (
        <View className='card'>
          <Text className={isHanzi ? 'card__front card__front--hz' : 'card__front'}>{current.card.front}</Text>
          {!isHanzi && current.card.phonetic ? <Text className='card__ph'>/{current.card.phonetic}/</Text> : null}
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              {/* ⚠️ 两个分支拆成各自独立的「有/无」,不能写成 A : B ——
                  同一位置换节点类型(这里是 View ↔ Text)会报 _num。 */}
              {isHanzi ? (
                <View>
                  <Text className='card__back card__back--hz'>{current.card.phonetic}</Text>
                  {(current.card.extra as { word?: string } | undefined)?.word ? <Text className='card__extra'>组词:{(current.card.extra as { word?: string }).word}</Text> : null}
                  {/* 多音字:卡片只带一个读音,其它读音在这里补齐,每个都能点着听 */}
                  <PolyphoneNote ch={current.card.front} />
                </View>
              ) : null}
              {!isHanzi ? <Text className='card__back'>{current.card.back}</Text> : null}
              <View className='row'>
                <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>{isHanzi ? '不认识' : '没记住'}</Text></View>
                <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>{isHanzi ? '认识' : '记住了'}</Text></View>
              </View>
            </View>
          ) : null}
          {/* ⚠️ 拆成独立的「有/无」:上面那块没有 onClick,下面这个有,
              写成 A : B 会让同一位置的节点类型互换,真机报 _num。 */}
          {phase !== 'reveal' ? (
            <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>{isHanzi ? '看读音' : '看意思'}</Text></View>
          ) : null}
        </View>
      )}

      {/* 听音选义 / 听音选字 */}
      {mode === 'listenChoose' && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{isHanzi ? '听读音,选出正确的字' : '听发音,选出正确的意思'}</Text>
          <View className={isHanzi ? 'opts opts--grid' : 'opts'}>
            {options.map((opt) => {
              const answer = isHanzi ? current.card.front : current.card.back
              const show = picked !== null
              const isRight = opt === answer
              const cls = show ? (isRight ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={`${cls}${isHanzi ? ' opt--hz' : ''}`} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === answer), 550) }}>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
          {isHanzi && picked !== null ? <PolyphoneNote ch={current.card.front} /> : null}
        </View>
      )}

      {/* 拼写 */}
      {mode === 'spell' && (
        <View className='card'>
          <Text className='card__back'>{current.card.back}</Text>
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{current.card.front}</Text>
              {!spellCorrect ? <Text className='card__extra'>你写的:{spellInput || '(空)'}</Text> : null}
              <View className='btn btn--primary' onClick={() => advance(spellCorrect)}><Text className='btn__t'>下一个</Text></View>
            </View>
          ) : (
            <View className='card__form'>
              {/*
                低龄档不给键盘,给字母块。
                五六岁的孩子还不会用拼音键盘,一上来就要打字,拼写这一关
                考的就变成「会不会打字」而不是「会不会拼」—— 直接把人劝退。
                点选字母就没有这个门槛,还顺带认了字母。
              */}
              {useLetters ? (
                <View className='sp'>
                  <View className='sp__slots'>
                    <Text className='sp__word'>{spellInput || '　'}</Text>
                  </View>
                  <View className='sp__keys'>
                    {letterPool.map((ch, i) => (
                      <View
                        key={`${ch}-${i}`}
                        className='sp__k'
                        onClick={() => setSpellInput(spellInput + ch)}
                      >
                        <Text className='sp__kt'>{ch}</Text>
                      </View>
                    ))}
                  </View>
                  <View className='row'>
                    <View className='btn btn--gray' onClick={() => setSpellInput(spellInput.slice(0, -1))}>
                      <Text className='btn__t'>⌫ 删一个</Text>
                    </View>
                    <View className='btn btn--gray' onClick={() => setSpellInput('')}>
                      <Text className='btn__t'>重来</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Input className='inp' value={spellInput} onInput={(e) => setSpellInput(e.detail.value)} placeholder='输入英文' />
              )}
              <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>检查</Text></View>
            </View>
          )}
        </View>
      )}

      {/* 听写 */}
      {mode === 'dictation' && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>听发音,写出这个单词</Text>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{current.card.front}</Text>
              <Text className='card__back'>{current.card.back}</Text>
              {!spellCorrect ? <Text className='card__extra'>你写的:{spellInput || '(空)'}</Text> : null}
              <View className='btn btn--primary' onClick={() => advance(spellCorrect)}><Text className='btn__t'>下一个</Text></View>
            </View>
          ) : (
            <View className='card__form'>
              <Input className='inp' value={spellInput} onInput={(e) => setSpellInput(e.detail.value)} placeholder='听写英文' />
              <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>检查</Text></View>
            </View>
          )}
        </View>
      )}

      {/* 跟读:范读 + 录音回放 + 打分 */}
      {mode === 'speak' && (
        <View className='card'>
          <Text className='card__front'>{current.card.front}</Text>
          {current.card.phonetic ? <Text className='card__ph'>/{current.card.phonetic}/</Text> : null}
          <Text className='card__back'>{current.card.back}</Text>
          <View className='row row--wrap'>
            <View className='chip' onClick={playCurrent}><Text className='chip__t'>🔊 范读</Text></View>
            <View className='chip' onClick={playSlow}><Text className='chip__t'>🐢 慢速</Text></View>
            <View className='chip' onClick={toggleRecord}><Text className='chip__t'>{recording ? '⏹ 停止' : '🔴 录我读的'}</Text></View>
            {recPath ? <View className='chip' onClick={() => playFile(recPath)}><Text className='chip__t'>▶️ 回放</Text></View> : null}
            {recPath ? <View className='chip chip--ab' onClick={compareAB}><Text className='chip__t'>🆚 对比</Text></View> : null}
          </View>
          <View className={listening ? 'mic mic--on' : 'mic'} onClick={toggleSpeak}><Text className='mic__t'>{listening ? '🎙 读完了' : '🎤 跟读打分'}</Text></View>
          {stars >= 0 ? <Text className='stars'>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text> : null}
          {speakMsg ? <Text className='card__extra'>{speakMsg}</Text> : null}
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>跳过</Text></View>
            <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>我读对了</Text></View>
          </View>
        </View>
      )}

      {/* 古诗:朗读背诵 */}
      {mode === 'recite' && (
        <View className='card'>
          <Text className='poem__title'>{current.card.front}</Text>
          {/*
            自编的故事没有朝代和作者(亲子共读那一包),两边都空时整行不要 ——
            否则屏幕上会孤零零挂着一个「·」。
          */}
          {poemMeta?.dynasty || poemMeta?.author ? (
            <Text className='poem__meta'>
              {[poemMeta?.dynasty, poemMeta?.author].filter(Boolean).join('·')}
            </Text>
          ) : null}
          {/*
            逐字点读:每个字都是可点的小方块,点谁读谁。
            为什么不做整句自动连读 —— 目前没有可用的中文整句音源,
            按词拆开自动连播实测是「一个字一个字往外蹦」,反而更糟。
            让孩子自己点,既有声音又不难听,还顺便认了字。
          */}
          <View className='poem__body'>
            {(phase === 'reveal' ? [] : poemLines).map((l, i) => (
              <View key={i} className='poem__row'>
                {l.split('').map((ch, j) => (
                  <Text
                    key={`${i}-${j}`}
                    className='poem__ch'
                    onClick={() => void playText(ch, 'zh_CN')}
                  >
                    {ch}
                  </Text>
                ))}
                {/* 单句朗读;整句读不出来时管线会自动退回逐字 */}
                <Text className='poem__lineplay' onClick={() => void playText(l, 'zh_CN')}>
                  🔊
                </Text>
              </View>
            ))}
            {phase === 'reveal' ? (
              <Text className='poem__hidden'>先自己背一遍,想不起来再点「看诗句」</Text>
            ) : null}
            {/* 说明:上面这种「有/无」的条件渲染是安全的;要避免的是同一位置在
                带事件节点与静态节点之间互换(见 talk 页注释)。 */}
          </View>
          <View className='row row--wrap'>
            <View
              className='chip chip--main'
              onClick={() =>
                void playText(
                  // 标题和作者也要念出来 —— 孩子背诗本来就该连题目作者一起记
                  [
                    current.card.front,
                    poemMeta?.dynasty ? `${poemMeta.dynasty}·${poemMeta.author}` : poemMeta?.author,
                    ...poemLines,
                  ]
                    .filter(Boolean)
                    .join('，'),
                  'zh_CN',
                )
              }
            >
              <Text className='chip__t'>🔊 朗读整首</Text>
            </View>
            <View className='chip' onClick={() => setPhase(phase === 'reveal' ? 'prompt' : 'reveal')}>
              <Text className='chip__t'>{phase === 'reveal' ? '🙈 藏起来背' : '👀 看诗句'}</Text>
            </View>
          </View>
          <Text className='poem__tip'>整首读不出来时,点单个字也能听 —— 每个字都是可点的</Text>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>还不熟</Text></View>
            <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>会背了</Text></View>
          </View>
        </View>
      )}

      {/* 看拼音选字 */}
      {mode === 'pinyin' && (
        <View className='card'>
          <Text className='card__front card__front--py'>{current.card.phonetic ?? current.card.back}</Text>
          <Text className='card__tip'>这个读音是哪个字?</Text>
          <View className='opts opts--grid'>
            {pinyinOptions.map((opt) => {
              const answer = current.card.front
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={`${cls} opt--hz`}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    if (opt === answer) void playText(answer, 'zh_CN')
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
          {/* 选完才提示多音字 —— 提前显示等于把答案摆在题面上 */}
          {picked !== null ? <PolyphoneNote ch={current.card.front} /> : null}
        </View>
      )}

      {/* 磨耳朵:英中自动连播,孩子不用操作 */}
      {mode === 'earTrain' && (
        <View className='card'>
          <Text className='pic__emoji'>
            {(cards[earIdx]?.card.extra as { emoji?: string } | undefined)?.emoji ?? '🎵'}
          </Text>
          <Text className='ear__en'>
            {(cards[earIdx]?.card.extra as { en?: string } | undefined)?.en ?? ''}
          </Text>
          <Text className='ear__zh'>{cards[earIdx]?.card.front ?? ''}</Text>
          <Text className='card__tip'>
            {earOn ? '正在自动连播,躺着听就行' : '点下面开始,英语和中文轮流播'}
          </Text>
          <View className='btn btn--primary' onClick={() => setEarOn(!earOn)}>
            <Text className='btn__t'>{earOn ? '⏸ 暂停' : '▶️ 开始连播'}</Text>
          </View>
          <View className='btn btn--gray' onClick={() => finish(cards.length, cards.length)}>
            <Text className='btn__t'>听完了</Text>
          </View>
        </View>
      )}

      {/* 古诗:补全诗句 */}
      {mode === 'fillBlank' && blank && (
        <View className='card'>
          <Text className='poem__title'>{current.card.front}</Text>
          <View className='poem__body'>
            {blank.lines.map((l, i) => (
              <Text key={i} className={i === blank.hideIdx ? 'poem__line poem__line--blank' : 'poem__line'}>
                {i === blank.hideIdx ? (picked ? blank.answer : '　'.repeat(l.length)) : l}
              </Text>
            ))}
          </View>
          <Text className='card__tip'>选出缺少的那一句</Text>
          <View className='opts'>
            {blank.options.map((opt) => {
              const show = picked !== null
              const isRight = opt === blank.answer
              const cls = show ? (isRight ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={cls} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === blank.answer), 650) }}>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 错题本:看题回想 → 翻答案自评 */}
      {mode === 'review' && (
        <View className='card'>
          {(current.card.extra as { subject?: string } | undefined)?.subject ? (
            <Text className='tag'>{(current.card.extra as { subject?: string }).subject}</Text>
          ) : null}
          <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <View className='abox'><Text className='abox__lab'>答案</Text><Text className='abox__t'>{current.card.back}</Text></View>
              <View className='row'>
                <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>还没掌握</Text></View>
                <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>已掌握</Text></View>
              </View>
            </View>
          ) : null}
          {phase !== 'reveal' ? (
            <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>看答案</Text></View>
          ) : null}
        </View>
      )}

      {/* 看图选一选 / 英语·看图选词:大图在上,文字选项在下 */}
      {(mode === 'picChoose' || mode === 'picChooseEn') && (
        <View className='card'>
          <Text className='pic__emoji'>{(current.card.extra as { emoji?: string } | undefined)?.emoji ?? '❓'}</Text>
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{picEn ? '这是什么?选英语单词' : '这是什么?选出名字'}</Text>
          <View className='opts'>
            {picTextOptions.map((opt) => {
              const answer = picEn ? current.card.back : current.card.front
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    if (opt === answer) playPic(current.card)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 听音选图 / 英语·听音选图:听声音,在四张大图里点出来 */}
      {(mode === 'listenPic' || mode === 'listenPicEn') && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{picEn ? '听英语,点出正确的图' : '听一听,点出正确的图'}</Text>
          <View className='picgrid'>
            {picEmojiOptions.map((opt) => {
              const answer = (current.card.extra as { emoji?: string } | undefined)?.emoji ?? '❓'
              const show = picked !== null
              const cls = show
                ? opt === answer
                  ? 'picopt picopt--right'
                  : opt === picked
                    ? 'picopt picopt--wrong'
                    : 'picopt'
                : 'picopt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='picopt__e'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 常识问答·选一选 */}
      {mode === 'quiz' && (
        <View className='card'>
          <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          <View className='opts'>
            {quizOptions.map((opt) => {
              const answer = current.card.back
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Session)
