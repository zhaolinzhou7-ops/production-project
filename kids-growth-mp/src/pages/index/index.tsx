import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { defaultPacksForStage } from '../../core/learningContent'
import { modesFor } from '../../core/practiceModes'
import {
  getCurrentChildId,
  ensureBuiltinDeck,
  listChildDecks,
  countDueByDeck,
  getPoints,
  getStudyStreak,
  getTodayStudyMinutes,
  getStage,
  syncDeckContent,
  sanitizeData,
  getDailyGoal,
  todayAnswered,
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
import type { LearnDeck } from '../../types'
import { withGuard } from '../../components/Guard'
import './index.scss'

interface DeckRow {
  deck: LearnDeck
  due: number
}

/** 每日建议学习时长上限(分钟)的默认值,家长中心可改 */
const DAILY_LIMIT_MIN = 30

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
      setRows(decks.map((deck) => ({ deck, due: dueMap[deck.id] ?? 0 })))
      const points = getPoints()
      setXp(points.xp)
      setLevel(levelOf(points.xp))
      setLimitMin(readObject<number>('dailyMinuteLimit', DAILY_LIMIT_MIN))
      setStreak(getStudyStreak())
      setGoalN(getDailyGoal())
      setTodayN(todayAnswered(childId))
      setMinutes(getTodayStudyMinutes())
      setChallenge(getChallenge())
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

  const go = (deckId: string, mode: string) => {
    Taro.navigateTo({
      url: `/pages/session/index?deckId=${deckId}&mode=${mode}`,
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
    Taro.showModal({
      title: '清空本地数据',
      content: '会清掉本机的学习进度并重新生成内容包。确定吗?',
      success: (res) => {
        if (!res.confirm) return
        clearAll()
        syncedThisLaunch = false
        sanitizedThisLaunch = false
        installedKeys.clear()
        setLoading(true)
        refresh()
      },
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
      <View className='home__hero'>
        {/* 版本号放在标题旁边:排查问题时不用往下滚就能确认跑的是不是新代码 */}
        <Text className='home__title'>成长学习 🌱 {BUILD_TAG}</Text>
        <View className='home__stat'>
          <Text className='home__xp'>成长值 {xp}</Text>
          {streak > 0 ? <Text className='home__streak'>🔥 {streak} 天</Text> : null}
          <Text className='home__sync' onClick={() => void sync()}>
            {isCloudConfigured() ? '☁️ 同步' : '☁️'}
          </Text>
        </View>
      </View>

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

      <View className='entries'>
        <View className='entry entry--math' onClick={() => openPage('/pages/math/index')}>
          <Text className='entry__icon'>🧮</Text>
          <Text className='entry__t'>口算练习</Text>
        </View>
        <View className='entry entry--eb' onClick={() => openPage('/pages/errorbook/index')}>
          <Text className='entry__icon'>📕</Text>
          <Text className='entry__t'>错题本</Text>
        </View>
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
