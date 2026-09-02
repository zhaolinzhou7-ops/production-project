import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Calculator, NotebookPen, ChevronRight, Volume2, VolumeX } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { packsForStage, BUILTIN_PACKS } from '../lib/learningContent'
import { getStageMeta, getAgeStage } from '../lib/ageStage'
import { screenAdvice } from '../lib/screenTime'
import { examDue } from '../lib/exam'
import { spotDue, pickSpotCheck } from '../lib/spotCheck'
import { adviseSyllabus } from '../lib/syllabus'
import { dailyPointCap } from '../lib/pointCap'
import {
  listVoices,
  setPreferredVoice,
  getPreferredVoiceURI,
  speak,
  getSpeechTune,
  setSpeechTune,
} from '../lib/audio'
import {
  sourcesFor,
  setPreferredSource,
  getPreferredSource,
  diagnoseSource,
  healthOf,
  type TtsLang,
  type DiagReason,
} from '../lib/tts'
import { VoiceHelpGuide } from '../components/common/VoiceHelpGuide'
import {
  ensureBuiltinDeck,
  countDue,
  getDailyGoal,
  deckSignals,
  deckLevel,
  todayByArea,
  yesterdayScore,
  recordTodayScore,
  wrongDueToday,
  errorDueToday,
  examCandidates,
  lastExamAt,
  spotCandidates,
  lastSpotAt,
  packProgress,
} from '../db/study'
import { rankDecks, diversify } from '../lib/recommend'
import { buildPlan, planMinutes, type PlanDeck } from '../lib/dailyPlan'
import { buildDailyCard } from '../lib/scoreCard'
import { modesFor } from '../lib/practiceModes'
import { isMuted, setMuted } from '../lib/sfx'
import { STICKER_CATALOG, getOwnedStickers, resetStickers } from '../lib/stickers'
import { PET_LINES, getPet, choosePet, getTrophies, graduatePet, resetPet } from '../lib/pets'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { todayISO } from '../lib/dateUtils'
import type { LearnDeck, PracticeMode } from '../types'

export function LearnHomePage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()
  const [provisioning, setProvisioning] = useState(true)
  const [muted, setMutedState] = useState(isMuted())
  const [showStickers, setShowStickers] = useState(false)

  // 首次进入:按学段自动实例化默认词库(幂等)
  useEffect(() => {
    if (!currentChildId || !child) return
    let alive = true
    void (async () => {
      setProvisioning(true)
      for (const p of packsForStage(stage)) {
        await ensureBuiltinDeck(currentChildId, p.key)
      }
      if (alive) setProvisioning(false)
    })()
    return () => {
      alive = false
    }
  }, [currentChildId, child, stage])

  const decks = useLiveQuery(async (): Promise<LearnDeck[]> => {
    if (!currentChildId) return []
    const all = await db.decks.where('childId').equals(currentChildId).toArray()
    // 手动错题本(itemType 'wrong')单独由「错题本」入口管理,不进通用卡组列表
    return all.filter((d) => !(d.source === 'wrong' && d.itemType === 'wrong'))
  }, [currentChildId, provisioning])

  const dueCounts = useLiveQuery(async () => {
    if (!currentChildId || !decks) return {}
    const out: Record<string, number> = {}
    for (const d of decks) out[d.id] = await countDue(currentChildId, d.id)
    return out
  }, [currentChildId, decks])

  // 每个卡组的学习进度(已开始学过的卡 / 总卡数)
  const deckProgress = useLiveQuery(async () => {
    if (!currentChildId || !decks) return {}
    const out: Record<string, { learned: number; total: number }> = {}
    for (const d of decks) {
      const states = await db.studyStates
        .where('[childId+deckId]')
        .equals([currentChildId, d.id])
        .toArray()
      out[d.id] = {
        learned: states.filter((s) => s.status !== 'new').length,
        total: states.length,
      }
    }
    return out
  }, [currentChildId, decks])

  // 还没添加的内容包(不限学段,家长可自助添加 → 解决"某科目看不到")
  const availablePacks = useMemo(() => {
    const added = new Set((decks ?? []).map((d) => d.builtinKey).filter(Boolean))
    return BUILTIN_PACKS.filter((p) => !added.has(p.key))
  }, [decks])

  const [adding, setAdding] = useState<string | null>(null)
  const addPack = async (key: string) => {
    if (!currentChildId) return
    setAdding(key)
    try {
      await ensureBuiltinDeck(currentChildId, key)
    } finally {
      setAdding(null)
    }
  }

  // 每日挑战:今日已练卡次(单词/古诗/识字会话 + 口算题数) vs 每日目标
  const challenge = useLiveQuery(async () => {
    if (!currentChildId) return null
    const today = todayISO()
    const [sessions, drills, goal] = await Promise.all([
      db.studySessions.where('[childId+date]').equals([currentChildId, today]).toArray(),
      db.drillResults
        .where('childId')
        .equals(currentChildId)
        .filter((d) => d.date === today)
        .toArray(),
      getDailyGoal(currentChildId),
    ])
    const done =
      sessions.reduce((s, x) => s + x.total, 0) + drills.reduce((s, x) => s + x.total, 0)
    return { done, goal }
  }, [currentChildId])

  /**
   * 「今天就做这个」—— 一条排好的路,孩子不需要做任何选择。
   *
   * 为什么需要它:这一页有十几个可点的东西,全是字,而使用者是一个
   * 4 岁半、**不识字**的孩子。他打开这一页的真实结果是点到哪儿算哪儿,
   * 或者每次都点同一个。
   *
   * 排序不是固定的:先按「错得多 / 久没碰 / 到期多」挑出该练的(lib/recommend),
   * 再按每个卡组自己的难度档决定用哪种练法、给多少题(lib/dailyPlan)。
   * 家长能看到**为什么**今天先练这个 —— 看不懂的推荐,他下次就绕过去自己挑了。
   */
  const plan = useLiveQuery(async () => {
    if (!currentChildId || !decks) return null
    const signals = await deckSignals(currentChildId)
    const ranked = diversify(rankDecks(signals), 6)
    const byId = new Map(signals.map((d) => [d.id, d]))
    const planDecks: PlanDeck[] = ranked
      .map((r) => {
        const sig = byId.get(r.deckId)
        if (!sig) return null
        return {
          id: sig.id,
          itemType: sig.itemType,
          name: sig.name,
          due: sig.due,
          reason: r.reason,
          level: deckLevel(sig.id),
          // 内容包 key —— 拿来和教学大纲对上
          packKey: sig.builtinKey,
        }
      })
      .filter(Boolean) as PlanDeck[]
    /*
      **把教学大纲接进来。**

      大纲(lib/syllabus)之前只在内容库页面上给家长看一句建议:
      「先把手上这一批练熟,再开下一批」。可每天真正练什么是这里决定的,
      而这里从来不知道大纲的存在 —— 内容库劝家长专注第 1 批,
      每天的路却照旧在十个包之间平摊。说一套做一套,大纲等于白写。

      现在把「当前该练的那几包」传给 buildPlan,让它优先从这几包里排。
      是排序不是过滤:焦点包今天可能一张到期的卡都没有,
      硬过滤会端上一条空路 —— 复习节奏还得由 SRS 说了算。
    */
    const focus = adviseSyllabus(await packProgress(currentChildId)).focus
    const steps = buildPlan(planDecks, stage, focus)
    // 今天已经做到第几步:按「这个卡组+这种练法今天练过没有」算
    const today = todayISO()
    const sessions = await db.studySessions
      .where('[childId+date]')
      .equals([currentChildId, today])
      .toArray()
    const doneSet = new Set(sessions.filter((x) => !x.free).map((x) => `${x.deckId}/${x.mode}`))
    const done = steps.filter((st) => doneSet.has(`${st.deckId}/${st.mode}`)).length
    return { steps, done, minutes: planMinutes(steps) }
  }, [currentChildId, decks, stage])

  /**
   * 今日评分。
   *
   * 打分原则写死在 lib/scoreCard 里:主要看「做了没有」而不是「对了多少」、
   * 和昨天的自己比、**没有不及格**。这个年纪正确率低,绝大多数时候说明
   * 题出难了 —— 那是系统的问题,不该扣他的分。
   */
  const scoreCard = useLiveQuery(async () => {
    if (!currentChildId) return null
    const [areas, goal, tasks] = await Promise.all([
      todayByArea(currentChildId),
      getDailyGoal(currentChildId),
      db.tasks.where('childId').equals(currentChildId).filter((t) => t.active).toArray(),
    ])
    const by = (k: string) => areas.find((a) => a.key === k) ?? { done: 0, correct: 0 }
    const card = buildDailyCard(
      [
        { key: 'practice', label: '练习', emoji: '📚', target: goal, ...by('practice') },
        { key: 'math', label: '口算', emoji: '🔢', target: 10, ...by('math') },
        { key: 'habit', label: '习惯', emoji: '✅', target: tasks.length, ...by('habit') },
      ],
      yesterdayScore(),
    )
    recordTodayScore(card.score)
    return card
  }, [currentChildId])

  /**
   * 屏幕时间建议(分龄两档,见 lib/screenTime)。
   *
   * 原先没有任何提醒。学龄前的持续专注力约 10–15 分钟,近视防控指引
   * 也建议学龄前单次视屏不超过 15 分钟 —— 而这是他每天都要用的东西。
   * **只提醒、不锁死**:家长比程序更清楚现在该不该停。
   */
  const screen = useLiveQuery(async () => {
    if (!currentChildId) return null
    const today = todayISO()
    const [sessions, drills] = await Promise.all([
      db.studySessions.where('[childId+date]').equals([currentChildId, today]).toArray(),
      db.drillResults.where('childId').equals(currentChildId).filter((d) => d.date === today).toArray(),
    ])
    const sec =
      sessions.reduce((n, x) => n + (x.durationSec || 0), 0) +
      drills.reduce((n, x) => n + (x.durationSec || 0), 0)
    return screenAdvice(Math.round(sec / 60), stage)
  }, [currentChildId, stage])

  /** 今天还能再拿多少积分 —— 上限一直都在,但一直没显示过 */
  const pointRoom = useLiveQuery(async () => {
    if (!currentChildId) return null
    const child2 = await db.children.get(currentChildId)
    if (!child2) return null
    const cap = dailyPointCap(getAgeStage(child2.birthdate))
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const rows = await db.pointLedger
      .where('childId')
      .equals(currentChildId)
      .and((l) => l.reason === 'study' && l.delta > 0 && l.timestamp >= dayStart.getTime())
      .toArray()
    const earned = rows.reduce((n, l) => n + l.delta, 0)
    return { cap, left: Math.max(0, cap - earned) }
  }, [currentChildId])

  /** 现在该练哪几包、什么时候开下一包(见 lib/syllabus) */
  const syllabus = useLiveQuery(async () => {
    if (!currentChildId) return null
    return adviseSyllabus(await packProgress(currentChildId))
  }, [currentChildId, decks])

  /** 到了周期没有:测验 / 线下抽查 */
  const due = useLiveQuery(async () => {
    if (!currentChildId) return null
    const [exams, spots] = [
      lastExamAt(currentChildId, 'week'),
      lastSpotAt(currentChildId),
    ]
    const [cands, spotCands] = await Promise.all([
      examCandidates(currentChildId),
      spotCandidates(currentChildId),
    ])
    return {
      exam: examDue(exams, 'week') && cands.length >= 8,
      spot: spotDue(spots) && pickSpotCheck(spotCands).length > 0,
    }
  }, [currentChildId])

  /** 今天有几道错题该重做 —— 显示在错题本入口上 */
  const errDue = useLiveQuery(
    async () => (currentChildId ? errorDueToday(currentChildId) : 0),
    [currentChildId],
  )

  /** 今天有多少张「以前答错过」的卡回来了 —— 这几张最该被做到 */
  const wrongDue = useLiveQuery(
    async () => (currentChildId ? wrongDueToday(currentChildId) : 0),
    [currentChildId],
  )

  const ownedStickers = useLiveQuery(
    async () => (currentChildId ? getOwnedStickers(currentChildId) : []),
    [currentChildId],
  )

  const pet = useLiveQuery(
    async () => (currentChildId ? getPet(currentChildId) : null),
    [currentChildId],
  )

  const trophies = useLiveQuery(
    async () => (currentChildId ? getTrophies(currentChildId) : []),
    [currentChildId],
  )

  const [openDeck, setOpenDeck] = useState<string | null>(null)
  const [showPacks, setShowPacks] = useState(false)
  const [showVoices, setShowVoices] = useState(false)
  const [voicePick, setVoicePick] = useState<Record<string, string | null>>(() => ({
    zh: getPreferredVoiceURI('zh'),
    en: getPreferredVoiceURI('en'),
  }))
  const [srcPick, setSrcPick] = useState<Record<string, string | null>>(() => ({
    zh: getPreferredSource('zh'),
    en: getPreferredSource('en'),
  }))
  const [testResult, setTestResult] = useState<Record<string, DiagReason>>({})
  const [testing, setTesting] = useState<TtsLang | null>(null)
  const [showVoiceHelp, setShowVoiceHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tune, setTune] = useState(() => getSpeechTune())

  /** 调语速/音调:改完立刻按新设置念一句,方便对比 */
  const applyTune = (next: { rate: number; pitch: number }) => {
    setTune(next)
    setSpeechTune(next)
    speak('小朋友,我们一起学习吧', 'zh-CN', 0.9)
  }

  /** 逐个诊断该语言的所有音源:区分"连不上"和"能连上但音频不可播" */
  const runTest = async (lang: TtsLang, sample: string) => {
    setTesting(lang)
    try {
      for (const s of sourcesFor(lang)) {
        const reason = await diagnoseSource(s, sample)
        setTestResult((r) => ({ ...r, [s.id]: reason }))
        await new Promise((r) => setTimeout(r, reason === 'ok' ? 1600 : 200))
      }
    } finally {
      setTesting(null)
    }
  }

  /** 把诊断结果整理成一段文字,方便家长复制发我精准定位 */
  const copyDiagnosis = async () => {
    const lines: string[] = ['【朗读音源诊断】']
    for (const lang of ['zh', 'en'] as const) {
      lines.push(lang === 'zh' ? '中文:' : '英语:')
      for (const s of sourcesFor(lang)) {
        const r = testResult[s.id]
        lines.push(
          `  ${s.label}: ${
            r === 'ok' ? '可用' : r === 'unreachable' ? '连不上(网络被拦)' : r === 'not-audio' ? '能连上但返回的不是音频' : '未测试'
          }`,
        )
      }
    }
    // 可用音色(已剔除搞怪音色)与被剔除的分别列出,便于判断设备语音状况
    const fmt = (l: string) => listVoices(l).map((v) => v.name).join(' / ') || '(无)'
    const dropped = (l: string) =>
      listVoices(l, true)
        .filter((v) => !listVoices(l).some((k) => k.voiceURI === v.voiceURI))
        .map((v) => v.name)
        .join(' / ') || '(无)'
    lines.push(`设备中文音色(可用): ${fmt('zh')}`)
    lines.push(`设备英语音色(可用): ${fmt('en')}`)
    lines.push(`已屏蔽的搞怪音色: ${dropped('en')} ${dropped('zh')}`)
    lines.push(`浏览器: ${navigator.userAgent}`)
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('复制下面这段发给我:', text)
    }
  }
  const [confirmAction, setConfirmAction] = useState<'graduate' | 'resetPet' | 'resetStickers' | null>(null)

  if (!child || !currentChildId) return null

  const owned = new Set(ownedStickers ?? [])
  const challengeDone = challenge && challenge.done >= challenge.goal
  const challengePct = challenge ? Math.min(100, Math.round((challenge.done / Math.max(1, challenge.goal)) * 100)) : 0

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-xl font-bold text-gray-800">
          {tone === 'playful' ? '开始学习 📚' : '学习中心'}
        </h1>
        <button
          onClick={toggleMute}
          className="rounded-full bg-white/70 p-2 text-gray-500 shadow-sm active:scale-90 transition"
          aria-label={muted ? '打开音效' : '关闭音效'}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/*
        屏幕时间提醒。只提醒、不锁死 —— 一个会突然把孩子锁在外面的学习工具,
        家长下次就不敢在他面前打开了。
      */}
      {screen && screen.level !== 'ok' && (
        <div
          className={`mb-3 rounded-2xl p-3 text-sm ${
            screen.level === 'hard'
              ? 'bg-sun-400/20 text-orange-700'
              : 'bg-white/70 text-gray-500'
          }`}
        >
          {screen.msg}
        </div>
      )}

      {/* 今天还能拿多少分 —— 上限一直都在,把它说清楚就不像 bug 了 */}
      {pointRoom && (
        <div className="mb-3 text-right text-[11px] text-gray-400">
          {pointRoom.left > 0
            ? `今天还可得 ${pointRoom.left} 分`
            : '今天的积分已拿满,继续练照样有记录'}
        </div>
      )}

      {/*
        阶段测验 / 线下抽查。

        平时的练习都带着脚手架(有图、有选项、错了当场告诉他答案),
        所以有两个问题永远看不清:撤掉脚手架他会多少?**合上屏幕**他会多少?
        到了周期才提示,不到不打扰 —— 天天考就成了另一种刷题。
      */}
      {due?.spot && (
        <button
          onClick={() => navigate('/learn/spotcheck')}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-400 to-cyan-600 p-4 text-left text-white shadow-sm active:scale-[0.99]"
        >
          <span className="text-3xl">🔎</span>
          <span className="flex-1">
            <span className="block font-bold">该做一次线下抽查了</span>
            <span className="text-xs text-white/85">
              5 个词 · 合上手机问他 · 说不出的自动退回重学
            </span>
          </span>
          <ChevronRight size={18} className="text-white/80" />
        </button>
      )}
      {/*
        测验提示。

        w64 起测验是**开放式产出**:看图说出来、家长判对错 ——
        孩子一个人点进去做不了(他会自己点「说对了」,那份成绩就没意义)。
        所以副标题要把「家长判」写在最显眼的地方。
      */}
      {due?.exam && (
        <button
          onClick={() => navigate('/learn/exam?period=week')}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-400 to-violet-600 p-4 text-left text-white shadow-sm active:scale-[0.99]"
        >
          <span className="text-3xl">📝</span>
          <span className="flex-1">
            <span className="block font-bold">可以做一次周测了(要家长陪)</span>
            <span className="text-xs text-white/85">
              看图说出来 · 家长判对错 · 做完给分,和上次比一比
            </span>
          </span>
          <ChevronRight size={18} className="text-white/80" />
        </button>
      )}

      {/*
        「今天就做这个」。
        幼儿段放在最上面、做成一个大按钮 —— 他只要点这一个,
        剩下的顺序、题量、练法都由系统排好。
      */}
      {plan && plan.steps.length > 0 && (
        <div className="mb-3 rounded-3xl bg-gradient-to-br from-brand-100 to-mint-400/20 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-700">🎯 今天就做这个</div>
            <div className="text-[11px] text-gray-500">
              {plan.done}/{plan.steps.length} 步 · 约 {plan.minutes} 分钟
            </div>
          </div>
          <button
            onClick={() => {
              const next = plan.steps[Math.min(plan.done, plan.steps.length - 1)]
              navigate(`/learn/session/${next.deckId}/${next.mode}?limit=${next.limit}`)
            }}
            className="w-full rounded-2xl bg-brand-500 py-4 text-lg font-bold text-white shadow-sm active:scale-95 transition"
          >
            {plan.done >= plan.steps.length ? '🔁 今天的都做完啦,再来一组' : '▶ 开始今天的学习'}
          </button>
          <div className="mt-3 space-y-1">
            {plan.steps.map((st, i) => (
              <div key={`${st.deckId}-${st.mode}`} className="flex items-start gap-2 text-[11px]">
                <span className={i < plan.done ? 'text-mint-600' : 'text-gray-400'}>
                  {i < plan.done ? '✅' : `${i + 1}.`}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-gray-600">{st.label}</span>
                  <span className="ml-1 text-gray-400">· {st.limit} 题</span>
                  {/* 理由是给家长看的 —— 他看得懂,才会信任这条路 */}
                  {st.reason && <div className="text-gray-400">💡 {st.reason}</div>}
                </div>
              </div>
            ))}
          </div>
          {!!wrongDue && wrongDue > 0 && (
            <p className="mt-2 text-[11px] text-gray-500">
              今天有 {wrongDue} 张以前没记住的卡回来了 —— 它们已经排在最前面。
            </p>
          )}
        </div>
      )}

      {/* 今日评分:主要看「做了没有」,和昨天比,没有不及格 */}
      {scoreCard && (
        <div className="mb-3 rounded-3xl bg-white/70 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="text-3xl tracking-tight">
              {'⭐'.repeat(scoreCard.stars)}
              <span className="opacity-25">{'⭐'.repeat(5 - scoreCard.stars)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-700">
                今日评分 {scoreCard.score}
                {scoreCard.trend > 0 && <span className="ml-1 text-mint-600">↑ 比昨天进步</span>}
              </div>
              <div className="text-[11px] text-gray-500">{scoreCard.cheer}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {scoreCard.areas.map((a) => (
              <div key={a.key} className="flex-1 rounded-2xl bg-gray-50 p-2 text-center">
                <div className="text-lg">{a.emoji}</div>
                <div className="text-[11px] font-medium text-gray-600">
                  {a.done}/{a.target || '—'}
                </div>
                <div className="text-[10px] text-gray-400">{a.label}</div>
              </div>
            ))}
          </div>
          {/* 给家长的一句话:实话实说,包括承认「题可能出难了」 */}
          <p className="mt-2 text-[11px] text-gray-400">{scoreCard.note}</p>
        </div>
      )}

      {/* 学习宠物(童趣模式) */}
      {tone === 'playful' && pet !== undefined && (
        <div className="mb-3 rounded-2xl bg-gradient-to-br from-mint-400/20 to-sun-400/15 p-4 shadow-sm">
          {pet === null ? (
            <>
              <div className="mb-2 text-sm font-bold text-gray-700">🥚 选一颗蛋,孵出你的学习宠物!</div>
              <p className="mb-3 text-[11px] text-gray-500">每答对一题就喂它一口,吃饱就会长大、进化</p>
              <div className="grid grid-cols-3 gap-2">
                {PET_LINES.map((line) => (
                  <button
                    key={line.key}
                    onClick={() => void choosePet(currentChildId, line.key)}
                    className="rounded-2xl bg-white/80 py-3 text-center shadow-sm active:scale-95 transition"
                  >
                    <div className="text-3xl">🥚</div>
                    <div className="mt-1 text-xs font-medium text-gray-600">
                      {line.eggName} {line.hint}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-5xl">{pet.stage.emoji}</span>
                <div className="flex-1">
                  <div className="text-sm font-bold text-gray-700">{pet.stage.label}</div>
                  {pet.toNext ? (
                    <>
                      <div className="mt-1 h-2 rounded-full bg-white/70 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-500 transition-all"
                          style={{ width: `${Math.min(100, Math.round((pet.toNext.have / pet.toNext.need) * 100))}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        再喂 {pet.toNext.need - pet.toNext.have} 口进化 · 答对一题喂一口
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-gray-500">已经是最终形态啦,好厉害! 🎉</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-400 tabular-nums">已喂 {pet.fed}</span>
                  <button
                    onClick={() => setConfirmAction('resetPet')}
                    className="text-[11px] text-gray-400 underline active:scale-95"
                  >
                    换一颗蛋
                  </button>
                </div>
              </div>
              {pet.toNext === null && (
                <button
                  onClick={() => setConfirmAction('graduate')}
                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-sun-400 to-sun-500 py-2.5 text-sm font-bold text-white shadow-sm active:scale-[0.98] transition"
                >
                  🏆 让它毕业,再养一只新宠物
                </button>
              )}
            </>
          )}
          {trophies && trophies.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
              <span className="text-[11px] font-bold text-gray-500">🏆 毕业宠物</span>
              <span className="text-xl tracking-wide">
                {trophies.map((l, i) => (
                  <span key={i} title={l.stages[l.stages.length - 1].label}>
                    {l.stages[l.stages.length - 1].emoji}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 每日挑战 */}
      {challenge && (
        <div className="mb-3 rounded-2xl bg-white/70 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-bold text-gray-700">
              {challengeDone ? '🎉 今日挑战完成!' : '🎯 今日挑战'}
            </span>
            <span className="text-xs text-gray-400 tabular-nums">
              {challenge.done}/{challenge.goal} 题
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                challengeDone ? 'bg-mint-500' : 'bg-gradient-to-r from-sun-400 to-brand-400'
              }`}
              style={{ width: `${challengePct}%` }}
            />
          </div>
          {!challengeDone && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              再练 {challenge.goal - challenge.done} 题就完成今天的小目标啦
            </p>
          )}
        </div>
      )}

      {/* 贴纸册 */}
      <div className="mb-3 w-full rounded-2xl bg-white/70 p-4 text-left shadow-sm">
        <button onClick={() => setShowStickers((v) => !v)} className="flex w-full items-center gap-3 active:scale-[0.99] transition">
          <div className="text-2xl">🎁</div>
          <div className="flex-1 text-left">
            <div className="font-bold text-gray-800">我的贴纸册</div>
            <div className="text-xs text-gray-400">
              已集 {owned.size}/{STICKER_CATALOG.length} 张 · 练得好(正确率80%+)就掉落新贴纸
            </div>
          </div>
          <ChevronRight
            size={18}
            className={`text-gray-300 transition-transform ${showStickers ? 'rotate-90' : ''}`}
          />
        </button>
        {showStickers && (
          <>
            <div className="mt-3 grid grid-cols-8 gap-1.5">
              {STICKER_CATALOG.map((s) => (
                <div
                  key={s.key}
                  title={owned.has(s.key) ? s.name : '???'}
                  className={`flex h-9 items-center justify-center rounded-lg text-xl ${
                    owned.has(s.key) ? 'bg-sun-400/15' : 'bg-gray-100 opacity-40 grayscale'
                  }`}
                >
                  {owned.has(s.key) ? s.emoji : '❔'}
                </div>
              ))}
            </div>
            {owned.size > 0 && (
              <div className="mt-2 text-right">
                <button
                  onClick={() => setConfirmAction('resetStickers')}
                  className="text-[11px] text-gray-400 underline active:scale-95"
                >
                  清空贴纸册,重新收集
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => navigate('/learn/talk')}
        className="mb-3 w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-mint-400 to-mint-500 p-4 text-left text-white shadow-sm active:scale-[0.99] transition"
      >
        <div className="rounded-xl bg-white/25 p-2.5 text-2xl leading-none">🎭</div>
        <div className="flex-1">
          <div className="font-bold">英语小剧场</div>
          <div className="text-xs text-white/85">情景对话 · 听力复述 · 英文儿歌,开口就有分</div>
        </div>
        <ChevronRight size={18} className="text-white/80" />
      </button>

      <button
        onClick={() => navigate('/learn/math')}
        className="mb-3 w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sun-400 to-sun-500 p-4 text-left text-white shadow-sm active:scale-[0.99] transition"
      >
        <div className="rounded-xl bg-white/25 p-2.5">
          <Calculator size={22} />
        </div>
        <div className="flex-1">
          <div className="font-bold">口算练习</div>
          <div className="text-xs text-white/85">加减乘除 · 乘法口诀,限时闯关得积分</div>
        </div>
        <ChevronRight size={18} className="text-white/80" />
      </button>

      <button
        onClick={() => navigate('/learn/errorbook')}
        className="mb-3 w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 text-left shadow-sm active:scale-[0.99] transition"
      >
        <div className="rounded-xl bg-red-100 p-2.5 text-red-500">
          <NotebookPen size={22} />
        </div>
        <div className="flex-1">
          <div className="font-bold text-gray-800">
            错题本
            {/*
              带一个数字。错题这件事的难点从来不是「收集」,是**回头去做** ——
              没有数字提醒,家长永远想不起来点它,收集得再全也白搭。
            */}
            {!!errDue && errDue > 0 && (
              <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                {errDue}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400">
            答错的自动收进来 · 选择题还是选择题,算错的还是让他算
          </div>
        </div>
        <ChevronRight size={18} className="text-gray-300" />
      </button>

      {provisioning || !decks ? (
        <div className="pt-10 text-center text-3xl">📚</div>
      ) : decks.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          还没有词库,去家长模式分配吧
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(
            decks.reduce<Record<string, LearnDeck[]>>((acc, d) => {
              ;(acc[d.subject] ??= []).push(d)
              return acc
            }, {}),
          ).map(([subject, list]) => (
            <div key={subject}>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="text-[11px] font-bold text-gray-400">{subject}</span>
                <span className="text-[11px] text-gray-300">{list.length} 个卡组</span>
              </div>
              <div className="space-y-2">
                {list.map((deck) => {
                  const due = dueCounts?.[deck.id] ?? 0
                  const prog = deckProgress?.[deck.id]
                  const modes = modesFor(deck.itemType, stage === 'toddler' || stage === 'primary')
                  const open = openDeck === deck.id
                  return (
                    <div key={deck.id} className="rounded-2xl bg-white/70 shadow-sm overflow-hidden">
                      <button
                        onClick={() => setOpenDeck(open ? null : deck.id)}
                        className="w-full flex items-center gap-3 p-4 text-left active:scale-[0.99] transition"
                      >
                        <div className="text-2xl">{deck.icon}</div>
                        <div className="flex-1">
                          <div className="font-bold text-gray-800">{deck.name}</div>
                          {prog && prog.total > 0 ? (
                            <>
                              <div className="mt-1 h-1.5 w-full max-w-[9rem] rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500"
                                  style={{ width: `${Math.round((prog.learned / prog.total) * 100)}%` }}
                                />
                              </div>
                              <div className="mt-0.5 text-[11px] text-gray-400 tabular-nums">
                                学过 {prog.learned}/{prog.total}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-gray-400">{deck.subject}</div>
                          )}
                        </div>
                        {due > 0 ? (
                          <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">
                            待学 {due}
                          </span>
                        ) : (
                          <span className="rounded-full bg-mint-400/30 px-2.5 py-1 text-xs font-medium text-mint-600">
                            已清空
                          </span>
                        )}
                      </button>
                      {open && (
                        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
                          {modes.map((m) => (
                            <button
                              key={m.mode}
                              onClick={() => navigate(`/learn/session/${deck.id}/${m.mode as PracticeMode}`)}
                              className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-left active:scale-95 transition"
                            >
                              <span className="text-lg">{m.icon}</span>
                              <span className="text-sm">
                                <span className="font-medium text-gray-700 block">{m.label}</span>
                                <span className="text-[11px] text-gray-400">{m.desc}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 更多内容包:任何学段的内容都能自己加(识字/科学/成语… 找不到就来这里) */}
      {availablePacks.length > 0 && (
        <div className="mt-4 rounded-2xl bg-white/70 p-4 shadow-sm">
          <button
            onClick={() => setShowPacks((v) => !v)}
            className="flex w-full items-center gap-3 text-left active:scale-[0.99] transition"
          >
            <div className="text-2xl">➕</div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">更多内容包</div>
              <div className="text-xs text-gray-400">
                还有 {availablePacks.length} 个可以添加 · 不限学段,某一科超前就直接挑高一档的
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`text-gray-300 transition-transform ${showPacks ? 'rotate-90' : ''}`}
            />
          </button>
          {showPacks && (
            <div className="mt-3 space-y-2">
              {/*
                推荐顺序。
                原先难度递增只发生在**练法**上,内容是平摊的 —— 装了十个包,
                六百个词从第一天起一起轮,结果每样都碰一点、每样都不熟。
                先把最高频的一小批练到自动化,再开下一批,比同时铺开有效得多。
              */}
              {syllabus && (
                <div className="rounded-2xl bg-brand-100/60 p-3">
                  <div className="text-xs font-bold text-brand-600">📚 学习顺序</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    {syllabus.note}
                  </div>
                  {/*
                    **说到就要做到。**

                    w64 之前这一块只是给家长看的一段建议,而「今天就做这个」
                    那条路根本不看它 —— 这边劝你专注第 1 批,那边照旧十个包平摊。
                    现在计划已经接上了(见 lib/dailyPlan 的 focus),
                    所以这里要把这件事说出来:家长看得见连线,才会相信这段话不是摆设。
                  */}
                  {syllabus.focus.length > 0 && (
                    <div className="mt-2 rounded-xl bg-mint-400/20 px-2.5 py-1.5 text-[11px] leading-relaxed text-mint-700">
                      今天的「就做这个」已经优先从这几包里排:
                      {syllabus.focus
                        .map((k) => BUILTIN_PACKS.find((x) => x.key === k)?.name ?? k)
                        .join('、')}
                    </div>
                  )}
                  {syllabus.nextKey && (
                    <div className="mt-2 text-[11px] text-gray-600">
                      下一包建议:
                      <b>{BUILTIN_PACKS.find((p) => p.key === syllabus.nextKey)?.name}</b>
                      {' — '}
                      {syllabus.nextWhy}
                    </div>
                  )}
                </div>
              )}
              {availablePacks.map((p) => (
                <div key={p.key} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
                  <span className="text-xl">{p.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-gray-700">{p.name}</span>
                    {/*
                      标出适用学段。孩子常常某一科超前 —— 他 4 岁半,20 以内加减
                      已经做得不错,该给他小学档的算术;而英语还在启蒙。
                      这里不按学段过滤,只标注,由家长自己挑。
                    */}
                    <span className="text-[11px] text-gray-400">
                      {p.subject} · {p.stages.map((st) => getStageMeta(st).label).join('/')}
                    </span>
                  </span>
                  <button
                    onClick={() => void addPack(p.key)}
                    disabled={adding === p.key}
                    className="rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50"
                  >
                    {adding === p.key ? '添加中…' : '添加'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 语音音色:先选网络真人音源,再兜底设备音色 */}
      <div className="mt-3 rounded-2xl bg-white/70 p-4 shadow-sm">
        <button
          onClick={() => setShowVoices((v) => !v)}
          className="flex w-full items-center gap-3 text-left active:scale-[0.99] transition"
        >
          <div className="text-2xl">🔊</div>
          <div className="flex-1">
            <div className="font-bold text-gray-800">朗读声音</div>
            <div className="text-xs text-gray-400">觉得声音机械?这里测一测、换一个真人音源</div>
          </div>
          <ChevronRight
            size={18}
            className={`text-gray-300 transition-transform ${showVoices ? 'rotate-90' : ''}`}
          />
        </button>
        {showVoices && (
          <div className="mt-3 space-y-4">
            {/*
              先把话说明白,再让家长去调音源。

              英语**整句**没有可用的免费真人音源 —— 有道那套是词典,只有单词有
              真人录音。所以下面这些音源不管怎么测、怎么换,整句都好不了。
              真正的解法是家长自己录一遍,那一份排在所有音源前面。
            */}
            <button
              onClick={() => navigate('/parent/voice')}
              className="w-full rounded-2xl bg-gradient-to-br from-mint-400/20 to-brand-100 p-3 text-left active:scale-[0.99] transition"
            >
              <div className="text-sm font-bold text-gray-700">🎤 英语句子读不好?自己录一遍</div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                英语整句没有可用的免费真人音源,换哪个都一样。你录的那一份会排在所有网络音源前面,
                断网也能响 —— 而且是孩子最想听的声音。
              </div>
            </button>
            {/* 网络真人音源自检 */}
            {(['zh', 'en'] as const).map((lang) => {
              const sample = lang === 'zh' ? '小朋友,我们一起学习吧' : 'Hello! Nice to meet you.'
              const list = sourcesFor(lang)
              const pref = srcPick[lang]
              return (
                <div key={lang}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-gray-500">
                      {lang === 'zh' ? '中文真人音源' : '英语真人音源'}
                    </span>
                    <button
                      onClick={() => void runTest(lang, sample)}
                      disabled={testing !== null}
                      className="rounded-full bg-brand-100 px-3 py-1 text-[11px] font-bold text-brand-600 active:scale-95 disabled:opacity-50"
                    >
                      {testing === lang ? '测试中…' : '🔍 逐个试听'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((s) => {
                      const st = testResult[s.id] ?? (healthOf(s.id) === 'bad' ? 'unreachable' : undefined)
                      const active = pref === s.id
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setPreferredSource(lang, active ? null : s.id)
                            setSrcPick((p) => ({ ...p, [lang]: active ? null : s.id }))
                            void diagnoseSource(s, sample).then((r) =>
                              setTestResult((prev) => ({ ...prev, [s.id]: r })),
                            )
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition active:scale-95 ${
                            active ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <span className="w-4 text-center">
                            {st === 'ok' ? '✅' : st === 'unreachable' ? '🚫' : st === 'not-audio' ? '⚠️' : '•'}
                          </span>
                          <span className="flex-1">{s.label}</span>
                          {st === 'unreachable' && <span className="text-[10px] opacity-60">连不上</span>}
                          {st === 'not-audio' && <span className="text-[10px] opacity-60">非音频</span>}
                          {active && <span className="text-[10px] opacity-80">优先</span>}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    ✅能用 · 🚫网络连不上(换音源也没用) · ⚠️能连上但返回的不是音频(这种我能修) ·
                    点一下即试听并设为优先
                  </p>
                </div>
              )
            })}

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <button
                onClick={() => void copyDiagnosis()}
                className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-600 active:scale-95"
              >
                {copied ? '✅ 已复制' : '📋 复制诊断信息发给开发者'}
              </button>
            </div>

            {/* 不依赖网络的正路:装一个高质量语音音色 */}
            <div className="rounded-2xl bg-sun-400/10 p-3">
              <button
                onClick={() => setShowVoiceHelp((v) => !v)}
                className="flex w-full items-center gap-2 text-left active:scale-[0.99]"
              >
                <span className="text-lg">💡</span>
                <span className="flex-1 text-xs font-bold text-gray-700">
                  声音还是难听?点这里:教你把手机语音换成"接近真人"的
                </span>
                <ChevronRight
                  size={16}
                  className={`text-gray-400 transition-transform ${showVoiceHelp ? 'rotate-90' : ''}`}
                />
              </button>
              {showVoiceHelp && (
                <div className="mt-2">
                  <VoiceHelpGuide />
                </div>
              )}
            </div>

            {/* 语速/音调微调:设备音色改不了,但放慢、调低往往就自然不少 */}
            <div className="rounded-2xl bg-gray-50 p-3">
              <div className="mb-2 text-[11px] font-bold text-gray-600">
                🎚 语速与音调(设备语音听着别扭时,调这里最有效)
              </div>
              <label className="mb-2 block">
                <span className="text-[11px] text-gray-500">
                  语速 {tune.rate.toFixed(2)}× {tune.rate < 0.95 ? '(慢,更清楚)' : tune.rate > 1.05 ? '(快)' : '(正常)'}
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={tune.rate}
                  onChange={(e) => applyTune({ ...tune, rate: Number(e.target.value) })}
                  className="mt-1 w-full accent-brand-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-gray-500">
                  音调 {tune.pitch.toFixed(2)} {tune.pitch < 0.95 ? '(低,更沉稳)' : tune.pitch > 1.05 ? '(高,更童声)' : '(正常)'}
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.3}
                  step={0.05}
                  value={tune.pitch}
                  onChange={(e) => applyTune({ ...tune, pitch: Number(e.target.value) })}
                  className="mt-1 w-full accent-brand-500"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => applyTune({ rate: 0.85, pitch: 0.95 })}
                  className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-gray-600 shadow-sm active:scale-95"
                >
                  试试「慢而稳」
                </button>
                <button
                  onClick={() => applyTune({ rate: 1, pitch: 1.15 })}
                  className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-gray-600 shadow-sm active:scale-95"
                >
                  试试「童声一点」
                </button>
                <button
                  onClick={() => applyTune({ rate: 1, pitch: 1 })}
                  className="rounded-full bg-white px-3 py-1 text-[11px] text-gray-500 shadow-sm active:scale-95"
                >
                  复位
                </button>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 text-[11px] font-bold text-gray-500">
              设备自带音色(兜底用)
            </div>
            {(
              [
                { prefix: 'zh', label: '中文', sample: '小朋友,今天我们一起学习吧' },
                { prefix: 'en', label: '英语', sample: 'Hello! Nice to meet you.' },
              ] as const
            ).map(({ prefix, label, sample }) => {
              const voices = listVoices(prefix)
              const cur = voicePick[prefix]
              if (voices.length === 0) {
                return (
                  <div key={prefix} className="text-[11px] text-gray-400">
                    {label}:这台设备没有可用的{label}语音,需在系统设置里安装语音包。
                  </div>
                )
              }
              return (
                <div key={prefix}>
                  <div className="mb-1.5 text-[11px] font-bold text-gray-400">
                    {label}(共 {voices.length} 个,排在前面的通常更自然;已自动隐藏系统的搞怪音色)
                  </div>
                  <div className="space-y-1.5">
                    {voices.map((v, i) => {
                      const active = cur ? cur === v.voiceURI : i === 0
                      return (
                        <div key={v.voiceURI} className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setPreferredVoice(prefix, v.voiceURI)
                              setVoicePick((p) => ({ ...p, [prefix]: v.voiceURI }))
                              speak(sample, prefix === 'zh' ? 'zh-CN' : 'en-US', 0.9)
                            }}
                            className={`flex-1 rounded-xl px-3 py-2 text-left text-xs transition active:scale-95 ${
                              active ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600'
                            }`}
                          >
                            {v.name || v.voiceURI}
                            {i === 0 && <span className="ml-1 opacity-70">· 推荐</span>}
                          </button>
                          <button
                            onClick={() => speak(sample, prefix === 'zh' ? 'zh-CN' : 'en-US', 0.9)}
                            className="rounded-full bg-brand-100 p-2 text-brand-600 active:scale-90"
                            aria-label="试听"
                          >
                            <Volume2 size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <p className="text-[11px] text-gray-400">
              点音色即设为默认并试听。英语单词和短句会优先用网络真人录音,这里的音色用于中文朗读和取不到录音时的兜底。
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-gray-400">
        单词发音为网络真人音源(需联网播放),取不到时自动改用系统朗读;古诗/识字用系统中文朗读,需设备装有中文语音。跟读的语音识别需联网,且仅部分浏览器(Chrome/Safari)支持;录音只在本机播放、不上传。
      </p>

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === 'graduate'
            ? '让宠物毕业?'
            : confirmAction === 'resetPet'
              ? '换一颗蛋?'
              : '清空贴纸册?'
        }
        description={
          confirmAction === 'graduate'
            ? '它会住进奖杯墙,然后你可以重新选一颗蛋,再养一只新宠物。'
            : confirmAction === 'resetPet'
              ? '现在的宠物和喂食进度会消失(不进奖杯墙),重新开始养一只。'
              : '已收集的贴纸会全部清空,从头开始收集。'
        }
        confirmLabel={confirmAction === 'graduate' ? '毕业!' : '确定'}
        danger={confirmAction !== 'graduate'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const act = confirmAction
          setConfirmAction(null)
          if (!currentChildId || !act) return
          if (act === 'graduate') void graduatePet(currentChildId)
          else if (act === 'resetPet') void resetPet(currentChildId)
          else void resetStickers(currentChildId)
        }}
      />
    </div>
  )
}
