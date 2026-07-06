import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import {
  getCurrentChildId,
  getSessionCards,
  getDeck,
  getDeckCards,
  applyGrade,
  finishSession,
  type DueCard,
} from '../../store/study'
import { playWordAudio } from '../../lib/audio'
import type { LearnDeck, PracticeMode } from '../../types'
import './index.scss'

type Phase = 'prompt' | 'reveal' | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Session() {
  const router = useRouter()
  const deckId = router.params.deckId || ''
  const mode = (router.params.mode || 'recognize') as PracticeMode

  const [childId, setChildId] = useState('')
  const [deck, setDeck] = useState<LearnDeck | null>(null)
  const [cards, setCards] = useState<DueCard[]>([])
  const [pool, setPool] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [startedAt] = useState(Date.now())
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLoad(() => {
    const cid = getCurrentChildId()
    const list = getSessionCards(cid, deckId, 12)
    setChildId(cid)
    setDeck(getDeck(deckId) ?? null)
    setPool(getDeckCards(deckId).map((c) => c.back))
    setCards(list)
    setReady(true)
    if (list[0] && mode === 'listenChoose') {
      playWordAudio(list[0].card.audioText ?? list[0].card.front)
    }
  })

  const current = cards[idx]
  const isHanzi = deck?.itemType === 'hanzi'

  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    const answer = current.card.back
    const distractors = shuffle(pool.filter((b) => b !== answer)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, pool])

  const playCurrent = () => {
    if (current) playWordAudio(current.card.audioText ?? current.card.front)
  }

  const finish = (finalCorrect: number, total: number) => {
    const res = finishSession({
      childId,
      deckId,
      mode,
      total,
      correct: finalCorrect,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
    })
    setSummary({ correct: finalCorrect, total, points: res.pointsAwarded })
    setPhase('done')
  }

  const advance = (wasCorrect: boolean) => {
    if (!current) return
    applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
    const nextCorrect = correct + (wasCorrect ? 1 : 0)
    setCorrect(nextCorrect)
    const total = cards.length
    if (idx + 1 >= total) {
      finish(nextCorrect, total)
    } else {
      const nextIdx = idx + 1
      setIdx(nextIdx)
      setPhase('prompt')
      setPicked(null)
      if (mode === 'listenChoose') {
        playWordAudio(cards[nextIdx].card.audioText ?? cards[nextIdx].card.front)
      }
    }
  }

  if (!ready) return <View className='sess' />

  if (cards.length === 0 && phase !== 'done') {
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>🎉</Text>
        <Text className='sess__big'>这个卡组今天学完啦!</Text>
        <Text className='sess__hint'>明天到期的卡片会自动出现</Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>返回</Text>
        </View>
      </View>
    )
  }

  if (phase === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</Text>
        <Text className='sess__big'>练完啦!</Text>
        <View className='result'>
          <View className='result__cell'>
            <Text className='result__num'>{summary.correct}/{summary.total}</Text>
            <Text className='result__lab'>答对</Text>
          </View>
          <View className='result__cell'>
            <Text className='result__num result__num--sun'>+{summary.points}</Text>
            <Text className='result__lab'>积分</Text>
          </View>
        </View>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}>
          <Text className='btn__t'>完成</Text>
        </View>
      </View>
    )
  }

  if (!current) return <View className='sess' />

  return (
    <View className='sess'>
      <View className='sess__bar'>
        <Text className='sess__exit' onClick={() => Taro.navigateBack()}>退出</Text>
        <View className='sess__track'>
          <View className='sess__fill' style={{ width: `${(idx / cards.length) * 100}%` }} />
        </View>
        <Text className='sess__count'>{idx + 1}/{cards.length}</Text>
      </View>

      {mode === 'recognize' && (
        <View className='card'>
          <Text className={isHanzi ? 'card__front card__front--hz' : 'card__front'}>
            {current.card.front}
          </Text>
          {!isHanzi && current.card.phonetic ? (
            <Text className='card__ph'>/{current.card.phonetic}/</Text>
          ) : null}
          <View className='audio' onClick={playCurrent}>
            <Text className='audio__t'>🔊</Text>
          </View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              {isHanzi ? (
                <View>
                  <Text className='card__back card__back--hz'>{current.card.phonetic}</Text>
                  {(current.card.extra as { word?: string } | undefined)?.word ? (
                    <Text className='card__extra'>
                      组词:{(current.card.extra as { word?: string }).word}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text className='card__back'>{current.card.back}</Text>
              )}
              <View className='row'>
                <View className='btn btn--gray' onClick={() => advance(false)}>
                  <Text className='btn__t'>{isHanzi ? '不认识' : '没记住'}</Text>
                </View>
                <View className='btn btn--mint' onClick={() => advance(true)}>
                  <Text className='btn__t'>{isHanzi ? '认识' : '记住了'}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className='btn btn--primary' onClick={() => setPhase('reveal')}>
              <Text className='btn__t'>{isHanzi ? '看读音' : '看意思'}</Text>
            </View>
          )}
        </View>
      )}

      {mode === 'listenChoose' && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}>
            <Text className='audio__t'>🔊</Text>
          </View>
          <Text className='card__tip'>听发音,选出正确的意思</Text>
          <View className='opts'>
            {options.map((opt) => {
              const show = picked !== null
              const isRight = opt === current.card.back
              const cls = show
                ? isRight
                  ? 'opt opt--right'
                  : opt === picked
                    ? 'opt opt--wrong'
                    : 'opt'
                : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === current.card.back), 800)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}
