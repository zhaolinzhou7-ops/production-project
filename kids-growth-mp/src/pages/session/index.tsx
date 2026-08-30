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
  retireErrorCard,
  findOriginCard,
  dueTomorrow,
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
import { buildRedo, inferRedo, OPTION_LETTERS } from '../../core/redo'
import Examples from '../../components/Examples'
import { examplesFor, pluralPhrase } from '../../core/examples'
import { rateSession } from '../../core/scoreCard'
import CorrectBurst from '../../components/CorrectBurst'
import PolyphoneNote from '../../components/PolyphoneNote'
import { awardSticker, feedPetDetailed, bumpChallenge, type FeedResult } from '../../store/fun'
import type { StickerDef } from '../../core/stickers'
import type { LearnCard, LearnDeck, PracticeMode, RedoSpec } from '../../types'
import { saveMyVoice, getMyVoice } from '../../store/voice'
import { deckLevel, tuneDeckLevel } from '../../store/study'
import { specOf } from '../../core/adaptive'
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
  /** 明天有多少张卡到期 —— 结算页用它给一句预告 */
  const [tomorrowN, setTomorrowN] = useState(0)
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
  /** 这一组给几个选项 —— 由难度档决定(四选一变二选一,难度差比换词大得多) */
  const [optCount, setOptCount] = useState(4)
  /** 这一组结束后难度有没有变,结算页要说一声 */
  const [levelMoved, setLevelMoved] = useState<'up' | 'down' | 'keep'>('keep')

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
  /*
    幼儿段的结算页只留三样:星星、宠物长了一口、继续。

    原先一屏塞了八样反馈(星级、评语、积分、贴纸、宠物、每日挑战、成就、升级)。
    对 4 岁半来说这不是激励,是**噪音** —— 而且 15 分钟里真正做题只占 3 分钟,
    剩下的时间大半消耗在这类过场上。等级、成就、贴纸这些抽象符号
    ("Lv.7"、"徽章")他根本理解不了,占着屏幕纯属浪费。
    大孩子照旧全都看得到。
  */
  const simpleSummary = getStage() === 'toddler'
  const isWord = itemType === 'word'
  const isPic = itemType === 'pic'
  const isFact = itemType === 'fact'
  /** 看图题里的「英语档」:读英文、选英文 */
  const picEn = mode === 'picChooseEn' || mode === 'listenPicEn'
  /**
   * 这个卡组来自哪个内容包 —— 例句要靠它判断词类(见 core/examples)。
   * 自建卡组没有 builtinKey,那就不出例句(拿不准就不出)。
   */
  const packKey = deck?.builtinKey ?? ''

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
      /*
        题量与选项数跟着**这个卡组的难度档**走(见 core/adaptive)。
        计划里指定了题量时以计划为准 —— 那是家长/轻量档明确要的。
      */
      const spec = specOf(deckLevel(deckId))
      /*
        计划里带来的题量**就是**按难度档算好的(见 core/dailyPlan),
        所以直接用它;只有「今天不想学·3 题」这种明确的小数量才算覆盖。
        原先这里无条件让 limit 覆盖 spec,导致难度档的题量在主路径上从没生效过。
      */
      const useLimit = Number.isFinite(limitParam) && limitParam > 0 ? cardLimit : spec.size
      setOptCount(spec.choices)
      const d = getDeck(deckId) ?? null
      const all = getDeckCards(deckId)
      /*
        指定了 cardId 就**只做这一道**。

        错题本里家长常常是有目标的:「昨天这道加法他错了两次,今天先把它弄懂」。
        原来只能整本一起重做,那道题排在第几完全由算法决定 ——
        家长想做的那道可能压根没出现。现在点哪道就做哪道。
      */
      const onlyId = router.params.cardId || ''
      const list = onlyId
        ? getSessionCards(cid, deckId, 999, true).filter((x) => x.card.id === onlyId)
        : getSessionCards(cid, deckId, useLimit, freePractice)
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
        /*
          prefetchAudio 是**一次一句**的,而且要告诉它是中文还是英文 ——
          原先这里传了一个数组、也没传语言,等于这段预取从来没真正生效过。
          (tsc 抓到的;之前 tsc 因为配置报错直接退出,所以没拦住。)
        */
        const lang = (d?.itemType ?? 'word') === 'word' ? 'en' : 'zh'
        for (const x of list.slice(0, 12)) {
          prefetchAudio(x.card.audioText ?? x.card.front, lang)
        }
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

  const current = cards[idx]

  /**
   * 这道错题的重做规格(答错时就一起存下来的)。
   * 没有的话说明是手动记的老错题,退回「看题回想」。
   */
  const redo = useMemo(() => {
    const stored = (current?.card.extra as { redo?: RedoSpec } | undefined)?.redo
    if (stored) return stored
    /*
      **老错题也要能重做。**

      新做法只对「以后答错的题」生效,而错题本里已经攒着的那些一条 redo 都没有 ——
      家长打开一看和以前一模一样,会以为根本没改。
      所以这里按题干和答案现推一份:数字答案当算术题让他重算,
      其它做成选择题,干扰项从错题本里别的题的答案里挑。
    */
    if (!current || mode !== 'review') return undefined
    return inferRedo(
      {
        front: current.card.front,
        back: current.card.back,
        emoji: (current.card.extra as { emoji?: string } | undefined)?.emoji,
      },
      allCards.map((c) => ({ front: c.front, back: c.back })),
      // 先回内容包里找原题 —— 找得到就按原来那种形式出,不会把点图题换成选词题
      (c) => findOriginCard(childId, c.front, c.back),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, allCards, childId])

  /**
   * 重做题的朗读。
   *
   * 语言**以文本本身为准**,不只看存下来的 lang。
   * 老错题里的 lang 可能缺失或过时(那些卡是好几个版本前存的),
   * 而「一句纯英文被当成中文念」听起来就是彻底错的 ——
   * 一眼能判断的事,不该依赖一个可能没存对的字段。
   *
   * 英文走 playWordAudio(真人音源管线),不走 playText:
   * 后者会先试中文插件,英文交给它容易读出中文腔。
   */
  const playRedoAudio = () => {
    if (!redo || redo.type === 'input') return
    const text = redo.audio ?? ''
    if (!text) return
    const declaredEn = redo.type === 'choice' && redo.lang === 'en'
    if (declaredEn || /^[A-Za-z][A-Za-z\s'’.\-!?,]*$/.test(text.trim())) {
      void playWordAudio(text)
      return
    }
    void playText(text, 'zh_CN')
  }

  /** 算术错题:重做时输入答案 */
  const [redoInput, setRedoInput] = useState('')
  const [redoMark, setRedoMark] = useState<'none' | 'ok' | 'no'>('none')
  const submitRedo = () => {
    if (!redo || redo.type !== 'input') return
    if (redoMark !== 'none') return
    const right = redoInput.trim() !== '' && Number(redoInput.trim()) === redo.answer
    setRedoMark(right ? 'ok' : 'no')
    setTimeout(
      () => {
        setRedoInput('')
        setRedoMark('none')
        advance(right)
      },
      right ? 520 : 1200,
    )
  }

  /** 拼写类错题:比对文本,不比数字 */
  const submitRedoSpell = () => {
    if (!redo || redo.type !== 'spell' || redoMark !== 'none') return
    const right = normalizeForCompare(redoInput) === normalizeForCompare(redo.answer)
    setRedoMark(right ? 'ok' : 'no')
    setTimeout(
      () => {
        setRedoInput('')
        setRedoMark('none')
        advance(right)
      },
      right ? 620 : 1500,
    )
  }

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
    if (mode === 'earTrain' || mode === 'listenChoose' || mode === 'dictation') return
    if (mode === 'listenPic' || mode === 'listenPicEn') return
    const card = cards[idx]?.card
    if (!card || phase !== 'prompt') return

    /*
      **错题重做走自己的朗读,而且不限年龄。**

      这里原先无条件念 `card.front`、而且写死 'zh_CN' —— 错题卡的 front 是中文
      (看图卡的正面就是中文名),于是一道英文题被用中文念了出来。
      用户看到的「错题都是中文读」就是这一行造成的。

      而且点图题**必须**出声:四张图摆在那儿不响,他根本无从判断该点哪个,
      那道题就变成了瞎猜 —— 所以这一条对大孩子同样生效。
    */
    if (mode === 'review') {
      if (!redo || redo.type === 'input') return
      const timer = setTimeout(() => playRedoAudio(), 420)
      return () => clearTimeout(timer)
    }

    // 以下是「低龄:每换一张卡就把题目念出来」,大孩子自己会读,不用念
    if (getStage() !== 'toddler') return
    const timer = setTimeout(() => {
      void playText(card.audioText ?? card.front, 'zh_CN')
    }, 420)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cards, mode, phase, redo])

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
    /*
      第二遍放的是**例句**,不是中文翻译。

      原先是「英语 → 中文」轮流播。中文一出来,孩子的注意力就落在中文上了,
      英语那句变成背景音 —— 磨耳朵磨的其实是中文。
      换成「apple → an apple」之后,他听到的全是英语,而且第二遍
      正好把这个词放进了一个短语里,比单蹦一个词有用得多。
    */
    const follow = en ? examplesFor(en, packKey, en)[0] : ''
    const t1 = setTimeout(() => {
      if (alive && follow) void playWordAudio(follow)
      else if (alive && en) void playWordAudio(en)
    }, 2400)
    const t2 = setTimeout(() => {
      if (alive) setEarIdx((i) => (i + 1) % cards.length)
    }, 5200)
    return () => {
      alive = false
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [earOn, earIdx, cards, mode, packKey])

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


  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    /*
      **英语的听音选题不再出中文选项。**

      原先是「听英文发音 → 在四个中文释义里选」。那练的其实是中译英的对应表,
      不是听力:他先把声音翻成中文,再去找那个中文。
      现在选项也是英文 —— 听到 cat 就在 cat / cap / cut 里点出 cat,
      练的是**听辨**本身,而且全程没有中文。
    */
    const answer = isHanzi ? current.card.front : isWord ? current.card.front : current.card.back
    const src = isHanzi || isWord ? poolFront : poolBack
    const distractors = shuffle(src.filter((b) => b !== answer)).slice(0, optCount - 1)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolBack, poolFront, isHanzi, isWord, optCount])

  const blank = useMemo(() => {
    if (!current || mode !== 'fillBlank') return null
    const lines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
    if (lines.length === 0) return null
    const hideIdx = Math.floor(Math.random() * lines.length)
    const answer = lines[hideIdx]
    const own = new Set(lines)
    const distractors = shuffle(linePool.filter((l) => !own.has(l) && l.length === answer.length)).slice(0, optCount - 1)
    return { lines, hideIdx, answer, options: shuffle([answer, ...distractors]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, linePool, idx])

  /** 看图题「选文字」:选项是中文名或英文名 */
  const picTextOptions = useMemo(() => {
    if (!current || (mode !== 'picChoose' && mode !== 'picChooseEn')) return []
    const pick = (c: LearnCard) => (mode === 'picChooseEn' ? c.back : c.front)
    const answer = pick(current.card)
    const distractors = shuffle(allCards.filter((c) => pick(c) !== answer).map(pick)).slice(0, optCount - 1)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards, childId])

  /** 看图题「选图片」:选项是 emoji */
  const picEmojiOptions = useMemo(() => {
    if (!current || (mode !== 'listenPic' && mode !== 'listenPicEn')) return []
    const emojiOf = (c: LearnCard) => (c.extra as { emoji?: string } | undefined)?.emoji ?? '❓'
    const answer = emojiOf(current.card)
    const distractors = shuffle(allCards.filter((c) => emojiOf(c) !== answer).map(emojiOf)).slice(0, optCount - 1)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards, childId])

  /** 看拼音选字:选项是汉字,题面是拼音 */
  const pinyinOptions = useMemo(() => {
    if (!current || mode !== 'pinyin') return []
    const answer = current.card.front
    const distractors = shuffle(allCards.filter((c) => c.front !== answer).map((c) => c.front)).slice(0, optCount - 1)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards, childId])

  /**
   * 拼写题的字母块:目标单词的字母 + 几个干扰字母,打乱顺序。
   * 只在低龄档用(见下面 useLetters 的说明)。
   */
  const letterPool = useMemo(() => {
    if (!current || mode !== 'spell') return []
    // 看图卡的英文在 extra.en 里,不能用 front(那是中文)
    const en =
      itemType === 'pic'
        ? ((current.card.extra as { en?: string } | undefined)?.en ?? current.card.back)
        : current.card.front
    const word = en.toLowerCase().replace(/[^a-z]/g, '')
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
    const distractors = shuffle(allCards.filter((c) => c.back !== answer).map((c) => c.back)).slice(0, optCount - 1)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards, childId])

  const playCurrent = () => {
    if (!current) return
    /*
      拼写和听写读的**一定是英文**。
      看图卡走 playPic 时会按 picEn 判断读中文还是英文,而拼写/听写这两档
      本来就是英语练法 —— 读中文等于把答案念给他听之外还念错了语言。
    */
    if (mode === 'spell' || mode === 'dictation') {
      const en =
        itemType === 'pic'
          ? ((current.card.extra as { en?: string } | undefined)?.en ?? current.card.back)
          : current.card.front
      void playWordAudio(en)
      return
    }
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
    // 按最近几组的正确率升降难度 —— 让他一直待在「刚好够得着」的地方
    if (!freePractice) {
      try {
        setLevelMoved(tuneDeckLevel(childId, deckId))
      } catch {
        /* 忽略 */
      }
    }
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
    setTomorrowN(dueTomorrow(childId))
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

  /*
    换题后的**防误点锁**。

    选中一个答案后要停 0.5 秒左右让孩子看到对错,然后才换下一题。
    问题在于:如果他在这半秒里又戳了一下同一个位置,那一下会正好落在
    **刚渲染出来的下一题**的选项上 —— 题目他连看都没看到就被判了。
    4 岁半的孩子手快、爱连点,这事几乎每次都会发生。

    所以换题之后的 400 毫秒内,选项一律不响应。
  */
  const lockRef = useRef(0)
  const locked = () => Date.now() < lockRef.current

  const advance = (wasCorrect: boolean) => {
    if (!current) return
    lockRef.current = Date.now() + 400
    /*
      错题重做**做对就消失**。

      原先做完一轮列表一条没少,孩子看不到自己「消灭」了什么 ——
      那件事本身就没意思了。4 岁半需要的是立刻看见结果:做对一道它就没了,
      列表短一格,这才是他愿意再来一轮的理由。
      蒙对了也不要紧:同一道题下次再错会重新进来。
    */
    if (mode === 'review' && wasCorrect && !freePractice) {
      try {
        retireErrorCard(childId, current.card.id)
      } catch {
        /* 移除失败不该打断做题 */
      }
    }
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
      /*
        答错的题自动收进错题本,交给 SRS 安排重做。

        关键是**把「怎么重做」一起存进去**:干扰项就是他刚才看到的那几个,
        题面还是那张图、那个音。重做时他面对的是同一道题,而不是
        「看一眼答案然后自己说会了」—— 后者对 4 岁半的孩子等于没有。
      */
      try {
        autoAddErrorCard(childId, {
          front: current.card.front,
          back: current.card.back,
          subject: deck?.subject,
          redo: buildRedo({
            mode,
            itemType,
            card: {
              front: current.card.front,
              back: current.card.back,
              emoji: (current.card.extra as { emoji?: string } | undefined)?.emoji,
              en: (current.card.extra as { en?: string } | undefined)?.en,
            },
            pool: allCards.map((c) => ({
              front: c.front,
              back: c.back,
              emoji: (c.extra as { emoji?: string } | undefined)?.emoji,
              en: (c.extra as { en?: string } | undefined)?.en,
            })),
          }),
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
    /*
      这一组的星级与评语走 core/scoreCard 的 rateSession。
      分数低时给的是「这组太难啦,不是你的问题」—— 措辞很要紧:
      4 岁半的孩子做错一半,九成是我题出难了,不该让他把这个记成自己的失败。
    */
    const rated = rateSession(summary.correct, summary.total)
    const sessStars = rated.stars
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</Text>
        <Text className='sess__big'>练完啦!</Text>
        <Text className='stars'>{'⭐'.repeat(sessStars)}{'☆'.repeat(3 - sessStars)}</Text>
        {rated.msg ? <Text className='ratemsg'>{rated.msg}</Text> : null}
        <View className='result'>
          <View className='result__cell'><Text className='result__num'>{summary.correct}/{summary.total}</Text><Text className='result__lab'>答对</Text></View>
          <View className='result__cell'><Text className='result__num result__num--sun'>+{summary.points}</Text><Text className='result__lab'>积分</Text></View>
        </View>
        {!simpleSummary && gotSticker ? (
          <View className='reward'>
            <Text className='reward__e'>{gotSticker.emoji}</Text>
            <Text className='reward__t'>获得新贴纸「{gotSticker.name}」!</Text>
          </View>
        ) : null}
        {!simpleSummary && leveledTo ? <Text className='reward__line'>🎉 升级啦!现在是 {leveledTo}</Text> : null}
        {!simpleSummary && newBadges.length > 0 ? (
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
        {!simpleSummary && challengeDone ? <Text className='reward__line'>🏆 今日挑战完成!</Text> : null}
        {/*
          撞上每日上限时要**说出来**。
          默默不加分,孩子只会觉得「这次怎么没涨」—— 那比不给分更伤。
          措辞也不能带责备:他没做错任何事,只是今天已经很够了。
        */}
        {levelMoved === 'up' ? (
          <Text className='reward__line'>📈 做得很稳,下次会难一点点</Text>
        ) : null}
        {levelMoved === 'down' ? (
          <Text className='reward__line'>🌤️ 这组有点难,下次我调简单一些</Text>
        ) : null}
        {capped ? (
          <Text className='reward__line'>🌙 今天的成长值已经拿满啦,明天再来接着涨</Text>
        ) : null}
        {/*
          明天预告。
          一次学习结束的那一刻,决定的是「明天他还会不会来」。
          一句具体的数字比「明天见」有效得多 ——
          它把明天从「又要学习」变成「有东西在等我」。
        */}
        {tomorrowN > 0 ? (
          <Text className='reward__line'>📅 明天有 {tomorrowN} 个在等你,记得来</Text>
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

  /**
   * 拼写/听写要拼的那个英文词。
   *
   * 单词卡的正面就是英文;而**看图卡的正面是中文**,英文在 extra.en 里 ——
   * 照搬 front 会变成让他拼「猫」这个汉字,拼写这一档直接废掉。
   * 难度阶梯的最高两档(拼出来、听写)走的正是看图卡,所以这里必须分开取。
   */
  const spellTarget =
    itemType === 'pic'
      ? ((current.card.extra as { en?: string } | undefined)?.en ?? current.card.back)
      : current.card.front
  const spellCorrect = normalizeForCompare(spellInput) === normalizeForCompare(spellTarget)
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
              {/* 英语单词:释义之外再给例句,「知道意思」和「会用」是两件事 */}
              {isWord ? <Examples word={current.card.front} packKey={packKey} zh={current.card.back} /> : null}
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
          <Text className='card__tip'>
            {isHanzi ? '听读音,选出正确的字' : '听一听,选出你听到的那个词'}
          </Text>
          <View className={isHanzi ? 'opts opts--grid' : 'opts'}>
            {options.map((opt) => {
              const answer = isHanzi || isWord ? current.card.front : current.card.back
              const show = picked !== null
              const isRight = opt === answer
              const cls = show ? (isRight ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={`${cls}${isHanzi ? ' opt--hz' : ''}`} onClick={() => { if (picked || locked()) return; setPicked(opt); setTimeout(() => advance(opt === answer), 550) }}>
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
          {/*
            拼写的题面**不给中文**:听发音 + 看图,把这个词拼出来。
            原先是「看中文拼单词」,那是在练中译英;现在练的是音—形对应,
            也就是自然拼读真正要练的那件事。
          */}
          {(current.card.extra as { emoji?: string } | undefined)?.emoji ? (
            <Text className='pic__emoji'>{(current.card.extra as { emoji?: string }).emoji}</Text>
          ) : null}
          <Text className='card__tip'>听一听,把这个词拼出来</Text>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{spellTarget}</Text>
              {!spellCorrect ? <Text className='card__extra'>你写的:{spellInput || '(空)'}</Text> : null}
              <Examples word={current.card.front} packKey={packKey} zh={current.card.back} />
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
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{spellTarget}</Text>
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

      {/*
        英语·跟我读 —— 「读单词」那一环。

        原先整套系统里,英语单词只有「听」和「选」,**没有一个地方让他开口读**。
        而语音是要靠肌肉记忆的:听一百遍不如自己读十遍。

        流程刻意做短:范读 → 他读 → 家长判。中间可以录下来回放,
        但不强制 —— 录音是给他听自己进步用的,不该变成练习的门槛。
        判定同样交给家长:语音识别对 4 岁半的英语发音基本不可用,
        会把对的判成错,而那是最打击人的一种错。
      */}
      {mode === 'speakEn' && (
        <View className='card card--say'>
          <Text className='say__e'>{(current.card.extra as { emoji?: string } | undefined)?.emoji ?? '🔤'}</Text>
          <Text className='say__en'>{(current.card.extra as { en?: string } | undefined)?.en ?? current.card.back}</Text>
          {/*
            跟我读这一步**不给中文**。
            他要练的是「看到这个词就读出来」,中文摆在旁边只会让他先去看中文。
            图已经在上面了 —— 意思靠图,不靠翻译。
          */}
          <View className='row row--wrap'>
            <View className='chip' onClick={() => playWordAudio((current.card.extra as { en?: string } | undefined)?.en ?? current.card.back)}>
              <Text className='chip__t'>🔊 听范读</Text>
            </View>
            <View className={recording ? 'chip chip--rec' : 'chip'} onClick={() => toggleRecord()}>
              <Text className='chip__t'>{recording ? '⏹ 停' : '🎙 录下来'}</Text>
            </View>
            {recPath || getMyVoice(current.card.front, 'kid') ? (
              <View className='chip' onClick={() => playFile(recPath || getMyVoice(current.card.front, 'kid'))}>
                <Text className='chip__t'>▶️ 回放</Text>
              </View>
            ) : null}
          </View>
          {/* 单词读完接着读例句:组词 → 短语 → 句子,一次学到位 */}
          <Examples
            word={(current.card.extra as { en?: string } | undefined)?.en ?? current.card.back}
            packKey={packKey}
            zh={current.card.front}
          />
          <Text className='say__hint'>下面由家长点</Text>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}>
              <Text className='btn__t'>再试试</Text>
            </View>
            <View className='btn btn--mint' onClick={() => advance(true)}>
              <Text className='btn__t'>读对了</Text>
            </View>
          </View>
        </View>
      )}

      {/*
        说给我听 —— 补上「产出」这一环。

        原先幼儿段五种练法里有四种是四选一,一种是被动听:**没有一个需要他产出**。
        而四选一有 25% 的蒙对率,答对不等于会;认知科学里最稳的结论之一是
        「主动想出来」的留存远高于「认出来」。

        判定交给家长而不是语音识别 —— 4 岁半的发音识别准确率极低,
        会把对的判成错;而家长一秒就知道。这同时把家长拉进了学习过程,
        这个年纪最有效的学习本来就是亲子互动,不是孩子对着屏幕。
      */}
      {mode === 'sayIt' && (
        <View className='card card--say'>
          {isPic ? (
            <Text className='say__e'>{(current.card.extra as { emoji?: string } | undefined)?.emoji ?? '🖼️'}</Text>
          ) : null}
          {!isPic ? <Text className='say__w'>{current.card.front}</Text> : null}
          <Text className='say__ask'>这是什么?说给爸爸妈妈听</Text>
          {phase === 'reveal' ? (
            <View className='say__ans'>
              <Text className='say__a'>{current.card.front}</Text>
              {current.card.back ? <Text className='say__b'>{current.card.back}</Text> : null}
            </View>
          ) : null}
          <View className='row row--wrap'>
            <View className='chip' onClick={playCurrent}>
              <Text className='chip__t'>🔊 听一遍</Text>
            </View>
            {phase === 'prompt' ? (
              <View className='chip' onClick={() => setPhase('reveal')}>
                <Text className='chip__t'>👀 看答案</Text>
              </View>
            ) : null}
          </View>
          <Text className='say__hint'>下面由家长点</Text>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}>
              <Text className='btn__t'>差一点</Text>
            </View>
            <View className='btn btn--mint' onClick={() => advance(true)}>
              <Text className='btn__t'>说对了</Text>
            </View>
          </View>
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
            {/* 回放按**存档**判断 —— 退出重进也该还在(录音从 v47 起就是持久化的) */}
            {recPath || getMyVoice(current.card.front, 'kid') ? (
              <View className='chip' onClick={() => playFile(recPath || getMyVoice(current.card.front, 'kid'))}>
                <Text className='chip__t'>▶️ 回放</Text>
              </View>
            ) : null}
            {recPath || getMyVoice(current.card.front, 'kid') ? (
              <View className='chip chip--ab' onClick={compareAB}><Text className='chip__t'>🆚 对比</Text></View>
            ) : null}
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
                    if (picked || locked()) return
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
          <Text className='ear__zh'>
            {examplesFor(
              (cards[earIdx]?.card.extra as { en?: string } | undefined)?.en ?? '',
              packKey,
              (cards[earIdx]?.card.extra as { en?: string } | undefined)?.en,
            )[0] ?? ''}
          </Text>
          <Text className='card__tip'>
            {earOn ? '正在自动连播,躺着听就行' : '点下面开始,单词和例句轮流播(纯英文)'}
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
                <View key={opt} className={cls} onClick={() => { if (picked || locked()) return; setPicked(opt); setTimeout(() => advance(opt === blank.answer), 650) }}>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 错题本:看题回想 → 翻答案自评 */}
      {/*
        错题重做 —— **以它当初被答错的那种形式**回来。

        原先只有一种:看题干 → 点「看答案」→ 自己点「已掌握 / 还没掌握」。
        那对一个不识字的 4 岁半孩子等于没有:他读不了题干,更不可能诚实地
        评判自己 —— 自评是成年人才做得到的事。
        现在选择题错的还是选择题(A–E),算术算错的还是让他算。
      */}
      {mode === 'review' && redo?.type === 'choice' ? (
        <View className='card'>
          {(current.card.extra as { subject?: string } | undefined)?.subject ? (
            <Text className='tag'>{(current.card.extra as { subject?: string }).subject}</Text>
          ) : null}
          {redo.emoji ? <Text className='pic__emoji'>{redo.emoji}</Text> : null}
          {redo.audio ? (
            <View className='audio' onClick={() => playRedoAudio()}>
              <Text className='audio__t'>🔊</Text>
            </View>
          ) : null}
          {!redo.emoji ? (
            <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          ) : null}
          <Text className='card__tip'>上次这道没做对,再试一次</Text>
          {/*
            **图选项要摆成图**,不能挤在文字行里。
            听音选图错的题,重做时还是听音选图 —— 这是「不要换类型」的最后一环:
            光是选项内容对了不够,呈现方式也得是原来那个样子,
            否则孩子看到的仍然是「一列字」。
          */}
          {redo.optionKind === 'emoji' ? (
            <View className='picgrid'>
              {redo.options.map((opt) => {
                const show = picked !== null
                const cls = show
                  ? opt === redo.answer
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
                      if (picked || locked()) return
                      setPicked(opt)
                      const right = opt === redo.answer
                      if (right) playRedoAudio()
                      setTimeout(() => advance(right), right ? 620 : 1100)
                    }}
                  >
                    <Text className='picopt__e'>{opt}</Text>
                  </View>
                )
              })}
            </View>
          ) : null}
          {redo.optionKind !== 'emoji' ? (
          <View className='opts'>
            {redo.options.map((opt, oi) => {
              const show = picked !== null
              const cls = show
                ? opt === redo.answer
                  ? 'opt opt--right'
                  : opt === picked
                    ? 'opt opt--wrong'
                    : 'opt'
                : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked || locked()) return
                    setPicked(opt)
                    const right = opt === redo.answer
                    if (right) playRedoAudio()
                    setTimeout(() => advance(right), right ? 620 : 1100)
                  }}
                >
                  {/* A B C D E:给每个选项一个字母,家长报题、孩子指认都方便 */}
                  <Text className='opt__k'>{OPTION_LETTERS[oi] ?? ''}</Text>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
          ) : null}
        </View>
      ) : null}

      {/* 拼写/听写错的 → 还是让他拼一遍,不换成选择题 */}
      {mode === 'review' && redo?.type === 'spell' ? (
        <View className='card'>
          {redo.emoji ? <Text className='pic__emoji'>{redo.emoji}</Text> : null}
          <View className='audio audio--big' onClick={() => void playWordAudio(redo.answer)}>
            <Text className='audio__t'>🔊</Text>
          </View>
          <Text className='card__tip'>上次这个词没拼对,再拼一次</Text>
          {redoMark === 'none' ? (
            <View className='card__form'>
              <Input
                className='inp'
                value={redoInput}
                onInput={(e) => setRedoInput(e.detail.value)}
                placeholder='输入英文'
              />
              <View className='btn btn--primary' onClick={submitRedoSpell}>
                <Text className='btn__t'>检查</Text>
              </View>
            </View>
          ) : null}
          {redoMark !== 'none' ? (
            <View className='card__reveal'>
              <Text className={redoMark === 'ok' ? 'card__front card__front--ok' : 'card__front card__front--no'}>
                {redo.answer}
              </Text>
              {redoMark === 'no' ? <Text className='card__extra'>你写的:{redoInput || '(空)'}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 跟我读错的 → 还是听范读、读出来、家长判 */}
      {mode === 'review' && redo?.type === 'speak' ? (
        <View className='card card--say'>
          <Text className='say__e'>{redo.emoji ?? '🔤'}</Text>
          <Text className='say__en'>{redo.answer}</Text>
          <View className='row row--wrap'>
            <View className='chip' onClick={() => void playWordAudio(redo.answer, 2)}>
              <Text className='chip__t'>🔊 听范读</Text>
            </View>
            <View className={recording ? 'chip chip--rec' : 'chip'} onClick={() => toggleRecord()}>
              <Text className='chip__t'>{recording ? '⏹ 停' : '🎙 录下来'}</Text>
            </View>
            {recPath ? (
              <View className='chip' onClick={() => playFile(recPath)}>
                <Text className='chip__t'>▶️ 回放</Text>
              </View>
            ) : null}
          </View>
          <Text className='say__hint'>上次这个词没读对,下面由家长点</Text>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}>
              <Text className='btn__t'>还要练</Text>
            </View>
            <View className='btn btn--mint' onClick={() => advance(true)}>
              <Text className='btn__t'>读对了</Text>
            </View>
          </View>
        </View>
      ) : null}

      {mode === 'review' && redo?.type === 'input' ? (
        <View className='card'>
          <Text className='tag'>数学</Text>
          <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          {/* 算错的题重做时也带着那张图 —— 让他数出来,而不是回想答案 */}
          {redo.visual ? (
            <View className='vis'>
              {redo.visual.groups.map((g, gi) => (
                <View key={gi} className='vis__row'>
                  {gi > 0 && redo.visual!.ops[gi - 1] ? (
                    <Text className='vis__op'>{redo.visual!.ops[gi - 1]}</Text>
                  ) : null}
                  <View className='vis__items'>
                    {Array.from({ length: g.n }).map((_, i) => {
                      const struck =
                        gi === 0 && !!redo.visual!.strike && i >= g.n - (redo.visual!.strike as number)
                      return (
                        <Text key={i} className={struck ? 'vis__i vis__i--out' : 'vis__i'}>
                          {g.emoji}
                        </Text>
                      )
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          <Input
            className={
              redoMark === 'ok' ? 'redo__inp redo__inp--ok' : redoMark === 'no' ? 'redo__inp redo__inp--no' : 'redo__inp'
            }
            type='number'
            value={redoInput}
            onInput={(e) => setRedoInput(e.detail.value)}
            onConfirm={submitRedo}
            placeholder='?'
          />
          {redoMark === 'no' ? <Text className='redo__ans'>正确答案:{redo.answer}</Text> : null}
          <View className='btn btn--primary' onClick={submitRedo}>
            <Text className='btn__t'>{redoMark === 'none' ? '确定' : '下一题'}</Text>
          </View>
        </View>
      ) : null}

      {/* 没有重做规格的老错题(手动记的、或旧版本存下来的):还是回想自评 */}
      {mode === 'review' && !redo ? (
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
      ) : null}

      {/* 看图选一选 / 英语·看图选词:大图在上,文字选项在下 */}
      {(mode === 'picChoose' || mode === 'picChooseEn') && (
        <View className='card'>
          <Text className='pic__emoji'>{(current.card.extra as { emoji?: string } | undefined)?.emoji ?? '❓'}</Text>
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>
            {picEn ? '这是什么?先听听每个词,再选' : '这是什么?选出名字'}
          </Text>
          <View className='opts'>
            {picTextOptions.map((opt, oi) => {
              const answer = picEn ? current.card.back : current.card.front
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={cls}>
                  {/*
                    **每个选项都能单独点着听。**

                    原先只有正确答案会出声(而且是在选完之后)。后果是:孩子看到图
                    就知道是山羊,于是在四个他读不出来的词里瞎点一个 ——
                    答对了,但他既不知道 goat 怎么读,也不知道另外三个是什么。
                    那道题练的是「认图」,不是英语。

                    现在左边那个 🔊 可以逐个试听:他要先听出哪一个读作 goat,
                    才点得对。这一下就把题目从「认图」变成了**音—形—义三者对上**,
                    而这正是拼读的地基。
                  */}
                  <Text
                    className='opt__spk'
                    onClick={() => {
                      if (locked()) return
                      void playWordAudio(opt)
                    }}
                  >
                    🔊
                  </Text>
                  <Text className='opt__k'>{OPTION_LETTERS[oi] ?? ''}</Text>
                  <Text
                    className='opt__t'
                    onClick={() => {
                      if (picked || locked()) return
                      setPicked(opt)
                      // 选完把正确答案再读一遍 —— 错了也要听见对的那个长什么样
                      if (picEn) void playWordAudio(answer)
                      else playPic(current.card)
                      setTimeout(() => advance(opt === answer), opt === answer ? 700 : 1200)
                    }}
                  >
                    {opt}
                  </Text>
                </View>
              )
            })}
          </View>
          {/*
            答完之后给例句 —— 这是「学完一个词」真正的最后一步。
            纯英文,不给中文释义:这个年纪要建立的是「英语—画面」的直接联系,
            中间插一道翻译,他会养成「先翻成中文再理解」的习惯,
            那个习惯以后要花好几年去掉。
          */}
          {picked && picEn ? (
            <Examples
              word={(current.card.extra as { en?: string } | undefined)?.en ?? current.card.back}
              packKey={packKey}
              emoji={(current.card.extra as { emoji?: string } | undefined)?.emoji}
              zh={current.card.front}
            />
          ) : null}
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
                    if (picked || locked()) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='picopt__e'>{opt}</Text>
                </View>
              )
            })}
          </View>
          {/*
            答完之后把**那个词本身**亮出来并读一遍。

            「听音选图」有一个真实的风险:孩子可能只是记住了「听到这个声音就点那只猫」,
            而从没把那个声音和 c-a-t 这个词联系起来 —— 换一批图他就不会了。
            把词摆出来,是把「声音—图」这条单线,变成「声音—词—图」的三角。
            (阶梯后面两档「拼出来」「听写」没有图也没有选项,那两关**无法靠记图片通过** ——
            那才是这件事的结构性答案,这里只是提前打个底。)
          */}
          {picked && picEn ? (
            <View
              className='afterpic'
              onClick={() =>
                void playWordAudio(
                  (current.card.extra as { en?: string } | undefined)?.en ?? current.card.back,
                )
              }
            >
              <Text className='afterpic__w'>
                {(current.card.extra as { en?: string } | undefined)?.en ?? current.card.back}
              </Text>
              <Text className='afterpic__h'>🔊 再听一遍这个词</Text>
            </View>
          ) : null}
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
                    if (picked || locked()) return
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
