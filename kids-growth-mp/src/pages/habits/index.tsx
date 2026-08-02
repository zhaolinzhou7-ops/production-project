import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  PERIODS,
  habitCheer,
  templatesFor,
  CATEGORY_COLOR,
  type HabitPeriod,
  type HabitCategory,
} from '../../core/habits'
import { getPoints } from '../../store/study'
import { levelOf } from '../../core/levels'
import {
  ensureHabits,
  listHabits,
  doneOn,
  toggleHabit,
  habitStreak,
  weekGrid,
  allDoneStreak,
  habitPointsOn,
  byCategoryOn,
  addHabitFromTemplate,
  addCustomHabit,
  removeHabit,
  type Habit,
} from '../../store/habits'
import { getStage } from '../../store/study'
import CorrectBurst from '../../components/CorrectBurst'
import { todayISO, addDays } from '../../core/dateUtils'
import { usePrompt } from '../../components/Prompt'
import { withGuard } from '../../components/Guard'
import './index.scss'

function Habits() {
  const { prompt, promptNode } = usePrompt()
  const [habits, setHabits] = useState<Habit[]>([])
  const [done, setDone] = useState<string[]>([])
  const [fullStreak, setFullStreak] = useState(0)
  const [burst, setBurst] = useState(0)
  const [manage, setManage] = useState(false)
  /** 今天靠打卡拿了多少分 + 当前等级 —— 让「打卡 → 加分 → 升级」这条链子看得见 */
  const [habitPts, setHabitPts] = useState(0)
  const [xp, setXp] = useState(0)
  const [cats, setCats] = useState<Array<{ category: HabitCategory; done: number; total: number }>>([])
  /** 刚勾上时飘一个「+5」,让加分这件事被看见 */
  const [gained, setGained] = useState(0)
  /*
    在看哪一天。

    这一页真正的用户是家长 —— 4 岁半的孩子不会自己来点「按时蹲粑粑」。
    而家长常常是第二天早上才想起「昨晚洗澡了、刷牙了」。不给补,记录就
    永远是不准的,连续天数还会被一次「忘了点」白白打断。
  */
  const [day, setDay] = useState(todayISO())
  const isToday = day === todayISO()

  const refresh = (d = day) => {
    ensureHabits()
    setHabits(listHabits())
    setDone(doneOn(d))
    setFullStreak(allDoneStreak())
    setHabitPts(habitPointsOn(d))
    setXp(getPoints().xp)
    setCats(byCategoryOn(d))
  }

  useDidShow(() => refresh())

  const switchDay = (d: string) => {
    setDay(d)
    refresh(d)
  }

  const tap = (h: Habit) => {
    if (manage) return
    const nowDone = toggleHabit(h.id, day)
    if (nowDone) {
      setBurst((b) => b + 1)
      // 飘一个「+5」:孩子得看见分是怎么来的,否则打卡就只是个对勾
      setGained(h.points)
      setTimeout(() => setGained(0), 1400)
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    }
    refresh()
  }

  const askRemove = (h: Habit) => {
    Taro.showModal({
      title: `去掉「${h.name}」?`,
      content: '以后不再出现在清单里,已有的打卡记录保留。',
      success: (res) => {
        if (!res.confirm) return
        removeHabit(h.id)
        refresh()
      },
    })
  }

  const addFromTemplate = () => {
    const have = new Set(habits.map((h) => h.id))
    const pool = templatesFor(getStage()).filter((t) => !have.has(t.key))
    if (pool.length === 0) {
      Taro.showToast({ title: '模板都加过了', icon: 'none' })
      return
    }
    Taro.showActionSheet({
      itemList: pool.slice(0, 10).map((t) => `${t.emoji} ${t.name}`),
      success: (res) => {
        addHabitFromTemplate(pool[res.tapIndex])
        refresh()
      },
      fail: () => undefined,
    })
  }

  const addCustom = () => {
    prompt({
      title: '自己加一条',
      hint: '比如:给绿植浇水',
      onOk: (name) => {
        if (!name) return
        Taro.showActionSheet({
          itemList: PERIODS.map((p) => `${p.emoji} ${p.label}`),
          success: (r) => {
            addCustomHabit(name, PERIODS[r.tapIndex].key as HabitPeriod)
            refresh()
          },
          fail: () => undefined,
        })
      },
    })
  }

  const total = habits.length
  const doneCount = done.filter((id) => habits.some((h) => h.id === id)).length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <View className='hb'>
      {promptNode}
      {burst > 0 ? <CorrectBurst seed={burst} combo={0} /> : null}
      {gained > 0 ? <Text className='gain'>+{gained} 分</Text> : null}

      {/*
        今天 / 昨天。真正在点这些格子的是家长,而家长常常是第二天早上
        才想起「昨晚洗澡了」。不给补,记录永远不准,连续天数也会被
        一次「忘了点」白白打断。
      */}
      <View className='daysw'>
        <View
          className={isToday ? 'daysw__b daysw__b--on' : 'daysw__b'}
          onClick={() => switchDay(todayISO())}
        >
          <Text className='daysw__t'>今天</Text>
        </View>
        <View
          className={!isToday ? 'daysw__b daysw__b--on' : 'daysw__b'}
          onClick={() => switchDay(addDays(todayISO(), -1))}
        >
          <Text className='daysw__t'>补昨天</Text>
        </View>
      </View>
      {!isToday ? <Text className='daysw__note'>正在补记 {day} 的打卡</Text> : null}

      <View className='hb__hero'>
        <View className='ring'>
          <Text className='ring__n'>
            {doneCount}/{total}
          </Text>
        </View>
        <View className='hb__meta'>
          <Text className='hb__cheer'>{habitCheer(doneCount, total)}</Text>
          <Text className='hb__pts'>
            今天打卡拿到 {habitPts} 分 · 总成长值 {xp}({levelOf(xp).cur.emoji}{' '}
            {levelOf(xp).cur.name})
          </Text>
          <View className='hb__track'>
            <View className='hb__fill' style={{ width: `${pct}%` }} />
          </View>
          {fullStreak > 0 ? <Text className='hb__streak'>🔥 全部做到已连续 {fullStreak} 天</Text> : null}
        </View>
      </View>

      {PERIODS.map((p) => {
        const list = habits.filter((h) => h.period === p.key)
        if (list.length === 0) return null
        return (
          <View key={p.key} className='grp'>
            <Text className='grp__t'>
              {p.emoji} {p.label}
            </Text>
            {list.map((h) => {
              const isDone = done.includes(h.id)
              const streak = habitStreak(h.id)
              const week = weekGrid(h.id)
              return (
                <View
                  key={h.id}
                  className={isDone ? 'hrow hrow--on' : 'hrow'}
                  onClick={() => tap(h)}
                  onLongPress={() => askRemove(h)}
                >
                  <Text className='hrow__e'>{h.emoji}</Text>
                  <View className='hrow__meta'>
                    <Text className='hrow__n'>
                      {h.name}
                      {h.weekly ? ' · 每周一次' : ''}
                    </Text>
                    <View className='hrow__tags'>
                      {h.category ? (
                        <Text
                          className='hrow__cat'
                          style={{ background: CATEGORY_COLOR[h.category] }}
                        >
                          {h.category}
                        </Text>
                      ) : null}
                      <Text className='hrow__pt'>+{h.points} 分</Text>
                    </View>
                    <View className='hrow__week'>
                      {week.map((d) => (
                        <View key={d.date} className={d.done ? 'dot dot--on' : 'dot'} />
                      ))}
                      {streak > 1 ? <Text className='hrow__s'>连续 {streak} 天</Text> : null}
                    </View>
                  </View>
                  {/*
                    ⚠️ 这两个必须写成**各自独立的「有/无」**,不能写成
                    `manage ? <带onClick的Text> : <不带的Text>`。
                    Taro 给带事件和不带事件的节点编的别名不同,同一个位置
                    互换会让别名对不上,真机上报 componentsAlias[...]._num。
                    拆成两个之后,各自只在「渲染/不渲染」之间切,就安全了。
                  */}
                  {manage ? (
                    <Text className='hrow__del' onClick={() => askRemove(h)}>
                      删除
                    </Text>
                  ) : null}
                  {!manage ? (
                    <Text className={isDone ? 'hrow__ck hrow__ck--on' : 'hrow__ck'}>
                      {isDone ? '✓' : ''}
                    </Text>
                  ) : null}
                </View>
              )
            })}
          </View>
        )
      })}

      {cats.length > 0 ? (
        <View className='catbar'>
          <Text className='catbar__t'>今天各方面</Text>
          <View className='catbar__row'>
            {cats.map((c) => (
              <View className='catchip' key={c.category}>
                <View
                  className='catchip__dot'
                  style={{ background: CATEGORY_COLOR[c.category] }}
                />
                <Text className='catchip__t'>
                  {c.category} {c.done}/{c.total}
                </Text>
              </View>
            ))}
          </View>
          <Text className='catbar__h'>
            生活、学习、运动、品德、家务 —— 五样都沾一点比某一样做到满分更要紧。
          </Text>
        </View>
      ) : null}

      <View className='hb__acts'>
        <Text className='hb__btn' onClick={addFromTemplate}>
          + 从模板添加
        </Text>
        <Text className='hb__btn' onClick={addCustom}>
          + 自己加一条
        </Text>
        <Text className='hb__btn hb__btn--ghost' onClick={() => setManage(!manage)}>
          {manage ? '完成' : '管理'}
        </Text>
      </View>

      <Text className='hb__note'>
        点一下就算完成,再点一次可以取消。漏了一天不扣分,第二天照样从头开始 ——
        习惯是靠一次次做成的,不是靠罚出来的。长按某一条也可以删掉它。
      </Text>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Habits)
