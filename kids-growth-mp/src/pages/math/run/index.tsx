import { useEffect, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import {
  generateDrill,
  generateGroupDrill,
  type MathKind,
  type MathProblem,
} from '../../../core/mathDrill'
import {
  getCurrentChildId,
  finishDrill,
  addStudyTime,
  autoAddErrorCard,
} from '../../../store/study'
import { awardSticker, feedPet, bumpChallenge } from '../../../store/fun'
import CorrectBurst from '../../../components/CorrectBurst'
import { playWordAudio } from '../../../lib/audio'
import type { StickerDef } from '../../../core/stickers'
import { withGuard } from '../../../components/Guard'
import { flushNow } from '../../../store/db'
import '../index.scss'

/**
 * 口算·做题页。
 *
 * 为什么把做题从选题页里拆出来变成**单独一页**:
 *
 * 微信顶部那个返回箭头是系统的,点下去一定是 navigateBack —— 页面内部
 * 拦不住它。原先做题和选题挤在同一页,于是「做完一组按返回」直接回到首页,
 * 而实际情况几乎每次都是连着做两三组:回首页再点进来要三下,
 * 还得重新找到「口算练习」那个入口。
 *
 * 拆成两页之后,系统返回天然就退回选题页 —— 不需要任何拦截,
 * 也不会有「页面里的退出按钮和系统返回行为不一致」这种别扭。
 */
function MathRun() {
  const router = useRouter()
  const params = router.params as { kinds?: string; count?: string; stage?: string }
  const kinds = String(params.kinds ?? '')
    .split(',')
    .filter(Boolean) as MathKind[]
  const count = Math.max(1, Number(params.count) || 20)
  const rangeStage = params.stage === 'toddler' ? 'toddler' : 'primary'

  const [problems] = useState<MathProblem[]>(() =>
    kinds.length > 1
      ? generateGroupDrill(kinds, count, rangeStage)
      : generateDrill(kinds[0], count, rangeStage),
  )
  const [startedAt] = useState(Date.now())
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<'none' | 'ok' | 'no'>('none')
  const [summary, setSummary] = useState<{
    correct: number
    total: number
    points: number
    sec: number
    /** 这一组有没有撞上「今天的分拿满了」 */
    capped: boolean
  } | null>(null)
  const [combo, setCombo] = useState(0)
  /** 答对特效:每答对一题 +1,用来重新触发动画 */
  const [burst, setBurst] = useState(0)
  const [gotSticker, setGotSticker] = useState<StickerDef | null>(null)
  const [evolved, setEvolved] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)
  /** 点过的那些实物(按「第几组-第几个」记),用来做「点着数」 */
  const [tapped, setTapped] = useState<string[]>([])
  /** 点选题:他点的是第几个(0 = 还没点)—— 只用来画高亮,判分在 submit 里 */
  const [chosen, setChosen] = useState(0)

  /** 这一组是不是英语口算 —— 决定题面要不要念出来 */
  const isEnglish = kinds.some((k) => k === 'enCount' || k === 'enAdd' || k === 'enSub')

  // 英语题进来自动读一遍:他不认英文字,不出声这道题就是空白
  useEffect(() => {
    if (!isEnglish) return
    const cur = problems[idx]
    if (!cur || feedback !== 'none') return
    const t = setTimeout(() => void playWordAudio(cur.text), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, isEnglish, feedback])

  const tapCount = (key: string, struck: boolean) => {
    // 划掉的不参与数数 —— 它们已经被拿走了
    if (struck) return
    setTapped((prev) => (prev.indexOf(key) >= 0 ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const finishAll = (nextCorrect: number) => {
    const sec = Math.round((Date.now() - startedAt) / 1000)
    addStudyTime(sec)
    const res = finishDrill({
      childId: getCurrentChildId(),
      kind: kinds[0],
      total: problems.length,
      correct: nextCorrect,
      durationSec: sec,
    })
    // 和背单词一样的结算奖励:贴纸、喂宠物、每日挑战
    try {
      setGotSticker(awardSticker(nextCorrect, problems.length) ?? null)
      setEvolved(feedPet(nextCorrect))
      setChallengeDone(bumpChallenge())
    } catch {
      /* 忽略 */
    }
    setSummary({
      correct: nextCorrect,
      total: problems.length,
      points: res.pointsAwarded,
      sec,
      capped: !!res.capped,
    })
    flushNow()
  }

  /**
   * 交卷。
   *
   * `picked` 是点选题选中的第几个(从 1 开始);输入题传 undefined,走输入框。
   */
  const submit = (picked?: number) => {
    if (feedback !== 'none') return
    const p = problems[idx]
    const isRight =
      picked !== undefined
        ? picked === p.answer
        : input.trim() !== '' && Number(input.trim()) === p.answer
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
          /*
            重做时的形式要和做题时**一模一样** ——
            点选题错了不能变成让他打字。这是用户定过的规矩:
            「错了什么类型的题就归入什么错题,不要换类型」。
          */
          redo: p.choices
            ? {
                type: 'choice',
                options: p.choices.map((c) => c.label),
                answer: p.choices[p.answer - 1]?.label ?? String(p.answer),
                optionKind: p.choices[0]?.kind === 'text' ? 'text' : 'emoji',
              }
            : { type: 'input', answer: p.answer, visual: p.visual },
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
          setChosen(0)
          setFeedback('none')
          setTapped([])
        }
      },
      isRight ? 420 : 1000,
    )
  }

  if (problems.length === 0) {
    return (
      <View className='math math--center'>
        <Text className='math__emoji'>🧮</Text>
        <Text className='math__big'>没有题目</Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>返回选题</Text>
        </View>
      </View>
    )
  }

  if (summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    return (
      <View className='math math--center'>
        <Text className='math__emoji'>{pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : '💪'}</Text>
        <Text className='math__big'>练完啦!</Text>
        <View className='mresult'>
          <View className='mresult__c'>
            <Text className='mresult__n'>{summary.correct}/{summary.total}</Text>
            <Text className='mresult__l'>答对</Text>
          </View>
          <View className='mresult__c'>
            <Text className='mresult__n'>{summary.sec}s</Text>
            <Text className='mresult__l'>用时</Text>
          </View>
          <View className='mresult__c'>
            <Text className='mresult__n mresult__n--sun'>+{summary.points}</Text>
            <Text className='mresult__l'>积分</Text>
          </View>
        </View>
        {/* 撞上上限要说清楚 —— 认真做完看到「+0」不像规则,像程序坏了 */}
        {summary.capped ? (
          <Text className='reward__line'>🌙 今天的成长值已经拿满啦,明天再来接着涨</Text>
        ) : null}
        {gotSticker ? <Text className='reward__line'>🎁 获得贴纸「{gotSticker.name}」{gotSticker.emoji}</Text> : null}
        {evolved ? <Text className='reward__line'>✨ 宠物进化啦!</Text> : null}
        {challengeDone ? <Text className='reward__line'>🏆 今日挑战完成!</Text> : null}
        {/*
          做完之后**回到选题页**,不是首页 —— 顶上的系统返回也是这个行为,
          两边一致,不会让人愣一下。
        */}
        <View className='btn btn--primary btn--wide' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>← 回到口算,再来一组</Text>
        </View>
      </View>
    )
  }

  const p = problems[idx]
  return (
    <View className='math'>
      <View className='math__bar'>
        <Text className='math__exit' onClick={() => Taro.navigateBack()}>‹ 退出</Text>
        <Text className='math__count'>{idx + 1}/{problems.length}</Text>
      </View>
      <View className='math__prog'>
        <View
          className='math__progfill'
          style={{ width: `${Math.round((idx / problems.length) * 100)}%` }}
        />
      </View>
      {combo >= 2 ? <Text className='combo'>🔥 连对 {combo}</Text> : null}
      {burst > 0 ? <CorrectBurst seed={burst} combo={combo} /> : null}
      <View className='q'>
        <Text className='q__t'>{p?.text}</Text>

        {/*
          **钟面。**
          emoji 里的 🕒 只有十二个固定整点、而且小到看不清指针 ——
          认时间这道题的全部内容就在指针上,所以只能自己画一个。
          时针要跟着分钟走(3:30 的时针在 3 和 4 中间),
          画成正对着 3 的话,教给他的是错的。
        */}
        {p?.clock ? (
          <View className='clock'>
            <View className='clock__face'>
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h, i) => (
                <Text
                  key={h}
                  className='clock__num'
                  style={{
                    transform: `rotate(${i * 30}deg) translateY(-104px) rotate(${-i * 30}deg)`,
                  }}
                >
                  {h}
                </Text>
              ))}
              <View
                className='clock__hand clock__hand--h'
                style={{
                  transform: `rotate(${((p.clock.hour % 12) + p.clock.minute / 60) * 30}deg)`,
                }}
              />
              <View
                className='clock__hand clock__hand--m'
                style={{ transform: `rotate(${p.clock.minute * 6}deg)` }}
              />
              <View className='clock__pin' />
            </View>
          </View>
        ) : null}

        {/*
          **方位图。**
          「在盒子里面」用任何 emoji 组合都表达不了 ——
          试过用 ASCII 方括号 `[ 🐰 ]`,孩子看到的是两个字符,不是一个盒子。
          所以画一个真的方框,把东西摆进去 / 摆上面 / 摆下面 / 摆旁边。
        */}
        {p?.spatial ? (
          <View className='sp2'>
            {p.spatial.where === 'above' ? (
              <Text className='sp2__thing'>{p.spatial.thing}</Text>
            ) : null}
            <View className='sp2__mid'>
              <View className='sp2__box'>
                {p.spatial.where === 'in' ? (
                  <Text className='sp2__thing'>{p.spatial.thing}</Text>
                ) : null}
              </View>
              {p.spatial.where === 'beside' ? (
                <Text className='sp2__thing'>{p.spatial.thing}</Text>
              ) : null}
            </View>
            {p.spatial.where === 'below' ? (
              <Text className='sp2__thing'>{p.spatial.thing}</Text>
            ) : null}
          </View>
        ) : null}
        {/*
          英语口算的题面要**能听**。
          他还不认字,更不认英文字 —— 题目摆在那儿不出声,这道题对他就是空白。
          所以英语题一进来自动读一遍,并留一个按钮可以再听。
        */}
        {isEnglish ? (
          <View className='audio audio--big' onClick={() => void playWordAudio(p.text)}>
            <Text className='audio__t'>🔊</Text>
          </View>
        ) : null}
        {/*
          数形结合:算式下面把实物摆出来。
          他先数糖果得到答案,慢慢才把「5 + 5」这个符号和那堆糖对上 ——
          这个顺序反过来就成了死记硬背。
        */}
        {p?.visual ? (
          <View className='vis'>
            {p.visual.groups.map((g, gi) => (
              <View key={gi} className='vis__row'>
                {/* 连接符为空串表示「同一堆东西换行」,不该画出任何符号 */}
                {gi > 0 && p.visual!.ops[gi - 1] ? (
                  <Text className='vis__op'>{p.visual!.ops[gi - 1]}</Text>
                ) : null}
                <View className='vis__items'>
                  {Array.from({ length: g.n }).map((_, i) => {
                    // 减法:后面几个划掉,表示「拿走了」
                    const struck =
                      gi === 0 && !!p.visual!.strike && i >= g.n - (p.visual!.strike as number)
                    const key = `${gi}-${i}`
                    const counted = tapped.indexOf(key) >= 0
                    return (
                      <Text
                        key={i}
                        className={
                          struck ? 'vis__i vis__i--out' : counted ? 'vis__i vis__i--on' : 'vis__i'
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
              **点着数**。5 岁的孩子数东西会用手指一个个点 —— 那不是坏习惯,
              是这个阶段必经的一步(一一对应)。屏幕上没法用手指点着数,
              他就只能凭眼睛扫,很容易数错、然后以为自己不会算。
            */}
            {tapped.length > 0 ? <Text className='vis__n'>数到 {tapped.length}</Text> : null}
            <Text className='vis__hint'>
              {p.visual.strike ? '划掉的是拿走的 · ' : ''}可以点着数,数一个亮一个
            </Text>
          </View>
        ) : null}
        {/*
          **点选题:点一下就是作答,不用打字。**

          v66 补的是这个模块最要命的一处:思维板块(找不同类、找不同、
          比长短、找规律)早就写好了,但每一道都要求他读题、然后输入一个序号 ——
          「1.🍎 2.🚗 3.🚌 4.🚲 哪个不是一伙的?(答序号)」。
          一个不识字的 4 岁半明明一眼就知道苹果不是车,却因为不会输入而做不了。
          题目考的东西被交互挡在了外面。

          ⚠️ 两个分支都必须是带 onClick 的同一种节点,
          否则 Taro 会在同一位置上换节点类型,真机报 _num。
        */}
        {p.choices ? (
          <View className={p.choices[0]?.kind === 'row' ? 'ch ch--row' : 'ch'}>
            {p.choices.map((c, i) => {
              const n = i + 1
              const show = feedback !== 'none'
              const cls = show
                ? n === p.answer
                  ? 'ch__b ch__b--right'
                  : n === chosen
                    ? 'ch__b ch__b--wrong'
                    : 'ch__b'
                : 'ch__b'
              return (
                <View
                  key={`${c.label}-${i}`}
                  className={`${cls} ch__b--${c.kind ?? 'emoji'}${
                    chosen === n && feedback === 'none' ? ' tapped' : ''
                  }${show && n === chosen && n !== p.answer ? ' shook' : ''}`}
                  onClick={() => {
                    if (feedback !== 'none') return
                    setChosen(n)
                    submit(n)
                  }}
                >
                  <Text className={`ch__t ch__t--${c.kind ?? 'emoji'}`}>{c.label}</Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {!p.choices ? (
          <Input
            className={
              feedback === 'ok' ? 'q__inp q__inp--ok' : feedback === 'no' ? 'q__inp q__inp--no' : 'q__inp'
            }
            type='number'
            value={input}
            onInput={(e) => setInput(e.detail.value)}
            onConfirm={() => submit()}
            placeholder='?'
          />
        ) : null}
      </View>
      {/* 点选题的正确答案直接在选项上标出来了,不用再写一遍数字 */}
      {feedback === 'no' && p && !p.choices ? (
        <Text className='q__ans'>正确答案:{p.answer}</Text>
      ) : null}
      {/*
        点选题**不给「确定」按钮** —— 点了选项就已经答完了,
        再让他找一个确定键,等于多设一道他不认识的门槛。
      */}
      {!p?.choices ? (
        <View className='btn btn--primary btn--wide' onClick={() => submit()}>
          <Text className='btn__t'>
            {feedback === 'none' ? '确定' : feedback === 'ok' ? '✓ 答对了' : '看下一题'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(MathRun)
