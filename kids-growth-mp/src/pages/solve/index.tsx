import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { generateSolve, type SolveProblem } from '../../core/mathDrill'
import { playText, stopAudio } from '../../lib/audio'
import { getCurrentChildId, autoAddErrorCard, finishDrill, addStudyTime } from '../../store/study'
import CorrectBurst from '../../components/CorrectBurst'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

/**
 * 解题四步。
 *
 * **这不是一种新题型,是一种新的做题方式。**
 *
 * 用户的原话:「应该把已有的条件列出来,在纸面上去写。口算越往后会越来越廉价,
 * 在脑子里去计算并不是核心,人脑应该把更多的精力用来推理。」
 *
 * 手机上他没法写字(4 岁半更不会),但**纸面草稿的本质是把工作记忆外化** ——
 * 这件事可以数字化:一道应用题拆成五步,每一步点出来,
 * 而**答过的那一步就留在屏幕上**,一行一行长成一张草稿:
 *
 *     已知:  这边 5 个   那边 3 个
 *     要求:  一共有几个
 *     算式:  5 ＋ 3  = 8
 *
 * 关键在于**「算」被挤到了最后一步**,前面全是理解和表征。
 * 而且他卡在哪一步是看得见的 —— 是没数清条件、没听懂问的是什么、
 * 还是选错了运算、还是算错了。这四种的补救办法完全不同,
 * 而口算那边一律只告诉你「错了」。
 *
 * 答错**不翻页**:退回去重选,直到对为止。
 * 这是教学流程不是考试 —— 在纸上做错了也是擦掉重写,不会换一道题。
 */

/** 一次做几道 —— 五步一道,五道就是二十五次点击,对 4 岁半正好 */
const ROUND = 5

function Solve() {
  const [childId] = useState(() => getCurrentChildId())
  const [problems] = useState<SolveProblem[]>(() =>
    Array.from({ length: ROUND }, () => generateSolve()),
  )
  const [pi, setPi] = useState(0)
  const [si, setSi] = useState(0)
  /** 草稿三行,每行是若干条已经写上去的内容 */
  const [notes, setNotes] = useState<string[][]>([[], [], []])
  /** 这一步点错过的选项(灰掉,但不翻页) */
  const [wrong, setWrong] = useState<number[]>([])
  /** 刚点中的那个 —— 只用来做动画 */
  const [tapped, setTapped] = useState(0)
  const [burst, setBurst] = useState(0)
  /** 这一道题有没有一次就答对(全部五步都是第一次点对) */
  const [clean, setClean] = useState(true)
  const [cleanCount, setCleanCount] = useState(0)
  const [done, setDone] = useState(false)
  const [startedAt] = useState(Date.now())

  const p = problems[pi]
  const step = p?.steps[si]

  const fxTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
    题目和每一步的问话都要**念出来** —— 他一个字都不认识。
    换步就念新的那一句;题目本身留一个按钮随时重听。
  */
  useEffect(() => {
    if (done || !step) return
    const t = setTimeout(() => void playText(step.ask, 'zh_CN'), 320)
    return () => clearTimeout(t)
  }, [pi, si, done, step])

  useEffect(
    () => () => {
      stopAudio()
      if (fxTimer.current) clearTimeout(fxTimer.current)
      if (nextTimer.current) clearTimeout(nextTimer.current)
    },
    [],
  )

  const buzz = () => {
    try {
      Taro.vibrateShort({ type: 'light' })
    } catch {
      /* 忽略 */
    }
  }

  const finishAll = (finalClean: number) => {
    stopAudio()
    const sec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    try {
      addStudyTime(sec)
      /*
        计分用**一次做对的题数**,不是「做完几道」——
        每一道最后都被他做出来了,按做完算的话所有人永远满分,那个分就没意义了。
        走 finishDrill 和口算同一条路:积分上限、每日统计都在那里收口。
      */
      finishDrill({
        childId,
        kind: 'solve',
        total: problems.length,
        correct: finalClean,
        durationSec: sec,
      })
    } catch {
      /* 结算失败不该挡住完成页 */
    }
    setDone(true)
    flushNow()
  }

  const choose = (n: number) => {
    if (!step || wrong.indexOf(n) >= 0) return
    buzz()
    setTapped(n)
    if (fxTimer.current) clearTimeout(fxTimer.current)
    fxTimer.current = setTimeout(() => setTapped(0), 600)

    if (n !== step.answer) {
      /*
        **答错不翻页。**
        这是教学流程不是考试 —— 在纸上做错了也是擦掉重写,不会换一道题。
        点错的那个灰掉(而不是消失:位置一变他手指又要重新找),
        他接着在剩下的里选。
      */
      setWrong((w) => [...w, n])
      setClean(false)
      return
    }

    // 对了:写进草稿
    setNotes((cur) => {
      const next = cur.map((r) => [...r])
      next[step.row].push(step.note)
      return next
    })
    setWrong([])
    setBurst((b) => b + 1)

    if (si + 1 < p.steps.length) {
      setSi(si + 1)
      return
    }

    // 这一道做完了
    const nextClean = cleanCount + (clean ? 1 : 0)
    setCleanCount(nextClean)
    /*
      中间卡过的题收进错题本 —— 但**存的是整道题的故事**,
      不是某一步。重做时他要从头走一遍:卡在哪一步往往不是固定的,
      只补那一步等于没补。
    */
    if (!clean) {
      try {
        autoAddErrorCard(childId, {
          front: p.story,
          back: String(p.steps[p.steps.length - 1].note).replace('= ', ''),
          subject: '数学',
        })
      } catch {
        /* 记错题失败不该打断做题 */
      }
    }

    nextTimer.current = setTimeout(() => {
      if (pi + 1 >= problems.length) {
        finishAll(nextClean)
        return
      }
      setPi(pi + 1)
      setSi(0)
      setNotes([[], [], []])
      setWrong([])
      setClean(true)
    }, 900)
  }

  if (done) {
    const sec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    return (
      <View className='solve solve--center'>
        <Text className='solve__emoji'>{cleanCount >= problems.length - 1 ? '🏆' : '💪'}</Text>
        <Text className='solve__big'>做完啦!</Text>
        <Text className='solve__sub'>
          {problems.length} 道题 · 一次做对 {cleanCount} 道 · 用时 {sec} 秒
        </Text>
        {/*
          这里**不说「错了几道」**。
          每一道最后都被他做出来了,中间卡一下是正常的 ——
          解题本来就是试出来的。说「一次做对几道」既诚实,又不否定他做完的事。
        */}
        <Text className='solve__note'>
          卡住过的题已经收进错题本,过两天会再出现一次。
        </Text>
        <View className='btn btn--primary btn--wide' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>← 再来一组</Text>
        </View>
      </View>
    )
  }

  if (!p || !step) return <View className='solve' />

  return (
    <View className='solve'>
      {burst > 0 ? <CorrectBurst seed={burst} combo={0} /> : null}

      <View className='solve__bar'>
        <Text className='solve__exit' onClick={() => Taro.navigateBack()}>
          ‹ 退出
        </Text>
        <Text className='solve__count'>
          第 {pi + 1}/{problems.length} 题 · 第 {si + 1}/{p.steps.length} 步
        </Text>
      </View>
      <View className='solve__prog'>
        <View
          className='solve__fill'
          style={{ width: `${Math.round(((pi * p.steps.length + si) / (problems.length * p.steps.length)) * 100)}%` }}
        />
      </View>

      {/* 题目:可以随时重听 */}
      <View className='story' onClick={() => void playText(p.story, 'zh_CN')}>
        <Text className='story__t'>{p.story}</Text>
        <Text className='story__spk'>🔊 再听一遍</Text>
      </View>

      {/* 图 */}
      {p.visual ? (
        <View className='sv'>
          {p.visual.groups.map((g, gi) => (
            <View key={`${g.emoji}-${gi}`} className='sv__g'>
              {gi > 0 && p.visual!.ops[gi - 1] ? (
                <Text className='sv__op'>{p.visual!.ops[gi - 1]}</Text>
              ) : null}
              <View className='sv__items'>
                {Array.from({ length: g.n }, (_, i) => (
                  <Text
                    key={`${gi}-${i}`}
                    className={
                      gi === 0 && !!p.visual!.strike && i >= g.n - (p.visual!.strike as number)
                        ? 'sv__i sv__i--gone'
                        : 'sv__i'
                    }
                  >
                    {g.emoji}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/*
        **草稿。**

        这是整件事的核心:答过的每一步都留在这儿,一行一行长出来。
        他看得见「我已经知道了什么」「我要求什么」「算式长什么样」——
        而这正是纸笔解题里最重要的那个动作,只不过是点出来的。
      */}
      <View className='pad'>
        {p.labels.map((lab, ri) => (
          <View key={lab} className={notes[ri].length > 0 ? 'pad__r pad__r--on' : 'pad__r'}>
            <Text className='pad__l'>{lab}</Text>
            <View className='pad__v'>
              {notes[ri].map((n, ni) => (
                <Text key={`${ri}-${ni}`} className='pad__n'>
                  {n}
                </Text>
              ))}
              {notes[ri].length === 0 ? <Text className='pad__blank'>——</Text> : null}
            </View>
          </View>
        ))}
      </View>

      {/* 当前这一步 */}
      <View className='askrow' onClick={() => void playText(step.ask, 'zh_CN')}>
        <Text className='askrow__t'>{step.ask}</Text>
        <Text className='askrow__spk'>🔊</Text>
      </View>

      <View className='sch'>
        {step.choices.map((c, i) => {
          const n = i + 1
          const isWrong = wrong.indexOf(n) >= 0
          return (
            <View
              key={`${c.label}-${i}`}
              className={`sch__b${isWrong ? ' sch__b--gone shook' : ''}${
                tapped === n && !isWrong ? ' tapped' : ''
              }`}
              onClick={() => choose(n)}
            >
              <Text className='sch__t'>{c.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Solve)
