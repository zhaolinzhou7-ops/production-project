import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { packsForStage } from '../../core/learningContent'
import {
  getCurrentChildId,
  ensureBuiltinDeck,
  listChildDecks,
  countDue,
  getPoints,
  getStudyStreak,
  getTodayStudyMinutes,
} from '../../store/study'
import { readObject, writeObject } from '../../store/db'
import { diagnoseAudio, playText, type DiagLine } from '../../lib/audio'
import { isCloudConfigured, pushToCloud, pullFromCloud } from '../../cloud/sync'
import type { LearnDeck } from '../../types'
import './index.scss'

interface DeckRow {
  deck: LearnDeck
  due: number
}

/** 每日建议学习时长上限(分钟),超过给护眼提醒 */
const DAILY_LIMIT_MIN = 30

function msgOf(e: unknown): string {
  if (e instanceof Error) return e.message || String(e)
  try {
    return typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export default function Index() {
  const [rows, setRows] = useState<DeckRow[]>([])
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  const [minutes, setMinutes] = useState(0)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [diag, setDiag] = useState<DiagLine[]>([])

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
      for (const p of packsForStage('primary')) {
        try {
          ensureBuiltinDeck(childId, p.key)
        } catch (e) {
          failed.push(`${p.name}: ${msgOf(e)}`)
        }
      }
      const decks = listChildDecks(childId).filter(
        (d) => !(d.source === 'wrong' && d.itemType === 'wrong'),
      )
      setRows(decks.map((deck) => ({ deck, due: countDue(childId, deck.id) })))
      setXp(getPoints().xp)
      setStreak(getStudyStreak())
      setMinutes(getTodayStudyMinutes())
      // app.ts 里记下的「上一次未捕获报错」也一并显示出来
      const last = readObject<string>('_lastError', '')
      setErr([failed.join(' / '), last].filter(Boolean).join(' / '))
    } catch (e) {
      setErr(msgOf(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(refresh, [])
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
        try {
          Taro.clearStorageSync()
        } catch {
          /* 忽略 */
        }
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

  const wordModes: Array<[string, string, string]> = [
    ['recognize', '👀', '认词'],
    ['listenChoose', '👂', '听音选义'],
    ['spell', '⌨️', '拼写'],
    ['dictation', '✍️', '听写'],
    ['speak', '🎤', '跟读'],
  ]

  return (
    <View className='home'>
      <View className='home__hero'>
        <Text className='home__title'>成长学习 🌱</Text>
        <View className='home__stat'>
          <Text className='home__xp'>成长值 {xp}</Text>
          {streak > 0 ? <Text className='home__streak'>🔥 {streak} 天</Text> : null}
          <Text className='home__sync' onClick={() => void sync()}>
            {isCloudConfigured() ? '☁️ 同步' : '☁️'}
          </Text>
        </View>
      </View>

      {err ? (
        <View className='errbox'>
          <Text className='errbox__t'>⚠️ 内容加载出错(把下面这行念给开发者听):</Text>
          <Text className='errbox__m'>{err}</Text>
          <Text className='errbox__btn' onClick={resetLocal}>
            清空本地数据重试
          </Text>
          <Text
            className='errbox__btn errbox__btn--ghost'
            onClick={() => {
              writeObject('_lastError', '')
              setErr('')
            }}
          >
            知道了
          </Text>
        </View>
      ) : null}

      {minutes >= DAILY_LIMIT_MIN ? (
        <View className='rest'>
          <Text className='rest__t'>今天已经学了 {minutes} 分钟啦,起来活动一下、看看远处,保护小眼睛 👀</Text>
        </View>
      ) : null}

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

      <View className='entries'>
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
          {diag.map((l) => (
            <Text key={l.label} className={l.ok ? 'diag__l diag__l--ok' : 'diag__l'}>
              {l.ok ? '✅' : '❌'} {l.label}
            </Text>
          ))}
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
        <Text className='home__tip'>还没有内容包,点上面「声音自检」旁的按钮或下拉重进试试。</Text>
      ) : null}

      {rows.map(({ deck, due }) => {
        const modes: Array<[string, string, string]> =
          deck.itemType === 'word'
            ? wordModes
            : deck.itemType === 'poem'
              ? [
                  ['recite', '📖', '朗读背诵'],
                  ['fillBlank', '✏️', '补全诗句'],
                ]
              : [
                  ['recognize', '👀', '认字'],
                  ['listenChoose', '👂', '听音选字'],
                ]
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
              {modes.map(([m, icon, label]) => (
                <View key={m} className='mode' onClick={() => go(deck.id, m)}>
                  <Text className='mode__icon'>{icon}</Text>
                  <Text className='mode__label'>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}

      <Text className='home__note'>
        单词发音为网络真人音源(需联网);古诗/识字用系统语音朗读。跟读的录音只在本地处理、不上传。
      </Text>
    </View>
  )
}
