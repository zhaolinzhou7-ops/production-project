import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { pickSpotCheck, scoreSpotCheck, type SpotItem } from '../../core/spotCheck'
import {
  getCurrentChildId,
  spotCandidates,
  saveSpotCheck,
  listSpotChecks,
} from '../../store/study'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

/**
 * 线下抽查 —— 整套系统里**唯一一个不在屏幕上进行**的功能。
 *
 * 所有「他掌握了多少词」的数字都来自他在屏幕上点对了。而屏幕上有图、有选项、
 * 有排除法:什么都不会的孩子四选一也能蒙对 25%,认得图的能到 80%。
 * 于是掌握量会一路涨,涨到家长深信不疑,而孩子在真实场合一个词也说不出来。
 *
 * **虚假掌握是这类工具最大的系统性风险**:它不报错、不崩溃,
 * 只会安静地积累到某一天被现实戳破。
 *
 * 所以这一页的用法是:**把手机反扣在桌上**,照着单子问,孩子用嘴回答。
 * 没有图、没有选项、没有排除法 —— 说得出就是说得出。
 * 答不出的当场退回重学,让抽查真的能改变明天练什么。
 */
function SpotCheck() {
  const [childId] = useState(() => getCurrentChildId())
  const [items] = useState<SpotItem[]>(() => pickSpotCheck(spotCandidates(getCurrentChildId())))
  const [idx, setIdx] = useState(0)
  /** 每一条的结果:true=说出来了 */
  const [marks, setMarks] = useState<boolean[]>([])
  const [done, setDone] = useState(false)
  /** 家长还没让孩子说之前,答案是藏着的 —— 摊开来孩子会照着念 */
  const [showAnswer, setShowAnswer] = useState(false)

  const mark = (ok: boolean) => {
    const next = [...marks]
    next[idx] = ok
    setMarks(next)
    setShowAnswer(false)
    if (idx + 1 >= items.length) {
      saveSpotCheck(
        childId,
        items.map((it, i) => ({ cardId: it.cardId, ok: !!next[i] })),
      )
      setDone(true)
      flushNow()
    } else {
      setIdx(idx + 1)
    }
  }

  if (items.length === 0) {
    return (
      <View className='spot spot--center'>
        <Text className='spot__emoji'>🔎</Text>
        <Text className='spot__big'>还不能抽查</Text>
        <Text className='spot__hint'>
          抽查的是**系统认为他已经掌握**的内容 —— 现在还没有攒够。
          先正常练几天,等有内容进入复习期了再来。
        </Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>知道了</Text>
        </View>
      </View>
    )
  }

  if (done) {
    const passed = marks.filter(Boolean).length
    const res = scoreSpotCheck(passed, items.length)
    const history = listSpotChecks(childId)
    const prev = history[1]
    return (
      <View className='spot spot--center'>
        <Text className='spot__emoji'>{res.rate >= 80 ? '🎯' : res.rate >= 50 ? '📈' : '🔧'}</Text>
        <Text className='spot__big'>
          说出来 {passed}/{items.length}
        </Text>
        <Text className='spot__rate'>真实掌握率 {res.rate}%</Text>
        {prev ? (
          <Text className='spot__prev'>
            上次是 {prev.rate}%
            {res.rate > prev.rate ? ' · 比上次高了' : res.rate < prev.rate ? ' · 比上次低一些' : ' · 和上次一样'}
          </Text>
        ) : null}
        {/* 说实话,但每一档都要说清楚接下来做什么,而不是只给一个评价 */}
        <Text className='spot__note'>{res.note}</Text>
        <View className='spot__list'>
          {items.map((it, i) => (
            <View key={it.cardId} className={marks[i] ? 'spot__row spot__row--ok' : 'spot__row'}>
              <Text className='spot__rowq'>
                {it.emoji ? `${it.emoji} ` : ''}
                {it.expect}
              </Text>
              <Text className='spot__rowm'>{marks[i] ? '✅ 说出来了' : '↩︎ 退回重学'}</Text>
            </View>
          ))}
        </View>
        <View className='btn btn--primary btn--wide' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>完成</Text>
        </View>
      </View>
    )
  }

  const it = items[idx]
  return (
    <View className='spot'>
      <View className='spot__bar'>
        <Text className='spot__exit' onClick={() => Taro.navigateBack()}>‹ 退出</Text>
        <Text className='spot__count'>
          {idx + 1}/{items.length}
        </Text>
      </View>

      {/*
        这一段是给**家长**读的。
        整个功能的前提是手机不对着孩子 —— 说清楚这一点,它才成立。
      */}
      <View className='spot__guide'>
        <Text className='spot__guidet'>把手机拿在自己手里,别让他看屏幕</Text>
        <Text className='spot__guides'>照着下面问,他用嘴回答 —— 没有选项、没有图可以蒙</Text>
      </View>

      <View className='spot__card'>
        <Text className='spot__deck'>{it.deckName}</Text>
        <Text className='spot__ask'>{it.ask}</Text>
        <Text className='spot__q'>问他:这个用英语/怎么说?</Text>

        {/* ⚠️ 拆成两个独立的「有/无」:同一位置在「带事件」和「不带事件」之间
            互换会让 Taro 在真机上报 _num,这个坑踩过好几次了 */}
        {showAnswer ? <Text className='spot__ans'>答案:{it.expect}</Text> : null}
        {!showAnswer ? (
          <Text className='spot__reveal' onClick={() => setShowAnswer(true)}>
            点这里看答案
          </Text>
        ) : null}
      </View>

      <View className='row'>
        <View className='btn btn--gray' onClick={() => mark(false)}>
          <Text className='btn__t'>没说出来</Text>
        </View>
        <View className='btn btn--mint' onClick={() => mark(true)}>
          <Text className='btn__t'>说出来了</Text>
        </View>
      </View>
      <Text className='spot__foot'>
        没说出来的会**自动退回重学**,并排到下一组的最前面 ——
        抽查不只是一份报告,它会改变明天练什么。
      </Text>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(SpotCheck)
