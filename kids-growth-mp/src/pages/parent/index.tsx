import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { getStats, weakCards, earnedAchievements, type LearningStats } from '../../store/progress'
import { ACHIEVEMENTS } from '../../core/achievements'
import { readObject, writeObject } from '../../store/db'
import { buildWeekly, type WeeklyReport } from '../../store/weekly'
import {
  resetAudioMemory,
  ZH_VOICES,
  EN_VOICES,
  getVoice,
  setVoice,
  playText,
  playWordAudio,
} from '../../lib/audio'
import {
  ensureRewards,
  listRewards,
  listRedemptions,
  grantRedemption,
  cancelRedemption,
  addReward,
  removeReward,
  type Redemption,
  type Reward,
} from '../../store/rewards'
import { withGuard } from '../../components/Guard'
import './index.scss'

/**
 * 家长中心。
 *
 * 为什么要 PIN:这台设备是给孩子用的。统计、目标、清空数据这些不该由孩子
 * 随手改 —— 不是防坏人,是防误触,顺便让「家长看」这件事有仪式感。
 */
const PIN_KEY = 'parentPin'
const DEFAULT_PIN = '1234'
const GOAL_KEY = 'dailyMinuteLimit'
const DEFAULT_LIMIT = 30

function Parent() {
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [weak, setWeak] = useState<Array<{ front: string; lapses: number }>>([])
  const [earned, setEarned] = useState<string[]>([])
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null)
  const [rewards, setRewards] = useState<Reward[]>([])
  const [redeems, setRedeems] = useState<Redemption[]>([])
  const [zhVoice, setZhVoice] = useState('')
  const [enVoice, setEnVoice] = useState('')

  const load = () => {
    const childId = getCurrentChildId()
    setStats(getStats(childId))
    setWeak(weakCards(childId))
    setEarned(earnedAchievements(childId))
    setLimit(readObject<number>(GOAL_KEY, DEFAULT_LIMIT))
    setWeekly(buildWeekly(childId))
    ensureRewards()
    setRewards(listRewards())
    setRedeems(listRedemptions().filter((d) => !d.granted))
    setZhVoice(getVoice('zh'))
    setEnVoice(getVoice('en'))
  }

  /** 选音色:选完立刻念一句,好不好听当场就知道 */
  const pickZh = (id: string) => {
    setVoice('zh', id)
    setZhVoice(id)
    void playText('白日依山尽,黄河入海流', 'zh_CN')
  }
  const pickEn = (id: string) => {
    setVoice('en', id)
    setEnVoice(id)
    playWordAudio('apple')
  }

  /** 把学习进度导成一段文本,家长可以复制走存着(不上云也能防丢) */
  const exportData = () => {
    const w = buildWeekly(getCurrentChildId())
    const st = stats
    const text = [
      `成长学习 · 数据备份 ${new Date().toLocaleString()}`,
      st ? `等级 Lv.${st.level.cur.level} ${st.level.cur.name} / 成长值 ${st.xp}` : '',
      st ? `已掌握 ${st.mastered} / 学习中 ${st.learning} / 连续 ${st.streak} 天` : '',
      st ? `累计 ${st.sessions} 组 ${st.answered} 题,正确 ${st.correct} 题` : '',
      `本周 ${w.days} 天 ${w.answered} 题,新掌握 ${w.newMastered},习惯完成率 ${w.habitRate}%`,
    ]
      .filter(Boolean)
      .join('\n')
    Taro.setClipboardData({
      data: text,
      success: () =>
        Taro.showModal({ title: '已复制到剪贴板', content: text, showCancel: false }),
    })
  }

  const addNewReward = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Taro.showModal as any)({
      title: '新增奖励',
      editable: true,
      placeholderText: '格式:名称 空格 分数,如「去游乐园 200」',
      success: (res: { confirm: boolean; content?: string }) => {
        if (!res.confirm) return
        const raw = (res.content || '').trim()
        const m = raw.match(/^(.+?)\s+(\d+)$/)
        if (!m) {
          Taro.showToast({ title: '格式:名称 空格 分数', icon: 'none' })
          return
        }
        addReward(m[1], Number(m[2]))
        load()
      },
    })
  }

  useDidShow(() => {
    if (unlocked) load()
  })

  const tryUnlock = () => {
    const pin = readObject<string>(PIN_KEY, DEFAULT_PIN)
    if (pinInput.trim() !== pin) {
      Taro.showToast({ title: '密码不对', icon: 'none' })
      return
    }
    setUnlocked(true)
    load()
  }

  const changePin = () => {
    // Taro 的类型里还没有 editable/content(微信基础库 2.17+ 起支持可输入弹窗),
    // 这里放宽一层类型再调用。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(Taro.showModal as any)({
      title: '修改家长密码',
      editable: true,
      placeholderText: '输入 4 位数字',
      success: (res: { confirm: boolean; content?: string }) => {
        if (!res.confirm) return
        const v = (res.content || '').trim()
        if (!/^\d{4}$/.test(v)) {
          Taro.showToast({ title: '要 4 位数字', icon: 'none' })
          return
        }
        writeObject(PIN_KEY, v)
        Taro.showToast({ title: '已修改', icon: 'success' })
      },
    })
  }

  const setDailyLimit = (v: number) => {
    setLimit(v)
    writeObject(GOAL_KEY, v)
  }

  if (!unlocked) {
    return (
      <View className='pa pa--lock'>
        <Text className='pa__lockE'>🔒</Text>
        <Text className='pa__lockT'>家长中心</Text>
        <Text className='pa__lockH'>输入家长密码(默认 1234)</Text>
        <Input
          className='pa__pin'
          type='number'
          password
          maxlength={4}
          value={pinInput}
          onInput={(e) => setPinInput(e.detail.value)}
          onConfirm={tryUnlock}
          placeholder='••••'
        />
        <View className='pa__btn' onClick={tryUnlock}>
          <Text className='pa__btnT'>进入</Text>
        </View>
      </View>
    )
  }

  if (!stats) return <View className='pa' />

  const rate = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0
  const maxN = Math.max(1, ...stats.curve.map((c) => c.n))

  return (
    <View className='pa'>
      {/* 等级 */}
      <View className='lv'>
        <Text className='lv__e'>{stats.level.cur.emoji}</Text>
        <View className='lv__meta'>
          <Text className='lv__n'>
            Lv.{stats.level.cur.level} {stats.level.cur.name}
          </Text>
          <View className='lv__track'>
            <View className='lv__fill' style={{ width: `${stats.level.progress * 100}%` }} />
          </View>
          <Text className='lv__h'>
            {stats.level.next
              ? `成长值 ${stats.xp},再 ${stats.level.toNext} 升到「${stats.level.next.name}」`
              : `成长值 ${stats.xp},已是最高等级`}
          </Text>
        </View>
      </View>

      {/* 关键数字 */}
      <View className='cards'>
        <View className='c'>
          <Text className='c__n'>{stats.mastered}</Text>
          <Text className='c__l'>已掌握</Text>
        </View>
        <View className='c'>
          <Text className='c__n'>{stats.learning}</Text>
          <Text className='c__l'>学习中</Text>
        </View>
        <View className='c'>
          <Text className='c__n'>{stats.streak}</Text>
          <Text className='c__l'>连续天数</Text>
        </View>
        <View className='c'>
          <Text className='c__n'>{rate}%</Text>
          <Text className='c__l'>总正确率</Text>
        </View>
      </View>

      {/* 近 14 天 */}
      <View className='sec'>
        <Text className='sec__t'>近 14 天题量</Text>
        <View className='chart'>
          {stats.curve.map((d) => (
            <View key={d.date} className='bar'>
              <View
                className={d.n > 0 ? 'bar__v bar__v--on' : 'bar__v'}
                style={{ height: `${Math.max(4, (d.n / maxN) * 100)}%` }}
              />
              <Text className='bar__l'>{d.date.slice(8)}</Text>
            </View>
          ))}
        </View>
        <Text className='sec__tip'>
          累计 {stats.sessions} 组 / {stats.answered} 题。看趋势就好,不必追求每天最多 ——
          稳定比冲量更有效。
        </Text>
      </View>

      {/* 薄弱项 */}
      <View className='sec'>
        <Text className='sec__t'>最容易错的</Text>
        {weak.length === 0 ? (
          <Text className='sec__tip'>还没有反复出错的内容。</Text>
        ) : (
          weak.map((w) => (
            <View key={w.front} className='wrow'>
              <Text className='wrow__t'>{w.front}</Text>
              <Text className='wrow__n'>错 {w.lapses} 次</Text>
            </View>
          ))
        )}
        <Text className='sec__tip'>这些已经自动进了错题本,系统会安排它们更频繁地出现。</Text>
      </View>

      {/* 成就墙 */}
      <View className='sec'>
        <Text className='sec__t'>
          成就 {earned.length}/{ACHIEVEMENTS.length}
        </Text>
        {ACHIEVEMENTS.map((a) => {
          const has = earned.includes(a.code)
          return (
            <View key={a.code} className={has ? 'arow arow--on' : 'arow'}>
              <Text className='arow__e'>{has ? a.emoji : '🔒'}</Text>
              <View className='arow__meta'>
                <Text className='arow__n'>{a.name}</Text>
                <Text className='arow__h'>{a.how}</Text>
              </View>
            </View>
          )
        })}
      </View>

      {/* 设置 */}
      <View className='sec'>
        <Text className='sec__t'>每日护眼提醒</Text>
        <Text className='sec__tip'>
          超过这个时长,首页会提示孩子起来活动、看看远处。学龄前建议 20 分钟以内,
          小学生 30–40 分钟,中间最好有间歇。
        </Text>
        <View className='opts2'>
          {[15, 20, 30, 45].map((v) => (
            <View
              key={v}
              className={v === limit ? 'opt2 opt2--on' : 'opt2'}
              onClick={() => setDailyLimit(v)}
            >
              <Text className='opt2__t'>{v} 分钟</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 本周小结 */}
      {weekly ? (
        <View className='sec'>
          <Text className='sec__t'>本周小结</Text>
          <View className='wk'>
            <View className='wk__c'>
              <Text className='wk__n'>{weekly.days}</Text>
              <Text className='wk__l'>练习天数</Text>
            </View>
            <View className='wk__c'>
              <Text className='wk__n'>{weekly.answered}</Text>
              <Text className='wk__l'>题量</Text>
            </View>
            <View className='wk__c'>
              <Text className='wk__n'>{weekly.newMastered}</Text>
              <Text className='wk__l'>新掌握</Text>
            </View>
            <View className='wk__c'>
              <Text className='wk__n'>{weekly.habitRate}%</Text>
              <Text className='wk__l'>习惯完成</Text>
            </View>
          </View>
          <Text className='wk__cmt'>{weekly.comment}</Text>
          {weekly.advice.map((a) => (
            <Text key={a} className='wk__adv'>💡 {a}</Text>
          ))}
        </View>
      ) : null}

      {/* 待兑现的奖励 */}
      <View className='sec'>
        <Text className='sec__t'>奖励{redeems.length > 0 ? `(${redeems.length} 项待兑现)` : ''}</Text>
        {redeems.length === 0 ? (
          <Text className='sec__tip'>目前没有待兑现的奖励。</Text>
        ) : (
          redeems.map((d) => (
            <View key={d.id} className='wrow'>
              <Text className='wrow__t'>
                {d.emoji} {d.name}
              </Text>
              <Text
                className='grant'
                onClick={() => {
                  grantRedemption(d.id)
                  load()
                }}
              >
                已给他
              </Text>
              <Text
                className='grant grant--ghost'
                onClick={() => {
                  cancelRedemption(d.id)
                  load()
                }}
              >
                退回
              </Text>
            </View>
          ))
        )}
        <Text className='sec__tip'>
          奖励尽量用「体验和陪伴」而不是玩具零食 —— 用物质换学习,长期会削弱孩子本身的兴趣。
        </Text>
        {rewards.map((r) => (
          <View key={r.id} className='wrow'>
            <Text className='wrow__t'>
              {r.emoji} {r.name}
            </Text>
            <Text className='wrow__n'>{r.cost} 分</Text>
            <Text
              className='grant grant--ghost'
              onClick={() => {
                removeReward(r.id)
                load()
              }}
            >
              删
            </Text>
          </View>
        ))}
        <View className='lrow' onClick={addNewReward}>
          <Text className='lrow__t'>+ 新增奖励</Text>
        </View>
      </View>

      {/* 音色 */}
      <View className='sec'>
        <Text className='sec__t'>朗读音色</Text>
        <Text className='sec__tip'>点一下就会念一句给你听,挑顺耳的那个。</Text>
        <Text className='vlab'>中文</Text>
        {ZH_VOICES.map((v) => (
          <View
            key={v.id}
            className={v.id === zhVoice ? 'vrow vrow--on' : 'vrow'}
            onClick={() => pickZh(v.id)}
          >
            <View className='vrow__meta'>
              <Text className='vrow__n'>{v.label}</Text>
              <Text className='vrow__d'>{v.desc}</Text>
            </View>
            <Text className='vrow__pick'>{v.id === zhVoice ? '✓ 在用' : '试听'}</Text>
          </View>
        ))}
        <Text className='vlab'>英语</Text>
        {EN_VOICES.map((v) => (
          <View
            key={v.id}
            className={v.id === enVoice ? 'vrow vrow--on' : 'vrow'}
            onClick={() => pickEn(v.id)}
          >
            <View className='vrow__meta'>
              <Text className='vrow__n'>{v.label}</Text>
              <Text className='vrow__d'>{v.desc}</Text>
            </View>
            <Text className='vrow__pick'>{v.id === enVoice ? '✓ 在用' : '试听'}</Text>
          </View>
        ))}
      </View>

      <View className='sec'>
        <Text className='sec__t'>其它</Text>
        <View className='lrow' onClick={exportData}>
          <Text className='lrow__t'>导出数据(复制到剪贴板)</Text>
        </View>
        <View
          className='lrow'
          onClick={() => {
            resetAudioMemory()
            Taro.showToast({ title: '已重置,重新试发音', icon: 'success' })
          }}
        >
          <Text className='lrow__t'>重置声音记忆(换了网络后发音变哑时用)</Text>
        </View>
        <View className='lrow' onClick={changePin}>
          <Text className='lrow__t'>修改家长密码</Text>
        </View>
        <View
          className='lrow'
          onClick={() => Taro.navigateTo({ url: '/pages/privacy/index' })}
        >
          <Text className='lrow__t'>儿童隐私说明</Text>
        </View>
      </View>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Parent)
