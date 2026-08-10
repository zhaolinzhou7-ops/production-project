import { useState } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { defaultPacksForStage } from '../../core/learningContent'
import { modesFor, repeatModesFor } from '../../core/practiceModes'
import {
  getCurrentChildId,
  ensureBuiltinDeck,
  listChildDecks,
  countDueByDeck,
  getPoints,
  getStudyStreak,
  getTodayStudyMinutes,
  getStage,
  hasStage,
  setStage,
  getBirthdate,
  setBirthdate,
  syncDeckContent,
  sanitizeData,
  getDailyGoal,
  todayAnswered,
  deckSignals,
  todayByArea,
  yesterdayScore,
  recordTodayScore,
} from '../../store/study'
import { readObject, clearAll } from '../../store/db'
import { currentError, clearErrors, formatWhen, type ErrEntry } from '../../lib/errlog'
import { diagnoseAudio, playText, type DiagLine } from '../../lib/audio'
import { BUILD_TAG } from '../../lib/version'
import { getChallenge, ownedStickers, getPet } from '../../store/fun'
import { ensureHabits, todayProgress } from '../../store/habits'
import { spendable, pendingCount } from '../../store/rewards'
import { getLine, stageOf } from '../../core/pets'
import { levelOf, type LevelInfo } from '../../core/levels'
import { isCloudConfigured, pushToCloud, pullFromCloud } from '../../cloud/sync'
import type { AgeStage, LearnDeck } from '../../types'
import { todayISO } from '../../core/dateUtils'
import { defaultDailyMinutes, defaultBedtime, isBedtime } from '../../core/ageStage'
import { buildPlan, planMinutes, type PlanStep } from '../../core/dailyPlan'
import { rankDecks } from '../../core/recommend'
import { getInterests, INTEREST_TAGS } from '../../store/notes'
import { buildDailyCard, type DailyCard } from '../../core/scoreCard'
import { getPlan, savePlan } from '../../store/plan'
import { useParentGate } from '../../components/ParentGate'
import { withGuard } from '../../components/Guard'
import './index.scss'

interface DeckRow {
  deck: LearnDeck
  due: number
}

/** 每日建议学习时长上限(分钟)的默认值,家长中心可改 */
const DAILY_LIMIT_MIN = 30

/** 首次打开时问的那一次「孩子多大」 */
const STAGE_OPTIONS: Array<{ key: AgeStage; label: string; emoji: string }> = [
  { key: 'toddler', label: '幼儿园(3–6 岁)', emoji: '🧸' },
  { key: 'primary', label: '小学(6–12 岁)', emoji: '🎒' },
  { key: 'junior', label: '初中(12–15 岁)', emoji: '📐' },
  { key: 'senior', label: '高中(15 岁以上)', emoji: '🎓' },
]

/**
 * 内容包同步一次启动只做一次。
 * 它要遍历整包卡片做比对,放在每次「回到首页」都跑纯属浪费 —— 内容包不会
 * 在一次使用过程中变。模块级变量,冷启动自然重置。
 */
let syncedThisLaunch = false

/**
 * 本次启动已经确认装好的内容包。
 * 有了它,后面每次回首页都不必再逐个调 ensureBuiltinDeck 去「确认一遍」。
 */
const installedKeys = new Set<string>()

/** 旧数据清理每次启动只做一次 */
let sanitizedThisLaunch = false

function msgOf(e: unknown): string {
  if (e instanceof Error) return e.message || String(e)
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}

function Index() {
  const { ask: askParent, gate: parentGate } = useParentGate()
  const [rows, setRows] = useState<DeckRow[]>([])
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  /** 今日目标:已做题数 / 目标题数 */
  const [todayN, setTodayN] = useState(0)
  const [goalN, setGoalN] = useState(20)
  const [minutes, setMinutes] = useState(0)
  const [err, setErr] = useState('')
  /** 当前版本记下的报错(带时间和出错页面);旧版本的不显示 */
  const [errEntry, setErrEntry] = useState<ErrEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [diag, setDiag] = useState<DiagLine[]>([])
  const [challenge, setChallenge] = useState({ done: 0, goal: 3 })
  const [stickerCount, setStickerCount] = useState(0)
  const [petEmoji, setPetEmoji] = useState('🥚')
  const [level, setLevel] = useState<LevelInfo>(levelOf(0))
  const [limitMin, setLimitMin] = useState(DAILY_LIMIT_MIN)
  const [habit, setHabit] = useState({ done: 0, total: 0 })
  const [canSpend, setCanSpend] = useState(0)
  const [pending, setPending] = useState(0)
  /** 首次装内容包时的进度提示(装完就消失) */
  const [installing, setInstalling] = useState('')
  /** 还没选过学段 —— 先当面问一次,别替家长做主 */
  const [needStage, setNeedStage] = useState(false)
  /** 到睡觉时间了 —— 由程序说这句话,而不是每天让家长去说 */
  const [bedtime, setBedtime] = useState(false)
  /** 今天这条路 + 走到第几步 —— 幼儿段的主入口 */
  const [plan, setPlan] = useState<PlanStep[]>([])
  const [planDone, setPlanDone] = useState(0)
  /** 幼儿段默认把其余入口收起来 */
  const [showMore, setShowMore] = useState(false)
  /** 今日评分卡 —— 给孩子看星星和一句话,详细分项在家长中心 */
  const [card, setCard] = useState<DailyCard | null>(null)

  /**
   * 载入首页数据。
   *
   * ⚠️ 这里**必须**整体 try/catch,并且**不能**放在 useLoad 里同步跑:
   * 小程序页面 onLoad 阶段抛异常会让整页渲染不出来(只剩导航栏)。
   * 放到 useEffect(挂载后)+ 捕获异常后把错误显示在页面上,
   * 这样即使内容包加载失败,首页也永远能点、并能看到失败原因。
   */
  const refresh = () => {
    try {
      const childId = getCurrentChildId()
      const failed: string[] = []
      // 先把历史遗留的坏记录清掉(见 sanitizeData 的说明),每次启动一次就够
      if (!sanitizedThisLaunch) {
        sanitizeData(childId)
        sanitizedThisLaunch = true
      }
      /*
       * 还没选过学段就先问 —— 在装任何内容包之前。
       *
       * 以前没选时会静默按「小学」处理:幼儿园的孩子一进来拿到的是小学词库,
       * 口算从两位数加减起步。而且学段存在本地存储里,清一次数据就退回默认值,
       * 孩子第二天打开只会觉得「怎么全变难了」。装包是不可逆的(要写上千张卡),
       * 所以必须先问清楚再装。
       */
      setNeedStage(!hasStage())
      if (!hasStage()) {
        setRows([])
        setLoading(false)
        return
      }
      /*
       * 只自动加「默认包」;其余在内容库里自助添加。
       *
       * ⚠️ 装包要往本地存储写上千张卡,同步一口气装完会把界面整段卡住
       * (第一次打开时最明显)。所以这里**一次只装一个**,装完让界面喘口气
       * 再装下一个,并把进度显示出来 —— 孩子看到的是「正在准备…」而不是卡死。
       */
      const packs = defaultPacksForStage(getStage())
      const missing = packs.filter((p) => !installedKeys.has(p.key))
      if (missing.length > 0) {
        const p = missing[0]
        setInstalling(`正在准备「${p.name}」…(还剩 ${missing.length} 个)`)
        setTimeout(() => {
          try {
            ensureBuiltinDeck(childId, p.key)
          } catch (e) {
            failed.push(`${p.name}: ${msgOf(e)}`)
          }
          installedKeys.add(p.key)
          refresh()
        }, 30)
      } else {
        setInstalling('')
        // 内容包更新过就就地补齐(卡片 id 不变,复习进度保留)。每次启动只做一次。
        if (!syncedThisLaunch) {
          for (const p of packs) {
            try {
              syncDeckContent(childId, p.key)
            } catch (e) {
              failed.push(`${p.name}: ${msgOf(e)}`)
            }
          }
          syncedThisLaunch = true
        }
      }
      const decks = listChildDecks(childId).filter(
        (d) => !(d.source === 'wrong' && d.itemType === 'wrong'),
      )
      // 一次扫描算出所有卡组的待学数(原先每个卡组各扫一遍全表)
      const dueMap = countDueByDeck(childId)
      const deckRows = decks.map((deck) => ({ deck, due: dueMap[deck.id] ?? 0 }))
      setRows(deckRows)
      /*
        排今天这条路。今天排过就沿用 —— 每次进首页顺序都在变的话,
        孩子建立不起「先做这个、再做那个」的预期。
      */
      {
        const saved = getPlan()
        if (saved.steps.length > 0) {
          setPlan(saved.steps)
          setPlanDone(saved.done)
        } else {
          /*
            先按「实际情况」给卡组排个序(错得多的、久没练的优先),
            再交给 buildPlan 去排成一条有节奏的路。
            推荐带着理由 —— 家长看得懂「为什么今天先练这个」才会信任它。
          */
          const tags = getInterests()
          const words = INTEREST_TAGS.filter((t) => tags.includes(t.tag)).flatMap((t) => t.match)
          const ranked = rankDecks(
            deckSignals(childId).map((sig) => ({ ...sig })),
            words,
          )
          const reasonOf = new Map(ranked.map((r) => [r.deckId, r.reason]))
          const order = new Map(ranked.map((r, i) => [r.deckId, i]))
          const sorted = [...deckRows].sort(
            (a, b) =>
              (order.get(a.deck.id) ?? 999) - (order.get(b.deck.id) ?? 999),
          )
          const built = buildPlan(
            sorted.map((r) => ({
              id: r.deck.id,
              itemType: r.deck.itemType,
              name: r.deck.name,
              due: r.due,
              reason: reasonOf.get(r.deck.id),
            })),
            getStage(),
          )
          savePlan(built)
          setPlan(built)
          setPlanDone(0)
        }
      }
      const points = getPoints()
      setXp(points.xp)
      setLevel(levelOf(points.xp))
      setLimitMin(readObject<number>('dailyMinuteLimit', defaultDailyMinutes(getStage())))
      {
        const bed = readObject<string>('bedtime', defaultBedtime(getStage()))
        const d = new Date()
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        setBedtime(isBedtime(hhmm, bed))
      }
      setStreak(getStudyStreak())
      setGoalN(getDailyGoal())
      setTodayN(todayAnswered(childId))
      setMinutes(getTodayStudyMinutes())
      setChallenge(getChallenge())
      /*
        今日评分。各板块的目标按每日题量目标摊开 ——
        不是「每样都要做满」,而是「今天整体够不够」。
      */
      {
        const goal = getDailyGoal()
        const byArea = todayByArea(childId)
        const get = (k: string) => byArea.find((x) => x.key === k) ?? { done: 0, correct: 0 }
        const en = get('启蒙')
        const cn = get('语文')
        const ma = get('数学')
        const hb = todayProgress()
        const built = buildDailyCard(
          [
              { key: 'en', label: '英语启蒙', emoji: '🔤', done: en.done, correct: en.correct, target: Math.round(goal * 0.4) },
              { key: 'cn', label: '语文', emoji: '🈶', done: cn.done, correct: cn.correct, target: Math.round(goal * 0.3) },
              { key: 'ma', label: '数学', emoji: '🧮', done: ma.done, correct: ma.correct, target: Math.round(goal * 0.3) },
              { key: 'hb', label: '习惯', emoji: '✅', done: hb.done, target: hb.total },
            ],
          yesterdayScore(),
        )
        recordTodayScore(built.score)
        setCard(built)
      }
      ensureHabits()
      setHabit(todayProgress())
      setStickerCount(ownedStickers().length)
      setCanSpend(spendable())
      setPending(pendingCount())
      const pet = getPet()
      const pl = pet.line ? getLine(pet.line) : undefined
      setPetEmoji(pl ? pl.stages[stageOf(pet.fed)].emoji : '🥚')
      /*
       * 只显示**当前版本**记下的报错。
       *
       * 以前这里读的是一个没有时间戳的 `_lastError`:一条几天前、
       * 早就随更新修好的报错会一直挂在首页,用户以为「又出错了」,
       * 只能靠清空数据把它弄走 —— 清掉的其实只是这条留言。
       * 现在旧版本的报错自动不显示,完整历史留在家长中心备查。
       */
      const live = currentError()
      setErrEntry(live)
      setErr(failed.join(' / '))
    } catch (e) {
      setErr(msgOf(e))
    } finally {
      setLoading(false)
    }
  }

  // 只用 useDidShow:它首次显示时也会触发,再加 useEffect 等于每次进首页算两遍
  useDidShow(refresh)

  const go = (deckId: string, mode: string, free = false) => {
    Taro.navigateTo({
      url: `/pages/session/index?deckId=${deckId}&mode=${mode}${free ? '&free=1' : ''}`,
      fail: (e) => Taro.showModal({ title: '打不开', content: msgOf(e), showCancel: false }),
    })
  }

  /** 走今天这条路的第 i 步 —— 会话页做完会自动接下一步 */
  const goPlan = (i: number, limitOverride?: number) => {
    const st = plan[i]
    if (!st) return
    Taro.navigateTo({
      url: `/pages/session/index?deckId=${st.deckId}&mode=${st.mode}&plan=1&limit=${limitOverride ?? st.limit}`,
      fail: (e) => Taro.showModal({ title: '打不开', content: msgOf(e), showCancel: false }),
    })
  }

  const openPage = (url: string) => {
    Taro.navigateTo({
      url,
      fail: (e) => Taro.showModal({ title: '打不开', content: msgOf(e), showCancel: false }),
    })
  }

  /** 声音自检:把中英文各个音源挨个试一遍,如实报告哪家能用 */
  const checkSound = async () => {
    let lines: DiagLine[] = []
    try {
      setChecking(true)
      lines = await diagnoseAudio((done, total) => setProgress(Math.round((done / total) * 100)))
    } catch (e) {
      setChecking(false)
      // 自检本身出错时,把原因显示在页面红框里(用户不用去翻调试器)
      setErr('声音自检出错:' + msgOf(e))
      return
    }
    setChecking(false)
    setDiag(lines)
    // 结果直接画在页面上(比弹窗更好读、也不会被弹窗长度截断)
    if (lines.some((l) => l.ok)) {
      void playText('小朋友你好', 'zh_CN')
    }
  }

  /** 本地数据坏掉/存满时的自救按钮 */
  const resetLocal = () => {
    // 这个按钮会把孩子所有的进度清光 —— 必须确认是家长在点
    askParent('清空本地数据', '会清掉本机的学习进度、积分、宠物和打卡记录,并重新生成内容包。', () => {
      clearAll()
      syncedThisLaunch = false
      sanitizedThisLaunch = false
      installedKeys.clear()
      setLoading(true)
      refresh()
    })
  }

  const sync = async () => {
    Taro.showLoading({ title: '同步中…' })
    const up = await pushToCloud()
    const down = await pullFromCloud()
    Taro.hideLoading()
    if (up === 'nocloud' || down === 'nocloud') {
      Taro.showModal({
        title: '未开启云同步',
        content: '请先在云开发控制台创建环境,并把环境 ID 填入 src/cloud/config.ts 的 CLOUD_ENV。',
        showCancel: false,
      })
      return
    }
    refresh()
    Taro.showToast({ title: up === 'ok' ? '已同步' : '同步完成', icon: 'success' })
  }

  return (
    <View className='home'>
      {parentGate}
      <View className='home__hero'>
        {/*
          版本号只放在页面最下面。
          标题是给孩子看的,「v35」对他没有任何意义,却占掉了一行里最显眼的位置;
          排查问题时往下滚一屏就能看到,那点代价换孩子看到的是干净的标题,值。
        */}
        <Text className='home__title'>成长学习 🌱</Text>
        <View className='home__stat'>
          <Text className='home__xp'>成长值 {xp}</Text>
          {streak > 0 ? <Text className='home__streak'>🔥 {streak} 天</Text> : null}
          <Text className='home__sync' onClick={() => void sync()}>
            {isCloudConfigured() ? '☁️ 同步' : '☁️'}
          </Text>
        </View>
      </View>

      {/*
        没选过学段时,先当面问一次再装内容。
        以前这里是静默按「小学」处理的 —— 幼儿园的孩子拿到小学词库、
        口算直接上两位数,而没有任何地方告诉家长发生了什么。
      */}
      {needStage ? (
        <View className='pickstage'>
          <Text className='pickstage__t'>孩子的生日是?</Text>
          <Text className='pickstage__d'>
            填了生日,内容难度就一直跟着他的年龄走 —— 他长大了程序自己知道,
            不用你再回来改。生日也是身高体重曲线要用的。
          </Text>
          <Picker
            mode='date'
            value={getBirthdate() || '2021-01-01'}
            start='2005-01-01'
            end={todayISO()}
            onChange={(e) => {
              setBirthdate(String(e.detail.value))
              installedKeys.clear()
              syncedThisLaunch = false
              setLoading(true)
              refresh()
            }}
          >
            <View className='pickstage__b'>
              <Text className='pickstage__e'>🎂</Text>
              <Text className='pickstage__l'>点这里选生日</Text>
            </View>
          </Picker>
          <Text className='pickstage__d'>不想填生日的话,也可以直接选一个:</Text>
          {STAGE_OPTIONS.map((s) => (
            <View
              key={s.key}
              className='pickstage__b'
              onClick={() => {
                setStage(s.key)
                installedKeys.clear()
                syncedThisLaunch = false
                setLoading(true)
                refresh()
              }}
            >
              <Text className='pickstage__e'>{s.emoji}</Text>
              <Text className='pickstage__l'>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/*
        睡前收尾。
        晚上用的时候「结束」比「开始」难 —— 让孩子自己停下来不现实,
        每天靠家长拉锯,几次之后这个 App 就跟「被没收」绑在一起了。
        所以到点由程序说这句话。不锁屏、不强退,那会变成对抗。
      */}
      {bedtime ? (
        <View className='bed'>
          <Text className='bed__e'>🌙</Text>
          <Text className='bed__t'>今天到这儿啦,明天再来 —— 睡好了才记得住</Text>
        </View>
      ) : null}

      {/*
        今日评分卡。

        原则写在 core/scoreCard.ts:主要看「做了没有」而不是「对了多少」,
        和昨天的自己比而不是和满分比,而且**没有不及格**。
        一个 4 岁半的孩子如果从这套系统里学会的第一件事是「我不行」,
        那前面做的所有内容都白搭。
      */}
      {/* 点进去是完整的今日评分(分项 + 点评 + 学习足迹) */}
      {card && card.stars > 0 ? (
        <View className='dcard' onClick={() => openPage('/pages/score/index')}>
          <Text className='dcard__s'>{'⭐'.repeat(card.stars)}{'☆'.repeat(5 - card.stars)}</Text>
          <Text className='dcard__c'>{card.cheer}</Text>
          <Text className='dcard__go'>今日评分 ›</Text>
        </View>
      ) : null}
      {card && card.stars === 0 ? (
        <View className='dcard' onClick={() => openPage('/pages/score/index')}>
          <Text className='dcard__s'>☆☆☆☆☆</Text>
          <Text className='dcard__c'>今天还没开始</Text>
          <Text className='dcard__go'>今日评分 ›</Text>
        </View>
      ) : null}

      {/*
        今日目标进度条。孩子对「还差几题」远比对「累计多少题」有感觉,
        这条进度条就是给他一个今天能够到的终点。
      */}
      <View className='dg'>
        <View className='dg__hd'>
          <Text className='dg__t'>今日目标</Text>
          <Text className='dg__n'>
            {todayN} / {goalN} 题
          </Text>
        </View>
        <View className='dg__track'>
          <View
            className='dg__fill'
            style={{ width: `${Math.min(100, Math.round((todayN / Math.max(1, goalN)) * 100))}%` }}
          />
        </View>
        {todayN >= goalN ? <Text className='dg__done'>🎉 今天的目标达成啦!</Text> : null}
      </View>

      {err || errEntry ? (
        <View className='errbox'>
          <Text className='errbox__t'>⚠️ 出错了(把下面这行念给开发者听):</Text>
          <Text className='errbox__m'>{err || (errEntry ? errEntry.msg : '')}</Text>
          {errEntry ? (
            <Text className='errbox__when'>
              {formatWhen(errEntry.at)}
              {errEntry.page ? ` · 在「${errEntry.page}」` : ''} · {errEntry.ver}
            </Text>
          ) : null}
          <Text className='errbox__btn' onClick={resetLocal}>
            清空本地数据重试
          </Text>
          <Text
            className='errbox__btn errbox__btn--ghost'
            onClick={() => {
              clearErrors()
              setErr('')
              setErrEntry(null)
            }}
          >
            知道了
          </Text>
        </View>
      ) : null}

      {installing ? (
        <View className='rest'>
          <Text className='rest__t'>{installing}</Text>
        </View>
      ) : null}

      {minutes >= limitMin ? (
        <View className='rest'>
          <Text className='rest__t'>今天已经学了 {minutes} 分钟啦,起来活动一下、看看远处,保护小眼睛 👀</Text>
        </View>
      ) : null}

      {pending > 0 ? (
        <View className='pendbar'>
          <Text className='pendbar__t'>🎁 有 {pending} 个奖励换好了,记得找爸爸妈妈兑现</Text>
        </View>
      ) : null}

      {/* 生活习惯放最前:这是每天最先要做的事,不该埋在学习内容下面 */}
      <View className='habitcard' onClick={() => openPage('/pages/habits/index')}>
        <Text className='habitcard__e'>{habit.total > 0 && habit.done >= habit.total ? '🎉' : '🪥'}</Text>
        <View className='habitcard__meta'>
          <Text className='habitcard__t'>今日习惯</Text>
          <Text className='habitcard__n'>
            {habit.total > 0 ? `${habit.done}/${habit.total} 件已完成` : '点这里安排每天要做的事'}
          </Text>
        </View>
        <View className='habitcard__track'>
          <View
            className='habitcard__fill'
            style={{ width: `${habit.total > 0 ? (habit.done / habit.total) * 100 : 0}%` }}
          />
        </View>
      </View>

      {/*
        「今天就做这个」—— 幼儿段唯一需要点的东西。

        首页有 9 个入口、32 个内容包、11 种练法,而使用者是一个 4 岁半、
        **不识字**的孩子。他打开首页面对十几个读不了的字,真实结果是
        点到哪儿算哪儿。功能多不是错,错的是「今天该做什么」不清楚了。
        所以给他一条排好的路,其余全部收进「更多」。
      */}
      {plan.length > 0 && planDone < plan.length ? (
        <View className='today' onClick={() => goPlan(planDone)}>
          <Text className='today__e'>▶️</Text>
          <View className='today__meta'>
            <Text className='today__t'>{planDone > 0 ? '接着做' : '今天就做这个'}</Text>
            <Text className='today__s'>
              {plan.length} 步 · 约 {planMinutes(plan)} 分钟{planDone > 0 ? ` · 已完成 ${planDone} 步` : ''}
            </Text>
          </View>
          <View className='today__dots'>
            {plan.map((st, i) => (
              <View key={st.deckId + st.mode} className={i < planDone ? 'today__d today__d--on' : 'today__d'} />
            ))}
          </View>
        </View>
      ) : null}
      {/*
        「今天不想学」也要有出路。

        现在只有「学」和「不打开」两个选项 —— 而习惯的全部价值在于**不断**。
        给一个 3 题就结束的轻量档:连续天数保住了,明天他还会回来。
        比起为了凑满今天的量把他弄烦,少学几题划算得多。
      */}
      {plan.length > 0 && planDone < plan.length ? (
        <Text className='lite' onClick={() => goPlan(planDone, 3)}>
          今天不想学?就来 3 题 →
        </Text>
      ) : null}
      {plan.length > 0 && planDone < plan.length && plan[planDone]?.reason ? (
        <Text className='todayreason'>💡 {plan[planDone].reason}</Text>
      ) : null}
      {plan.length > 0 && planDone >= plan.length ? (
        <View className='today today--done'>
          <Text className='today__e'>🎉</Text>
          <View className='today__meta'>
            <Text className='today__t'>今天的做完啦</Text>
            <Text className='today__s'>想再玩的话,下面每组都有「再练一遍」</Text>
          </View>
        </View>
      ) : null}

      {/* 幼儿段默认收起下面这些 —— 他一个字都读不了,列出来只会干扰 */}
      {getStage() === 'toddler' && !showMore ? (
        <Text className='morebtn' onClick={() => setShowMore(true)}>更多(家长用)▾</Text>
      ) : null}

      {/*
        口算**永远留在主屏**。
        上一版我把它和错题本一起收进了「更多」—— 错的:错题本是家长偶尔查的,
        口算是孩子每天要做的。一个每天都用的东西藏起来,用户的感受就是「被删了」。
      */}
      <View className='entries'>
        <View className='entry entry--math' onClick={() => openPage('/pages/math/index')}>
          <Text className='entry__icon'>🧮</Text>
          <Text className='entry__t'>口算练习</Text>
        </View>
        {getStage() !== 'toddler' || showMore ? (
          <View className='entry entry--eb' onClick={() => openPage('/pages/errorbook/index')}>
            <Text className='entry__icon'>📕</Text>
            <Text className='entry__t'>错题本</Text>
          </View>
        ) : null}
      </View>

      {/* 等级:成长值攒到下一级还差多少,一眼可见 */}
      <View className='lvbar' onClick={() => openPage('/pages/parent/index')}>
        <Text className='lvbar__e'>{level.cur.emoji}</Text>
        <View className='lvbar__meta'>
          <Text className='lvbar__n'>
            Lv.{level.cur.level} {level.cur.name}
          </Text>
          <View className='lvbar__track'>
            <View className='lvbar__fill' style={{ width: `${level.progress * 100}%` }} />
          </View>
        </View>
        <Text className='lvbar__h'>{level.next ? `再 ${level.toNext} 升级` : '满级'}</Text>
      </View>

      {/* 今日挑战:一眼看到还差几组,给孩子一个明确的小目标 */}
      <View className='chalbar' onClick={() => openPage('/pages/fun/index')}>
        <Text className='chalbar__t'>
          {challenge.done >= challenge.goal
            ? '🏆 今日挑战完成!'
            : `今日挑战 ${challenge.done}/${challenge.goal} 组`}
        </Text>
        <View className='chalbar__track'>
          <View
            className='chalbar__fill'
            style={{ width: `${Math.min(100, (challenge.done / challenge.goal) * 100)}%` }}
          />
        </View>
      </View>

      <View className='entries'>
        <View className='entry entry--fun' onClick={() => openPage('/pages/fun/index')}>
          <Text className='entry__icon'>{petEmoji}</Text>
          <Text className='entry__t'>宠物·贴纸 {stickerCount}</Text>
        </View>
      </View>

      <View className='entries'>
        <View className='entry entry--talk' onClick={() => openPage('/pages/talk/index')}>
          <Text className='entry__icon'>💬</Text>
          <Text className='entry__t'>英语口语</Text>
        </View>
        <View className='entry entry--reward' onClick={() => openPage('/pages/rewards/index')}>
          <Text className='entry__icon'>🎁</Text>
          <Text className='entry__t'>换奖励 {canSpend}</Text>
        </View>
      </View>

      <View className='entries'>
        <View className='entry entry--archive' onClick={() => openPage('/pages/archive/index')}>
          <Text className='entry__icon'>🌱</Text>
          <Text className='entry__t'>成长档案</Text>
        </View>
        <View className='entry entry--packs' onClick={() => openPage('/pages/packs/index')}>
          <Text className='entry__icon'>📚</Text>
          <Text className='entry__t'>内容库</Text>
        </View>
        <View className='entry entry--parent' onClick={() => openPage('/pages/parent/index')}>
          <Text className='entry__icon'>👨‍👩‍👧</Text>
          <Text className='entry__t'>家长中心</Text>
        </View>
        <View className='entry entry--sound' onClick={() => void checkSound()}>
          <Text className='entry__icon'>🔊</Text>
          <Text className='entry__t'>{checking ? `检测中 ${progress}%` : '声音自检'}</Text>
        </View>
      </View>

      {diag.length > 0 ? (
        <View className='diag'>
          <Text className='diag__t'>
            可用音源 {diag.filter((l) => l.ok).length}/{diag.length}
            {diag.some((l) => l.ok) ? '(打勾的会自动优先使用)' : ''}
          </Text>
          {/* 失败要说清原因 —— 只报一个 ❌ 等于什么都没说 */}
          {diag.map((l) => (
            <Text key={l.label} className={l.ok ? 'diag__l diag__l--ok' : 'diag__l'}>
              {l.ok ? '✅' : '❌'} {l.label}
              {l.reason ? ` —— ${l.reason}` : ''}
            </Text>
          ))}
          {diag.some((l) => l.reason && l.reason.indexOf('域名') >= 0) ? (
            <Text className='diag__hint'>
              有音源因为「域名没加白名单」失败。这个只能在微信公众平台改:
              登录 mp.weixin.qq.com → 开发管理 → 开发设置 → 服务器域名,
              把 tts.baidu.com、dict.youdao.com、fanyi.baidu.com、fanyi.sogou.com
              四个都加进「downloadFile 合法域名」。加完等几分钟再试。
            </Text>
          ) : null}
          {diag.every((l) => !l.ok) ? (
            <Text className='diag__hint'>
              全部取不到:开发者工具请勾选「详情 → 本地设置 → 不校验合法域名」;真机需在小程序后台把 tts.baidu.com、dict.youdao.com 加入 downloadFile 合法域名。
            </Text>
          ) : null}
          <Text className='diag__close' onClick={() => setDiag([])}>
            收起
          </Text>
        </View>
      ) : null}

      {loading ? <Text className='home__tip'>正在准备内容包…</Text> : null}
      {!loading && !err && rows.length === 0 ? (
        <Text className='home__tip'>还没有内容包,点上面的「📚 内容库」挑几个加进来。</Text>
      ) : null}

      {rows.map(({ deck, due }) => {
        // 练习模式由卡片类型决定(单词/古诗/识字/看图/问答各有各的玩法)
        const modes = modesFor(deck.itemType, true)
        return (
          <View key={deck.id} className='deck'>
            <View className='deck__head'>
              <Text className='deck__icon'>{deck.icon}</Text>
              <View className='deck__meta'>
                <Text className='deck__name'>{deck.name}</Text>
                <Text className='deck__sub'>{deck.subject}</Text>
              </View>
              {due > 0 ? (
                <Text className='deck__badge'>待学 {due}</Text>
              ) : (
                <Text className='deck__badge deck__badge--done'>已清空</Text>
              )}
            </View>
            <View className='deck__modes'>
              {modes.map((m) => (
                <View key={m.mode} className='mode' onClick={() => go(deck.id, m.mode)}>
                  <Text className='mode__icon'>{m.icon}</Text>
                  <Text className='mode__label'>{m.label}</Text>
                </View>
              ))}
            </View>
            {/*
              「再练一遍」—— 无论今天的复习清空没清空,想练随时能练。
              间隔重复会把答对的卡排到几天之后,于是孩子今天还想练,
              程序却说「已清空」把他挡在外面。那个算法是为「记得牢」设计的,
              不是为「不准多练」设计的 —— 主动想练的时候拦住他,
              是这套系统能犯的最糟糕的错误之一。
              这一组照常给分、照常喂宠物,但不改动复习计划。
            */}
            <View className='again'>
              {repeatModesFor(deck.itemType, true).map((m) => (
                <View key={`again-${m.mode}`} className='again__b' onClick={() => go(deck.id, m.mode, true)}>
                  <Text className='again__t'>🔄 再练一遍 · {m.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}

      <Text className='home__note'>
        单词发音为网络真人音源(需联网);古诗/识字用系统语音朗读。跟读的录音只在本地处理、不上传。
      </Text>
      <Text className='home__ver'>版本 {BUILD_TAG}</Text>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Index)
