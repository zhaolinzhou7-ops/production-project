import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import {
  buildExam,
  examPeriodDef,
  pickScoreBand,
  compareWithLast,
  EXAM_PERIODS,
  type ExamPeriod,
  type ExamQuestion,
} from '../../core/exam'
import {
  getCurrentChildId,
  examCandidates,
  saveExam,
  lastExamScore,
  listExams,
  autoAddErrorCard,
} from '../../store/study'
import { playWordAudio, playText, stopAudio } from '../../lib/audio'
import { OPTION_LETTERS } from '../../core/redo'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

/**
 * 阶段测验。
 *
 * 平时的练习都带着脚手架:有图、有选项、错了当场告诉他答案、同一批卡反复出现。
 * 这些在**学的时候**是对的,但它们让一个问题永远看不清:
 * **撤掉脚手架之后,他到底会多少?**
 *
 * 所以这一页故意和练习不一样:
 * - 跨卡组抽题,不提前说考哪一包
 * - **做完不当场纠正** —— 当场纠正就变成了边考边学,测出来的是短时记忆
 * - 交卷后一次性给分、逐题回顾、错的自动进错题本
 *
 * 对孩子的意义不是「被考」,是**看见自己的进步**:同一类卷子上个月 60 分、
 * 这个月 90 分 —— 这是日常练习给不了的反馈。所以分数永远和**自己的上一次**比,
 * 而且没有不及格(见 core/exam 的 pickScoreBand)。
 */
function ExamPage() {
  const router = useRouter()
  const period = ((router.params.period as ExamPeriod) || 'week') as ExamPeriod
  const def = examPeriodDef(period)

  const [childId] = useState(() => getCurrentChildId())
  const [questions] = useState<ExamQuestion[]>(() =>
    buildExam(examCandidates(getCurrentChildId()), examPeriodDef(period).size),
  )
  const [idx, setIdx] = useState(0)
  /** 每道题他选了什么(按题序);没答的是空串 */
  const [answers, setAnswers] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const q = questions[idx]

  const play = (text?: string, lang: 'zh' | 'en' = 'zh') => {
    if (!text) return
    if (lang === 'en') void playWordAudio(text)
    else void playText(text, 'zh_CN')
  }

  const choose = (opt: string) => {
    if (!q) return
    const next = [...answers]
    next[idx] = opt
    setAnswers(next)
    /*
      **不当场告诉他对错。**
      当场纠正会让后面的题变成「刚才那个是这样,那这道大概也……」——
      测出来的是短时记忆,不是他真正掌握的东西。
      所以这里只是往下走一题。
    */
    setTimeout(() => {
      if (idx + 1 >= questions.length) finish(next)
      else setIdx(idx + 1)
    }, 260)
  }

  const finish = (finalAnswers: string[]) => {
    stopAudio()
    const correct = questions.reduce(
      (n, x, i) => n + (finalAnswers[i] === x.answer ? 1 : 0),
      0,
    )
    saveExam(childId, period, questions.length, correct)
    // 错的自动进错题本,重做时形式和考试时一样(选择题)
    questions.forEach((x, i) => {
      if (finalAnswers[i] === x.answer) return
      try {
        autoAddErrorCard(childId, {
          front: x.prompt,
          back: x.answer,
          subject: '测验',
          redo: {
            type: 'choice',
            options: x.options,
            answer: x.answer,
            optionKind: x.optionKind,
            emoji: x.emoji,
            audio: x.audio,
            lang: x.lang,
          },
        })
      } catch {
        /* 记错题失败不该影响交卷 */
      }
    })
    setDone(true)
    flushNow()
  }

  // ---------------- 没题可考 ----------------
  if (questions.length === 0) {
    return (
      <View className='exam exam--center'>
        <Text className='exam__emoji'>📝</Text>
        <Text className='exam__big'>还不能考</Text>
        <Text className='exam__hint'>
          测验只考**学过的**内容 —— 先去练几组,学过的内容够了再来考。
          考没教过的东西不是测验,是打击。
        </Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>先去学习</Text>
        </View>
      </View>
    )
  }

  // ---------------- 交卷 ----------------
  if (done) {
    const correct = questions.reduce((n, x, i) => n + (answers[i] === x.answer ? 1 : 0), 0)
    const band = pickScoreBand(correct, questions.length)
    const score = Math.round((correct / questions.length) * 100)
    // listExams 里第一条就是刚存的这次,所以「上一次」要取第二条
    const prev = listExams(childId).filter((r) => r.period === period)[1]
    const cmp = compareWithLast(score, prev ? prev.score : lastExamScore(childId, period))

    if (reviewing) {
      return (
        <View className='exam'>
          <Text className='exam__h'>逐题回顾</Text>
          {questions.map((x, i) => {
            const mine = answers[i]
            const right = mine === x.answer
            return (
              <View key={x.cardId} className={right ? 'rev rev--ok' : 'rev'}>
                <View className='rev__hd'>
                  <Text className='rev__n'>{i + 1}</Text>
                  {x.emoji ? <Text className='rev__e'>{x.emoji}</Text> : null}
                  <Text className='rev__q'>{x.prompt}</Text>
                  <Text
                    className='rev__spk'
                    onClick={() => play(x.audio, x.lang)}
                  >
                    🔊
                  </Text>
                </View>
                <Text className='rev__a'>
                  正确:{x.answer}
                  {right ? ' ✅' : ` · 他选了:${mine || '(没选)'}`}
                </Text>
              </View>
            )
          })}
          <View className='btn btn--primary btn--wide' onClick={() => Taro.navigateBack()}>
            <Text className='btn__t'>完成</Text>
          </View>
        </View>
      )
    }

    return (
      <View className='exam exam--center'>
        <Text className='exam__emoji'>{band.stars >= 4 ? '🏆' : band.stars >= 3 ? '🌟' : '💪'}</Text>
        <Text className='exam__stars'>
          {'⭐'.repeat(band.stars)}
          <Text className='exam__stars--off'>{'⭐'.repeat(5 - band.stars)}</Text>
        </Text>
        <Text className='exam__big'>{band.title}</Text>
        <Text className='exam__score'>
          {correct}/{questions.length} · {score} 分
        </Text>
        <Text className='exam__cheer'>{band.cheer}</Text>
        {/* 和自己的上一次比 —— 测验真正的价值在这里,不在分数本身 */}
        <Text className='exam__cmp'>{cmp}</Text>
        <View className='btn btn--gray btn--wide' onClick={() => setReviewing(true)}>
          <Text className='btn__t'>看看每道题</Text>
        </View>
        <View className='btn btn--primary btn--wide' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>完成</Text>
        </View>
        <Text className='exam__note'>做错的题已经收进错题本,重做时和考试时是同一种形式。</Text>
      </View>
    )
  }

  // ---------------- 作答 ----------------
  return (
    <View className='exam'>
      <View className='exam__bar'>
        <Text className='exam__exit' onClick={() => Taro.navigateBack()}>‹ 退出</Text>
        <Text className='exam__count'>
          {def.label} {idx + 1}/{questions.length}
        </Text>
      </View>
      <View className='exam__prog'>
        <View
          className='exam__progfill'
          style={{ width: `${Math.round((idx / questions.length) * 100)}%` }}
        />
      </View>

      {q?.emoji ? <Text className='exam__pic'>{q.emoji}</Text> : null}
      <Text className='exam__q'>{q?.prompt}</Text>
      {q?.audio ? (
        <View className='audio audio--big' onClick={() => play(q.audio, q.lang)}>
          <Text className='audio__t'>🔊</Text>
        </View>
      ) : null}

      <View className='opts'>
        {(q?.options ?? []).map((opt, oi) => (
          <View key={opt} className='opt'>
            {/*
              考试时每个选项同样可以单独试听 —— 这是在考「音、形、义对不对得上」,
              不是在考「猜」。听不到选项的读音,英语题就退化成了看图连线。
            */}
            {q.lang === 'en' ? (
              <Text className='opt__spk' onClick={() => void playWordAudio(opt)}>
                🔊
              </Text>
            ) : null}
            <Text className='opt__k'>{OPTION_LETTERS[oi] ?? ''}</Text>
            <Text className='opt__t' onClick={() => choose(opt)}>
              {opt}
            </Text>
          </View>
        ))}
      </View>

      {/*
        考试期间**不显示对错**,所以这里给一句说明 ——
        否则孩子点完没有任何反馈,会以为是没点上。
      */}
      <Text className='exam__tip'>做完全部题目才公布成绩,所以现在不告诉你对不对哦</Text>
    </View>
  )
}

/** 首页/家长中心用:三种周期的入口配置 */
export const EXAM_ENTRIES = EXAM_PERIODS

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(ExamPage)
