import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import {
  getCurrentChildId,
  getDailyGoal,
  todayByArea,
  yesterdayScore,
  recordTodayScore,
} from '../../store/study'
import { todayProgress } from '../../store/habits'
import { buildDailyCard, type DailyCard } from '../../core/scoreCard'
import { buildTimeline, type Milestone } from '../../core/timeline'
import { timelineInput } from '../../store/progress'
import { withGuard } from '../../components/Guard'
import './index.scss'

/**
 * 今日评分。
 *
 * 原先它只挂在家长中心里,而家长中心一崩就整页看不到 —— 用户的反馈
 * 就是「今日评分没找到」。评分是每天都要看一眼的东西,
 * 值得有自己的一页、有自己的入口,不该寄居在别人家里。
 *
 * 这一页给的是**完整版**:分项完成度 + 实话实说的点评 + 学习足迹。
 * 首页那条星星只是它的摘要。
 */
function Score() {
  const [card, setCard] = useState<DailyCard | null>(null)
  const [marks, setMarks] = useState<Milestone[]>([])

  useDidShow(() => {
    const childId = getCurrentChildId()
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
    setMarks(buildTimeline(timelineInput(childId)))
  })

  if (!card) return <View className='sc' />

  return (
    <View className='sc'>
      <View className='sc__hero'>
        <Text className='sc__n'>{card.score}</Text>
        <Text className='sc__u'>分</Text>
      </View>
      <Text className='sc__stars'>
        {'⭐'.repeat(card.stars)}
        {'☆'.repeat(5 - card.stars)}
      </Text>
      <Text className='sc__cheer'>{card.cheer}</Text>
      {card.trend > 0 ? <Text className='sc__up'>📈 比昨天进步了</Text> : null}
      {card.trend < 0 ? <Text className='sc__flat'>今天比昨天少做了一些,没关系</Text> : null}

      <View className='sc__sec'>
        <Text className='sc__t'>今天各项</Text>
        {card.areas.map((a) => (
          <View key={a.key} className='sar'>
            <Text className='sar__n'>
              {a.emoji} {a.label}
            </Text>
            <View className='sar__track'>
              <View className='sar__fill' style={{ width: `${Math.min(100, a.pct)}%` }} />
            </View>
            <Text className='sar__v'>
              {a.done}/{a.target}
              {a.rate >= 0 ? ` · 对 ${a.rate}%` : ''}
            </Text>
          </View>
        ))}
        <Text className='sc__note'>{card.note}</Text>
      </View>

      {marks.length > 0 ? (
        <View className='sc__sec'>
          <Text className='sc__t'>学习足迹</Text>
          {marks
            .slice(-15)
            .reverse()
            .map((m) => (
              <Text key={m.date + m.title} className='sc__mark'>
                {m.emoji} {m.date} · {m.title}
              </Text>
            ))}
        </View>
      ) : null}

      <Text className='sc__tip'>
        评分主要看「做了没有」,不主要看「对了多少」—— 这个年纪正确率低,
        多半是题出难了。分数是用来看见进步的,不是用来评判他的。
      </Text>
    </View>
  )
}

export default withGuard(Score)
