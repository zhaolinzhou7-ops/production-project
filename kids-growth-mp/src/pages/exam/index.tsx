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
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
import './index.scss'

/**
 * 阶段测验 —— **看图说出来,家长判对错**。
 *
 * v64 把这一页从四选一整个改掉了。理由见 core/exam 顶部:
 * 四选一有 25% 蒙对率,而且它测的是**再认**(认得出 goat 长什么样),
 * 不是**产出**(见到山羊能说出 goat)—— 后者才是我们想知道的。
 *
 * 这一页因此和练习页彻底不一样:
 * - 屏幕上**没有选项**,只有一张图和一句问话
 * - 他开口说,旁边的家长点「说对了 / 还不会」
 * - 出题时**不播答案**、**不显示答案**(家长要核对时可以单独展开)
 * - 交卷后一次性给分、逐题回顾、错的自动进错题本(还是开口说的形式)
 *
 * 家长必须在场 —— 这不是缺点,是这件事的前提:
 * 家长坐着听一遍孩子说,比看十份正确率报表更知道他到了哪一步。
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
  /** 每道题家长判了什么(按题序):'y' 说对了 / 'n' 还不会 / 空串没答 */
  const [answers, setAnswers] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  /*
    答案给不给家长看。

    这是这一页唯一一处两难:家长要判对错,就得知道标准答案 ——
    可 goat、hedgehog 这些词家长未必都记得。
    但答案摆在屏幕上,孩子一眼就看见了,这道题也就白出了。

    折中:默认藏起来,家长要核对时点一下展开,而且**只出字不出声** ——
    孩子不识字,看见了也读不出来;念出来他就直接学会了。
    每翻一题自动收回去,免得一直开着。
  */
  const [showAnswer, setShowAnswer] = useState(false)

  const q = questions[idx]

  const play = (text?: string, lang: 'zh' | 'en' = 'zh') => {
    if (!text) return
    if (lang === 'en') void playWordAudio(text)
    else void playText(text, 'zh_CN')
  }

  /** 家长判这一题:right=说对了 */
  const judge = (right: boolean) => {
    if (!q) return
    const next = [...answers]
    next[idx] = right ? 'y' : 'n'
    setAnswers(next)
    /*
      **不把正确答案念出来。**

      念出来这道题就变成了教学:他刚才没说上来,听一遍就记住了,
      下一题遇到类似的会顺着刚学的往下猜 —— 测出来的是短时记忆。
      要教在交卷之后的「逐题回顾」里教,那时候整份卷子已经定分了。
    */
    stopAudio()
    setShowAnswer(false)
    if (idx + 1 >= questions.length) finish(next)
    else setIdx(idx + 1)
  }

  const finish = (finalAnswers: string[]) => {
    stopAudio()
    const correct = questions.reduce((n, _x, i) => n + (finalAnswers[i] === 'y' ? 1 : 0), 0)
    /*
      没说出来的那几张要**退回重学**,不能只存个分数。
      原先测验只把错的塞进错题本,而那张卡在正常复习里的排期纹丝不动 ——
      可能还排在两周之后。一次测出来的「不会」,总得改变明天练什么。
      (线下抽查一直是这么做的,测验这边纯粹是漏了。)
    */
    const missed = questions.filter((_x, i) => finalAnswers[i] !== 'y').map((x) => x.cardId)
    saveExam(childId, period, questions.length, correct, missed)
    // 错的自动进错题本,重做时形式和考试时一样(选择题)
    questions.forEach((x, i) => {
      if (finalAnswers[i] === 'y') return
      try {
        /*
          题干要能**认出是哪道题**。

          原先直接用 x.prompt,而看图题的 prompt 全都是「What is it?」——
          错题本里列出来是一排一模一样的「What is it?」,家长根本分不清
          是哪个词错了。带上那张图之后,一眼就认得出来。
        */
        autoAddErrorCard(childId, {
          front: x.emoji ? `${x.emoji} ${x.prompt}` : x.show ? `${x.show} ${x.prompt}` : x.prompt,
          back: x.answer,
          subject: '测验',
          /*
            重做时的形式要和考试时**一模一样**:开口说、家长判。
            这是用户定过的规矩 ——「错了什么类型的题就归入什么错题,不要换类型」。
            以前测验是选择题,错题也进的是选择题;现在测验是产出题,
            错题自然也该是产出题。
          */
          redo: {
            type: 'speak',
            answer: x.answer,
            emoji: x.emoji ?? x.show,
            audio: x.audio,
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
    const correct = questions.reduce((n, _x, i) => n + (answers[i] === 'y' ? 1 : 0), 0)
    const band = pickScoreBand(correct, questions.length)
    const score = Math.round((correct / questions.length) * 100)
    // listExams 里第一条就是刚存的这次,所以「上一次」要取第二条
    const prev = listExams(childId).filter((r) => r.period === period)[1]
    const cmp = compareWithLast(score, prev ? prev.score : lastExamScore(childId, period))

    if (reviewing) {
      return (
        <View className='exam'>
          <Text className='exam__h'>逐题回顾</Text>
          {/*
            回顾是**交卷之后**才来的,这里才该把答案念出来 ——
            考的时候念等于边考边教,考完念才是真的在补。
          */}
          <Text className='exam__tip'>
            这里可以放心点 🔊 听:成绩已经定了,现在念是补给他听的
          </Text>
          {questions.map((x, i) => {
            const right = answers[i] === 'y'
            return (
              <View key={x.cardId} className={right ? 'rev rev--ok' : 'rev'}>
                <View className='rev__hd'>
                  <Text className='rev__n'>{i + 1}</Text>
                  {x.emoji ? <Text className='rev__e'>{x.emoji}</Text> : null}
                  <Text className='rev__q'>{x.show ? `${x.show} · ${x.prompt}` : x.prompt}</Text>
                  <Text className='rev__spk' onClick={() => play(x.audio, x.lang)}>
                    🔊
                  </Text>
                </View>
                <Text className='rev__a'>
                  答案:{x.answer}
                  {right ? ' ✅ 说出来了' : ' · 这次没说上来'}
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

      {/*
        图 / 字摆出来,**底下什么都没有** —— 没有选项就没有蒙的余地。
        也不给 🔊:一放就是把答案念给他听,这道题就白出了。
      */}
      {q?.emoji ? <Text className='exam__pic'>{q.emoji}</Text> : null}
      {q?.show ? <Text className='exam__show'>{q.show}</Text> : null}
      <Text className='exam__q'>{q?.prompt}</Text>

      {/*
        答案只给家长。默认藏着,点一下才出;**只出字不出声** ——
        孩子不识字,看见了也读不出来,念出来他就直接学会了。
        ⚠️ 两个分支必须都是带 onClick 的同一个节点,否则 Taro 会报 _num。
      */}
      <View className='eans' onClick={() => setShowAnswer(!showAnswer)}>
        <Text className={showAnswer ? 'eans__t eans__t--on' : 'eans__t'}>
          {showAnswer ? `答案:${q?.answer}` : '答案(家长核对用)'}
        </Text>
      </View>
      {showAnswer && q?.note ? <Text className='eans__note'>{q.note}</Text> : null}

      {/* 家长判分 */}
      <View className='ejudge'>
        <View className='ejudge__b ejudge__b--no' onClick={() => judge(false)}>
          <Text className='ejudge__t'>还不会</Text>
        </View>
        <View className='ejudge__b ejudge__b--yes' onClick={() => judge(true)}>
          <Text className='ejudge__t'>说对了</Text>
        </View>
      </View>

      <Text className='exam__tip'>做完全部题目才公布成绩,所以现在不告诉你对不对哦</Text>
    </View>
  )
}

/** 首页/家长中心用:三种周期的入口配置 */
export const EXAM_ENTRIES = EXAM_PERIODS

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(ExamPage)
