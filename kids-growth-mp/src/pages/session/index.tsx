import { useEffect, useMemo, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import {
  getCurrentChildId,
  getSessionCards,
  getDeck,
  getDeckCards,
  applyGrade,
  finishSession,
  addStudyTime,
  type DueCard,
} from '../../store/study'
import { playWordAudio, playText } from '../../lib/audio'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { startRecord, stopRecord, playFile } from '../../lib/recorder'
import { scorePronunciation, normalizeForCompare } from '../../core/score'
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
  const [poolBack, setPoolBack] = useState<string[]>([])
  const [poolFront, setPoolFront] = useState<string[]>([])
  const [linePool, setLinePool] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [correct, setCorrect] = useState(0)
  const [combo, setCombo] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [spellInput, setSpellInput] = useState('')
  const [listening, setListening] = useState(false)
  const [stars, setStars] = useState(-1)
  const [speakMsg, setSpeakMsg] = useState('')
  const [recPath, setRecPath] = useState('')
  const [recording, setRecording] = useState(false)
  const [startedAt] = useState(Date.now())
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number } | null>(null)
  const [ready, setReady] = useState(false)

  const itemType = deck?.itemType ?? 'word'
  const isHanzi = itemType === 'hanzi'
  const isWord = itemType === 'word'

  const playPrompt = (text: string) => {
    if (isWord) playWordAudio(text)
    else void playText(text, 'zh_CN')
  }

  // ⚠️ 整体 try/catch:页面加载阶段抛异常会导致整页渲染不出来(只剩导航栏),
  // 这里捕获后照常渲染,并把原因弹给用户,至少能返回上一页。
  useEffect(() => {
    try {
      const cid = getCurrentChildId()
      const list = getSessionCards(cid, deckId, 12)
      const d = getDeck(deckId) ?? null
      const all = getDeckCards(deckId)
      setChildId(cid)
      setDeck(d)
      setPoolBack(all.map((c) => c.back))
      setPoolFront(all.map((c) => c.front))
      const lines: string[] = []
      for (const c of all) {
        const ls = (c.extra as { lines?: string[] } | undefined)?.lines
        if (Array.isArray(ls)) lines.push(...ls)
      }
      setLinePool(lines)
      setCards(list)
      setReady(true)
      if (list[0] && (mode === 'listenChoose' || mode === 'dictation')) {
        const c0 = list[0].card
        if ((d?.itemType ?? 'word') === 'word') playWordAudio(c0.audioText ?? c0.front)
        else void playText(c0.audioText ?? c0.front, 'zh_CN')
      }
    } catch (e) {
      setReady(true)
      Taro.showModal({
        title: '这组题打不开',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = cards[idx]

  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    const answer = isHanzi ? current.card.front : current.card.back
    const src = isHanzi ? poolFront : poolBack
    const distractors = shuffle(src.filter((b) => b !== answer)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolBack, poolFront, isHanzi])

  const blank = useMemo(() => {
    if (!current || mode !== 'fillBlank') return null
    const lines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
    if (lines.length === 0) return null
    const hideIdx = Math.floor(Math.random() * lines.length)
    const answer = lines[hideIdx]
    const own = new Set(lines)
    const distractors = shuffle(linePool.filter((l) => !own.has(l) && l.length === answer.length)).slice(0, 3)
    return { lines, hideIdx, answer, options: shuffle([answer, ...distractors]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, linePool, idx])

  const playCurrent = () => {
    if (current) playPrompt(current.card.audioText ?? current.card.front)
  }

  const finish = (finalCorrect: number, total: number) => {
    const durationSec = Math.round((Date.now() - startedAt) / 1000)
    addStudyTime(durationSec)
    const res = finishSession({ childId, deckId, mode, total, correct: finalCorrect, durationSec })
    setSummary({ correct: finalCorrect, total, points: res.pointsAwarded })
    setPhase('done')
  }

  const resetPerCard = (nextIdx: number) => {
    setPhase('prompt')
    setPicked(null)
    setSpellInput('')
    setListening(false)
    setStars(-1)
    setSpeakMsg('')
    setRecPath('')
    setRecording(false)
    if (mode === 'listenChoose' || mode === 'dictation') {
      const c = cards[nextIdx].card
      playPrompt(c.audioText ?? c.front)
    }
  }

  const advance = (wasCorrect: boolean) => {
    if (!current) return
    applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
    if (wasCorrect) {
      setCombo((c) => c + 1)
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    } else {
      setCombo(0)
    }
    const nextCorrect = correct + (wasCorrect ? 1 : 0)
    setCorrect(nextCorrect)
    const total = cards.length
    if (idx + 1 >= total) finish(nextCorrect, total)
    else {
      const nextIdx = idx + 1
      setIdx(nextIdx)
      resetPerCard(nextIdx)
    }
  }

  const toggleSpeak = () => {
    if (!current) return
    if (!listening) {
      setListening(true)
      setSpeakMsg('聆听中…读完点「读完了」')
      setStars(-1)
      startRecognize(isWord ? 'en_US' : 'zh_CN', {
        onResult: (text) => {
          setListening(false)
          const r = scorePronunciation(text, current.card.front)
          setStars(r.stars)
          setSpeakMsg(r.message + (text ? `(听到:${text})` : ''))
          if (r.stars >= 2) setTimeout(() => advance(true), 1400)
        },
        onError: (msg) => {
          setListening(false)
          setSpeakMsg(msg + '(可点「我读对了」或跳过)')
        },
      })
    } else {
      stopRecognize()
      setSpeakMsg('识别中…')
    }
  }

  const toggleRecord = () => {
    if (!recording) {
      setRecording(true)
      startRecord(
        (path) => {
          setRecPath(path)
          setRecording(false)
        },
        () => setRecording(false),
      )
    } else {
      stopRecord()
    }
  }

  if (!ready) return <View className='sess' />

  if (cards.length === 0 && phase !== 'done') {
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>🎉</Text>
        <Text className='sess__big'>这个卡组今天学完啦!</Text>
        <Text className='sess__hint'>明天到期的卡片会自动出现</Text>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}><Text className='btn__t'>返回</Text></View>
      </View>
    )
  }

  if (phase === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    const sessStars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct > 0 ? 1 : 0
    return (
      <View className='sess sess--center'>
        <Text className='sess__emoji'>{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</Text>
        <Text className='sess__big'>练完啦!</Text>
        <Text className='stars'>{'⭐'.repeat(sessStars)}{'☆'.repeat(3 - sessStars)}</Text>
        <View className='result'>
          <View className='result__cell'><Text className='result__num'>{summary.correct}/{summary.total}</Text><Text className='result__lab'>答对</Text></View>
          <View className='result__cell'><Text className='result__num result__num--sun'>+{summary.points}</Text><Text className='result__lab'>积分</Text></View>
        </View>
        <View className='btn btn--primary' onClick={() => Taro.navigateBack()}><Text className='btn__t'>完成</Text></View>
      </View>
    )
  }

  if (!current) return <View className='sess' />

  const spellCorrect = normalizeForCompare(spellInput) === normalizeForCompare(current.card.front)
  const poemLines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
  const poemMeta = current.card.extra as { author?: string; dynasty?: string } | undefined

  return (
    <View className='sess'>
      <View className='sess__bar'>
        <Text className='sess__exit' onClick={() => Taro.navigateBack()}>退出</Text>
        <View className='sess__track'><View className='sess__fill' style={{ width: `${(idx / cards.length) * 100}%` }} /></View>
        <Text className='sess__count'>{idx + 1}/{cards.length}</Text>
      </View>
      {combo >= 2 ? <Text className='combo'>🔥 连对 {combo}</Text> : null}

      {/* 认词 / 认字 */}
      {mode === 'recognize' && (
        <View className='card'>
          <Text className={isHanzi ? 'card__front card__front--hz' : 'card__front'}>{current.card.front}</Text>
          {!isHanzi && current.card.phonetic ? <Text className='card__ph'>/{current.card.phonetic}/</Text> : null}
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              {isHanzi ? (
                <View>
                  <Text className='card__back card__back--hz'>{current.card.phonetic}</Text>
                  {(current.card.extra as { word?: string } | undefined)?.word ? <Text className='card__extra'>组词:{(current.card.extra as { word?: string }).word}</Text> : null}
                </View>
              ) : (
                <Text className='card__back'>{current.card.back}</Text>
              )}
              <View className='row'>
                <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>{isHanzi ? '不认识' : '没记住'}</Text></View>
                <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>{isHanzi ? '认识' : '记住了'}</Text></View>
              </View>
            </View>
          ) : (
            <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>{isHanzi ? '看读音' : '看意思'}</Text></View>
          )}
        </View>
      )}

      {/* 听音选义 / 听音选字 */}
      {mode === 'listenChoose' && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{isHanzi ? '听读音,选出正确的字' : '听发音,选出正确的意思'}</Text>
          <View className={isHanzi ? 'opts opts--grid' : 'opts'}>
            {options.map((opt) => {
              const answer = isHanzi ? current.card.front : current.card.back
              const show = picked !== null
              const isRight = opt === answer
              const cls = show ? (isRight ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={`${cls}${isHanzi ? ' opt--hz' : ''}`} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === answer), 800) }}>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 拼写 */}
      {mode === 'spell' && (
        <View className='card'>
          <Text className='card__back'>{current.card.back}</Text>
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{current.card.front}</Text>
              {!spellCorrect ? <Text className='card__extra'>你写的:{spellInput || '(空)'}</Text> : null}
              <View className='btn btn--primary' onClick={() => advance(spellCorrect)}><Text className='btn__t'>下一个</Text></View>
            </View>
          ) : (
            <View className='card__form'>
              <Input className='inp' value={spellInput} onInput={(e) => setSpellInput(e.detail.value)} placeholder='输入英文' />
              <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>检查</Text></View>
            </View>
          )}
        </View>
      )}

      {/* 听写 */}
      {mode === 'dictation' && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>听发音,写出这个单词</Text>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <Text className={spellCorrect ? 'card__front card__front--ok' : 'card__front card__front--no'}>{current.card.front}</Text>
              <Text className='card__back'>{current.card.back}</Text>
              {!spellCorrect ? <Text className='card__extra'>你写的:{spellInput || '(空)'}</Text> : null}
              <View className='btn btn--primary' onClick={() => advance(spellCorrect)}><Text className='btn__t'>下一个</Text></View>
            </View>
          ) : (
            <View className='card__form'>
              <Input className='inp' value={spellInput} onInput={(e) => setSpellInput(e.detail.value)} placeholder='听写英文' />
              <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>检查</Text></View>
            </View>
          )}
        </View>
      )}

      {/* 跟读:范读 + 录音回放 + 打分 */}
      {mode === 'speak' && (
        <View className='card'>
          <Text className='card__front'>{current.card.front}</Text>
          {current.card.phonetic ? <Text className='card__ph'>/{current.card.phonetic}/</Text> : null}
          <Text className='card__back'>{current.card.back}</Text>
          <View className='row'>
            <View className='chip' onClick={playCurrent}><Text className='chip__t'>🔊 范读</Text></View>
            <View className='chip' onClick={toggleRecord}><Text className='chip__t'>{recording ? '⏹ 停止' : '🔴 录我读的'}</Text></View>
            {recPath ? <View className='chip' onClick={() => playFile(recPath)}><Text className='chip__t'>▶️ 回放</Text></View> : null}
          </View>
          <View className={listening ? 'mic mic--on' : 'mic'} onClick={toggleSpeak}><Text className='mic__t'>{listening ? '🎙 读完了' : '🎤 跟读打分'}</Text></View>
          {stars >= 0 ? <Text className='stars'>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</Text> : null}
          {speakMsg ? <Text className='card__extra'>{speakMsg}</Text> : null}
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>跳过</Text></View>
            <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>我读对了</Text></View>
          </View>
        </View>
      )}

      {/* 古诗:朗读背诵 */}
      {mode === 'recite' && (
        <View className='card'>
          <Text className='poem__title'>{current.card.front}</Text>
          <Text className='poem__meta'>{poemMeta?.dynasty}·{poemMeta?.author}</Text>
          <View className='poem__body'>
            {poemLines.map((l, i) => <Text key={i} className='poem__line'>{l}</Text>)}
          </View>
          <View className='chip' onClick={() => void playText(poemLines.join('，'), 'zh_CN')}><Text className='chip__t'>🔊 朗读一遍</Text></View>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>还不熟</Text></View>
            <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>会背了</Text></View>
          </View>
        </View>
      )}

      {/* 古诗:补全诗句 */}
      {mode === 'fillBlank' && blank && (
        <View className='card'>
          <Text className='poem__title'>{current.card.front}</Text>
          <View className='poem__body'>
            {blank.lines.map((l, i) => (
              <Text key={i} className={i === blank.hideIdx ? 'poem__line poem__line--blank' : 'poem__line'}>
                {i === blank.hideIdx ? (picked ? blank.answer : '　'.repeat(l.length)) : l}
              </Text>
            ))}
          </View>
          <Text className='card__tip'>选出缺少的那一句</Text>
          <View className='opts'>
            {blank.options.map((opt) => {
              const show = picked !== null
              const isRight = opt === blank.answer
              const cls = show ? (isRight ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View key={opt} className={cls} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === blank.answer), 1000) }}>
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 错题本:看题回想 → 翻答案自评 */}
      {mode === 'review' && (
        <View className='card'>
          {(current.card.extra as { subject?: string } | undefined)?.subject ? (
            <Text className='tag'>{(current.card.extra as { subject?: string }).subject}</Text>
          ) : null}
          <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          {phase === 'reveal' ? (
            <View className='card__reveal'>
              <View className='abox'><Text className='abox__lab'>答案</Text><Text className='abox__t'>{current.card.back}</Text></View>
              <View className='row'>
                <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>还没掌握</Text></View>
                <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>已掌握</Text></View>
              </View>
            </View>
          ) : (
            <View className='btn btn--primary' onClick={() => setPhase('reveal')}><Text className='btn__t'>看答案</Text></View>
          )}
        </View>
      )}
    </View>
  )
}
