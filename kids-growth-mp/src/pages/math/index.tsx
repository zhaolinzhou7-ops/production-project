import { useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useUnload } from '@tarojs/taro'
import { MATH_KINDS, generateDrill, type MathKind, type MathProblem } from '../../core/mathDrill'
import { getCurrentChildId, finishDrill, addStudyTime } from '../../store/study'
import './index.scss'

type Screen = 'config' | 'run' | 'done'
const COUNTS = [10, 20, 30]

export default function MathPage() {
  const [screen, setScreen] = useState<Screen>('config')
  const [kind, setKind] = useState<MathKind>('add')
  const [count, setCount] = useState(20)
  const [problems, setProblems] = useState<MathProblem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<'none' | 'ok' | 'no'>('none')
  const [startedAt, setStartedAt] = useState(0)
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number; sec: number } | null>(null)

  useUnload(() => {})

  const start = () => {
    setProblems(generateDrill(kind, count, 'primary'))
    setIdx(0)
    setCorrect(0)
    setInput('')
    setFeedback('none')
    setStartedAt(Date.now())
    setScreen('run')
  }

  const submit = () => {
    if (feedback !== 'none') return
    const p = problems[idx]
    const isRight = input.trim() !== '' && Number(input.trim()) === p.answer
    const nextCorrect = correct + (isRight ? 1 : 0)
    setCorrect(nextCorrect)
    setFeedback(isRight ? 'ok' : 'no')
    if (isRight) {
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    }
    setTimeout(
      () => {
        if (idx + 1 >= problems.length) {
          const sec = Math.round((Date.now() - startedAt) / 1000)
          addStudyTime(sec)
          const res = finishDrill({ childId: getCurrentChildId(), kind, total: problems.length, correct: nextCorrect, durationSec: sec })
          setSummary({ correct: nextCorrect, total: problems.length, points: res.pointsAwarded, sec })
          setScreen('done')
        } else {
          setIdx(idx + 1)
          setInput('')
          setFeedback('none')
        }
      },
      isRight ? 420 : 1000,
    )
  }

  if (screen === 'config') {
    return (
      <View className='math'>
        <Text className='math__h'>选择题型</Text>
        <View className='kinds'>
          {MATH_KINDS.map((k) => (
            <View key={k.kind} className={kind === k.kind ? 'kind kind--on' : 'kind'} onClick={() => setKind(k.kind)}>
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
      <View className='q'>
        <Text className='q__t'>{p?.text}</Text>
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
