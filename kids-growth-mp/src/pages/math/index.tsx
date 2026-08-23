import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useUnload } from '@tarojs/taro'
import {
  mathKindsForTier,
  generateDrill,
  defaultTierFor,
  tierOfKind,
  MATH_TIERS,
  type MathKind,
  type MathTier,
  type MathProblem,
} from '../../core/mathDrill'
import { getCurrentChildId, finishDrill, addStudyTime, getStage, autoAddErrorCard } from '../../store/study'
import { readObject, writeObject } from '../../store/db'
import { awardSticker, feedPet, bumpChallenge } from '../../store/fun'
import CorrectBurst from '../../components/CorrectBurst'
import type { StickerDef } from '../../core/stickers'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

type Screen = 'config' | 'run' | 'done'
const COUNTS = [10, 20, 30]

function MathPage() {
  const [screen, setScreen] = useState<Screen>('config')
  /*
    难度档:优先用上次选的,没有才按学段猜。

    这里踩过一个真实的坑 —— 学段存在本地存储里,清一次数据就退回默认的「小学」,
    于是孩子第二天打开,口算从「10 以内加法」变成了两位数乘除。他不会去想
    「是不是哪个设置被重置了」,只会觉得「我不会做了」。所以难度必须
    ①页面上看得见 ②自己记得住 ③随手能换。
  */
  const [tier, setTierState] = useState<MathTier>(
    () => readObject<MathTier>('mathTier', '' as MathTier) || defaultTierFor(getStage()),
  )
  const [kind, setKind] = useState<MathKind>(() => {
    const saved = readObject<MathKind>('mathKind', '' as MathKind)
    const t = readObject<MathTier>('mathTier', '' as MathTier) || defaultTierFor(getStage())
    if (saved && tierOfKind(saved) === t) return saved
    return mathKindsForTier(t)[0].kind
  })

  const chooseTier = (t: MathTier) => {
    setTierState(t)
    writeObject('mathTier', t)
    const first = mathKindsForTier(t)[0].kind
    setKind(first)
    writeObject('mathKind', first)
  }

  const chooseKind = (k: MathKind) => {
    setKind(k)
    writeObject('mathKind', k)
  }
  const [count, setCount] = useState(20)
  const [problems, setProblems] = useState<MathProblem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<'none' | 'ok' | 'no'>('none')
  const [startedAt, setStartedAt] = useState(0)
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number; sec: number } | null>(null)
  const [combo, setCombo] = useState(0)
  /** 答对特效:每答对一题 +1,用来重新触发动画 */
  const [burst, setBurst] = useState(0)
  const [gotSticker, setGotSticker] = useState<StickerDef | null>(null)
  const [evolved, setEvolved] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)

  useUnload(() => {})

  const start = () => {
    /*
      范围要按**选中的难度档**算,不能按学段算。

      这里原先传的是 getStage() —— 于是家长明明切到了「小学档」,
      加法题却还是 10 以内(因为孩子的学段是幼儿园)。选了更难的一档
      却拿到同样简单的题,那个开关等于是假的。
    */
    const rangeStage = tier === 'toddler' ? 'toddler' : 'primary'
    setProblems(generateDrill(kind, count, rangeStage))
    setIdx(0)
    setCorrect(0)
    setInput('')
    setFeedback('none')
    setStartedAt(Date.now())
    setScreen('run')
  }

  const finishAll = (nextCorrect: number) => {
    const sec = Math.round((Date.now() - startedAt) / 1000)
    addStudyTime(sec)
    const res = finishDrill({ childId: getCurrentChildId(), kind, total: problems.length, correct: nextCorrect, durationSec: sec })
    // 和背单词一样的结算奖励:贴纸、喂宠物、每日挑战
    try {
      setGotSticker(awardSticker(nextCorrect, problems.length) ?? null)
      setEvolved(feedPet(nextCorrect))
      setChallengeDone(bumpChallenge())
    } catch {
      /* 忽略 */
    }
    setSummary({ correct: nextCorrect, total: problems.length, points: res.pointsAwarded, sec })
    setScreen('done')
    flushNow()
  }

  /** 点过的那些实物(按「第几组-第几个」记),用来做「点着数」 */
  const [tapped, setTapped] = useState<string[]>([])
  const tapCount = (key: string, struck: boolean) => {
    // 划掉的不参与数数 —— 它们已经被拿走了
    if (struck) return
    setTapped((prev) => (prev.indexOf(key) >= 0 ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const submit = () => {
    if (feedback !== 'none') return
    const p = problems[idx]
    const isRight = input.trim() !== '' && Number(input.trim()) === p.answer
    /*
      算错的题**自动进错题本**,而且是以「能重新算一遍」的形式进去的:
      带上正确答案和那张图,重做时还是让他输入,不是让他看一眼答案自评。
      看一眼答案,他记住的是答案;自己再算一遍,他练到的才是这道题。
    */
    if (!isRight) {
      try {
        autoAddErrorCard(getCurrentChildId(), {
          front: p.text,
          back: String(p.answer),
          subject: '数学',
          redo: { type: 'input', answer: p.answer, visual: p.visual },
        })
      } catch {
        /* 记错题失败不该打断做题 */
      }
    }
    const nextCorrect = correct + (isRight ? 1 : 0)
    setCorrect(nextCorrect)
    setFeedback(isRight ? 'ok' : 'no')
    if (isRight) {
      setCombo((c) => c + 1)
      setBurst((b) => b + 1)
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    } else {
      setCombo(0)
    }
    setTimeout(
      () => {
        if (idx + 1 >= problems.length) {
          finishAll(nextCorrect)
        } else {
          setIdx(idx + 1)
          setInput('')
          setFeedback('none')
          setTapped([])
        }
      },
      isRight ? 420 : 1000,
    )
  }

  if (screen === 'config') {
    return (
      <View className='math'>
        <Text className='math__h'>难度</Text>
        <View className='tiers'>
          {MATH_TIERS.map((t) => (
            <View
              key={t.tier}
              className={tier === t.tier ? 'tier tier--on' : 'tier'}
              onClick={() => chooseTier(t.tier)}
            >
              <Text className='tier__lab'>{t.label}</Text>
              <Text className='tier__desc'>{t.desc}</Text>
            </View>
          ))}
        </View>
        <Text className='math__h'>选择题型</Text>
        <View className='kinds'>
          {mathKindsForTier(tier).map((k) => (
            <View key={k.kind} className={kind === k.kind ? 'kind kind--on' : 'kind'} onClick={() => chooseKind(k.kind)}>
              <Text className='kind__icon'>{k.icon}</Text>
              <Text className='kind__lab'>{k.label}</Text>
            </View>
          ))}
        </View>
        <Text className='math__h'>题目数量</Text>
        <View className='counts'>
          {COUNTS.map((c) => (
            <View key={c} className={count === c ? 'cnt cnt--on' : 'cnt'} onClick={() => setCount(c)}>
              <Text className='cnt__t'>{c} 题</Text>
            </View>
          ))}
        </View>
        <View className='btn btn--primary btn--wide' onClick={start}><Text className='btn__t'>开始限时口算</Text></View>
      </View>
    )
  }

  if (screen === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    return (
      <View className='math math--center'>
        <Text className='math__emoji'>{pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : '💪'}</Text>
        <Text className='math__big'>练完啦!</Text>
        <View className='mresult'>
          <View className='mresult__c'><Text className='mresult__n'>{summary.correct}/{summary.total}</Text><Text className='mresult__l'>答对</Text></View>
          <View className='mresult__c'><Text className='mresult__n'>{summary.sec}s</Text><Text className='mresult__l'>用时</Text></View>
          <View className='mresult__c'><Text className='mresult__n mresult__n--sun'>+{summary.points}</Text><Text className='mresult__l'>积分</Text></View>
        </View>
        {gotSticker ? (
          <View className='reward'>
            <Text className='reward__e'>{gotSticker.emoji}</Text>
            <Text className='reward__t'>获得新贴纸「{gotSticker.name}」!</Text>
          </View>
        ) : null}
        {evolved ? <Text className='reward__line'>🎊 你的小宠物进化啦!</Text> : null}
        {challengeDone ? <Text className='reward__line'>🏆 今日挑战完成!</Text> : null}
        <View className='row'>
          <View className='btn btn--gray' onClick={() => setScreen('config')}><Text className='btn__t'>再来一组</Text></View>
          <View className='btn btn--primary' onClick={() => Taro.navigateBack()}><Text className='btn__t'>完成</Text></View>
        </View>
      </View>
    )
  }

  const p = problems[idx]
  return (
    <View className='math'>
      <View className='math__bar'>
        <Text className='math__exit' onClick={() => Taro.navigateBack()}>退出</Text>
        <Text className='math__count'>{idx + 1}/{problems.length}</Text>
      </View>
      {combo >= 2 ? <Text className='combo'>🔥 连对 {combo}</Text> : null}
      {burst > 0 ? <CorrectBurst seed={burst} combo={combo} /> : null}
      <View className='q'>
        <Text className='q__t'>{p?.text}</Text>
        {/*
          数形结合:算式下面把实物摆出来。
          他先数糖果得到答案,慢慢才把「5 + 5」这个符号和那堆糖对上 ——
          这个顺序反过来就成了死记硬背。
        */}
        {p?.visual ? (
          <View className='vis'>
            {p.visual.groups.map((g, gi) => (
              <View key={gi} className='vis__row'>
                {gi > 0 ? <Text className='vis__op'>{p.visual!.ops[gi - 1] ?? '+'}</Text> : null}
                <View className='vis__items'>
                  {Array.from({ length: g.n }).map((_, i) => {
                    // 减法:后面几个划掉,表示「拿走了」
                    const struck =
                      gi === 0 &&
                      !!p.visual!.strike &&
                      i >= g.n - (p.visual!.strike as number)
                    const key = `${gi}-${i}`
                    const counted = tapped.indexOf(key) >= 0
                    return (
                      <Text
                        key={i}
                        className={
                          struck
                            ? 'vis__i vis__i--out'
                            : counted
                              ? 'vis__i vis__i--on'
                              : 'vis__i'
                        }
                        onClick={() => tapCount(key, struck)}
                      >
                        {g.emoji}
                      </Text>
                    )
                  })}
                </View>
              </View>
            ))}
            {/*
              **点着数**。

              5 岁的孩子数东西时会用手指一个个点 —— 这不是坏习惯,是这个阶段
              必经的一步(「一一对应」)。屏幕上没法用手指点着数,他就只能凭
              眼睛扫,很容易数错、然后以为自己不会算。
              点一下就变个样子并报出数,等于把手指还给他。数完了直接填答案。
            */}
            {tapped.length > 0 ? (
              <Text className='vis__n'>数到 {tapped.length}</Text>
            ) : null}
            <Text className='vis__hint'>
              {p.visual.strike ? '划掉的是拿走的 · ' : ''}可以点着数,数一个亮一个
            </Text>
          </View>
        ) : null}
        <Input
          className={feedback === 'ok' ? 'q__inp q__inp--ok' : feedback === 'no' ? 'q__inp q__inp--no' : 'q__inp'}
          type='number'
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={submit}
          placeholder='?'
        />
      </View>
      {feedback === 'no' && p ? <Text className='q__ans'>正确答案:{p.answer}</Text> : null}
      <View className='btn btn--primary btn--wide' onClick={submit}><Text className='btn__t'>{feedback === 'none' ? '确定' : feedback === 'ok' ? '✓ 答对了' : '看下一题'}</Text></View>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(MathPage)
