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
  autoAddErrorCard,
  type DueCard,
} from '../../store/study'
import { noteSessionEnd, claimNewAchievements } from '../../store/progress'
import { getAchievement } from '../../core/achievements'
import { levelOf } from '../../core/levels'
import { playWordAudio, playText, playEnglishSlow, stopAudio, prefetchAudio } from '../../lib/audio'
import { startRecognize, stopRecognize } from '../../lib/speech'
import { startRecord, stopRecord, playFile } from '../../lib/recorder'
import { scorePronunciation, normalizeForCompare } from '../../core/score'
import CorrectBurst from '../../components/CorrectBurst'
import { awardSticker, feedPet, bumpChallenge } from '../../store/fun'
import type { StickerDef } from '../../core/stickers'
import type { LearnCard, LearnDeck, PracticeMode } from '../../types'
import { withGuard } from '../../components/Guard'
import { flushNow } from '../../store/db'
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

function Session() {
  const router = useRouter()
  const deckId = router.params.deckId || ''
  const mode = (router.params.mode || 'recognize') as PracticeMode

  const [childId, setChildId] = useState('')
  const [deck, setDeck] = useState<LearnDeck | null>(null)
  const [cards, setCards] = useState<DueCard[]>([])
  const [allCards, setAllCards] = useState<LearnCard[]>([])
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
  /** 答对特效:每答对一次 +1,用来重新触发动画 */
  const [burst, setBurst] = useState(0)
  const [gotSticker, setGotSticker] = useState<StickerDef | null>(null)
  const [evolved, setEvolved] = useState(false)
  const [challengeDone, setChallengeDone] = useState(false)
  const [newBadges, setNewBadges] = useState<string[]>([])
  const [leveledTo, setLeveledTo] = useState('')
  /** 本组最高连对,用于成就统计 */
  const [bestCombo, setBestCombo] = useState(0)
  /** 磨耳朵:自动连播到第几张 */
  const [earIdx, setEarIdx] = useState(0)
  const [earOn, setEarOn] = useState(false)
  const [ready, setReady] = useState(false)

  const itemType = deck?.itemType ?? 'word'
  const isHanzi = itemType === 'hanzi'
  const isWord = itemType === 'word'
  const isPic = itemType === 'pic'
  const isFact = itemType === 'fact'
  /** 看图题里的「英语档」:读英文、选英文 */
  const picEn = mode === 'picChooseEn' || mode === 'listenPicEn'

  const playPrompt = (text: string) => {
    if (isWord) playWordAudio(text)
    else void playText(text, 'zh_CN')
  }

  /** 看图卡:按当前模式决定读中文还是读英文 */
  const playPic = (card: LearnCard) => {
    const en = (card.extra as { en?: string } | undefined)?.en
    if (picEn && en) playWordAudio(en)
    else void playText(card.front, 'zh_CN')
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
      setAllCards(all)
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
      const autoPlay = mode === 'listenChoose' || mode === 'dictation' || mode === 'listenPic' || mode === 'listenPicEn'
      if (list[0] && autoPlay) {
        const c0 = list[0].card
        const t = (d?.itemType ?? 'word') as string
        if (mode === 'listenPicEn') {
          const en = (c0.extra as { en?: string } | undefined)?.en
          playWordAudio(en ?? c0.front)
        } else if (mode === 'listenPic') {
          void playText(c0.front, 'zh_CN')
        } else if (t === 'word') {
          playWordAudio(c0.audioText ?? c0.front)
        } else {
          void playText(c0.audioText ?? c0.front, 'zh_CN')
        }
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

  /**
   * 磨耳朵的自动连播:英文 → 停 → 中文 → 停 → 下一张,循环。
   * 用定时器串起来而不是等 onEnded —— 音源偶尔不出声时,靠 onEnded 会卡死不动。
   */
  useEffect(() => {
    if (!earOn || mode !== 'earTrain' || cards.length === 0) return
    let alive = true
    const card = cards[earIdx % cards.length]?.card
    if (!card) return
    const en = (card.extra as { en?: string } | undefined)?.en
    if (en) playWordAudio(en)
    const t1 = setTimeout(() => {
      if (alive) void playText(card.front, 'zh_CN')
    }, 2400)
    const t2 = setTimeout(() => {
      if (alive) setEarIdx((i) => (i + 1) % cards.length)
    }, 5200)
    return () => {
      alive = false
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [earOn, earIdx, cards, mode])

  /** 离开页面就把声音停掉,免得返回首页还在响 */
  useEffect(() => {
    return () => stopAudio()
  }, [])

  /**
   * 预取下一题的发音。
   * 「点了要等一下才响」主要是网络耗时,提前拉一遍,轮到它时基本秒响。
   */
  useEffect(() => {
    const nxt = cards[idx + 1]
    if (!nxt) return
    const en = (nxt.card.extra as { en?: string } | undefined)?.en
    if (isWord) prefetchAudio(nxt.card.audioText ?? nxt.card.front, 'en')
    else if (isPic) prefetchAudio(picEn && en ? en : nxt.card.front, picEn ? 'en' : 'zh')
    else prefetchAudio(nxt.card.audioText ?? nxt.card.front, 'zh')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cards])

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

  /** 看图题「选文字」:选项是中文名或英文名 */
  const picTextOptions = useMemo(() => {
    if (!current || (mode !== 'picChoose' && mode !== 'picChooseEn')) return []
    const pick = (c: LearnCard) => (mode === 'picChooseEn' ? c.back : c.front)
    const answer = pick(current.card)
    const distractors = shuffle(allCards.filter((c) => pick(c) !== answer).map(pick)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /** 看图题「选图片」:选项是 emoji */
  const picEmojiOptions = useMemo(() => {
    if (!current || (mode !== 'listenPic' && mode !== 'listenPicEn')) return []
    const emojiOf = (c: LearnCard) => (c.extra as { emoji?: string } | undefined)?.emoji ?? '❓'
    const answer = emojiOf(current.card)
    const distractors = shuffle(allCards.filter((c) => emojiOf(c) !== answer).map(emojiOf)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /** 看拼音选字:选项是汉字,题面是拼音 */
  const pinyinOptions = useMemo(() => {
    if (!current || mode !== 'pinyin') return []
    const answer = current.card.front
    const distractors = shuffle(allCards.filter((c) => c.front !== answer).map((c) => c.front)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  /** 常识问答「选一选」:选项是其它题的答案 */
  const quizOptions = useMemo(() => {
    if (!current || mode !== 'quiz') return []
    const answer = current.card.back
    const distractors = shuffle(allCards.filter((c) => c.back !== answer).map((c) => c.back)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, allCards])

  const playCurrent = () => {
    if (!current) return
    if (isPic) playPic(current.card)
    else playPrompt(current.card.audioText ?? current.card.front)
  }

  /**
   * 逐字读一句(古诗用)。
   * 中文整句没有可用音源,只有单字有 —— 所以这是个**明确标注**的功能,
   * 而不是伪装成连贯朗读。孩子知道它是逐字的,就不会觉得「读得很怪」。
   */
  const readLineByChar = (line: string) => {
    const chars = line.split('').filter((c) => /[\u4e00-\u9fa5]/.test(c))
    chars.forEach((ch, i) => {
      setTimeout(() => void playText(ch, 'zh_CN'), i * 1100)
    })
  }

  /** 慢速范读:英语听不清时最有效的一招,比反复原速重放强 */
  const playSlow = () => {
    if (!current) return
    if (isWord) playEnglishSlow(current.card.audioText ?? current.card.front)
    else void playText(current.card.audioText ?? current.card.front, 'zh_CN')
  }

  /** A/B 对比:先放范读,再放孩子自己的录音,差别一听就出来 */
  const compareAB = () => {
    if (!current) return
    playCurrent()
    setTimeout(() => {
      if (recPath) playFile(recPath)
    }, 2400)
  }

  const finish = (finalCorrect: number, total: number) => {
    const durationSec = Math.round((Date.now() - startedAt) / 1000)
    addStudyTime(durationSec)
    const res = finishSession({ childId, deckId, mode, total, correct: finalCorrect, durationSec })
    // 结算趣味化:掉贴纸、喂宠物、记每日挑战。任何一步出问题都不能挡住结算页。
    try {
      setGotSticker(awardSticker(finalCorrect, total) ?? null)
      setEvolved(feedPet(finalCorrect))
      const chal = bumpChallenge()
      setChallengeDone(chal)
      // 升级判定要用「加分前后」的成长值对比
      const before = levelOf(res.newXp - res.pointsAwarded)
      const after = levelOf(res.newXp)
      if (after.cur.level > before.cur.level) setLeveledTo(`${after.cur.emoji} ${after.cur.name}`)
      noteSessionEnd({ correct: finalCorrect, total, bestCombo, challengeJustDone: chal })
      setNewBadges(claimNewAchievements(childId))
    } catch {
      /* 忽略 */
    }
    setSummary({ correct: finalCorrect, total, points: res.pointsAwarded })
    setPhase('done')
    // 一组练完是关键节点,把攒着的写入立刻落盘,别等合并窗口
    flushNow()
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
    } else if (mode === 'listenPic' || mode === 'listenPicEn') {
      playPic(cards[nextIdx].card)
    }
  }

  const advance = (wasCorrect: boolean) => {
    if (!current) return
    applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
    if (wasCorrect) {
      setCombo((c) => {
        const n = c + 1
        setBestCombo((b) => Math.max(b, n))
        return n
      })
      setBurst((b) => b + 1)
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch {
        /* 忽略 */
      }
    } else {
      setCombo(0)
      // 答错的题自动收进错题本,交给 SRS 安排重做
      try {
        autoAddErrorCard(childId, {
          front: current.card.front,
          back: current.card.back,
          subject: deck?.subject,
        })
      } catch {
        /* 忽略 */
      }
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
        {gotSticker ? (
          <View className='reward'>
            <Text className='reward__e'>{gotSticker.emoji}</Text>
            <Text className='reward__t'>获得新贴纸「{gotSticker.name}」!</Text>
          </View>
        ) : null}
        {leveledTo ? <Text className='reward__line'>🎉 升级啦!现在是 {leveledTo}</Text> : null}
        {newBadges.length > 0 ? (
          <View className='badges'>
            {newBadges.map((code) => {
              const a = getAchievement(code)
              if (!a) return null
              return (
                <View key={code} className='badge'>
                  <Text className='badge__e'>{a.emoji}</Text>
                  <Text className='badge__n'>{a.name}</Text>
                </View>
              )
            })}
            <Text className='reward__line'>解锁新徽章!</Text>
          </View>
        ) : null}
        {evolved ? <Text className='reward__line'>🎊 你的小宠物进化啦!</Text> : null}
        {challengeDone ? <Text className='reward__line'>🏆 今日挑战完成!</Text> : null}
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
      {burst > 0 ? <CorrectBurst seed={burst} combo={combo} /> : null}

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
                <View key={opt} className={`${cls}${isHanzi ? ' opt--hz' : ''}`} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === answer), 550) }}>
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
          <View className='row row--wrap'>
            <View className='chip' onClick={playCurrent}><Text className='chip__t'>🔊 范读</Text></View>
            <View className='chip' onClick={playSlow}><Text className='chip__t'>🐢 慢速</Text></View>
            <View className='chip' onClick={toggleRecord}><Text className='chip__t'>{recording ? '⏹ 停止' : '🔴 录我读的'}</Text></View>
            {recPath ? <View className='chip' onClick={() => playFile(recPath)}><Text className='chip__t'>▶️ 回放</Text></View> : null}
            {recPath ? <View className='chip chip--ab' onClick={compareAB}><Text className='chip__t'>🆚 对比</Text></View> : null}
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
          {/*
            逐字点读:每个字都是可点的小方块,点谁读谁。
            为什么不做整句自动连读 —— 目前没有可用的中文整句音源,
            按词拆开自动连播实测是「一个字一个字往外蹦」,反而更糟。
            让孩子自己点,既有声音又不难听,还顺便认了字。
          */}
          <View className='poem__body'>
            {(phase === 'reveal' ? [] : poemLines).map((l, i) => (
              <View key={i} className='poem__row'>
                {l.split('').map((ch, j) => (
                  <Text
                    key={`${i}-${j}`}
                    className='poem__ch'
                    onClick={() => void playText(ch, 'zh_CN')}
                  >
                    {ch}
                  </Text>
                ))}
                {/* 单句朗读;整句读不出来时管线会自动退回逐字 */}
                <Text className='poem__lineplay' onClick={() => void playText(l, 'zh_CN')}>
                  🔊
                </Text>
              </View>
            ))}
            {phase === 'reveal' ? (
              <Text className='poem__hidden'>先自己背一遍,想不起来再点「看诗句」</Text>
            ) : null}
          </View>
          <View className='row row--wrap'>
            <View
              className='chip chip--main'
              onClick={() => void playText(poemLines.join('，'), 'zh_CN')}
            >
              <Text className='chip__t'>🔊 朗读整首</Text>
            </View>
            <View className='chip' onClick={() => setPhase(phase === 'reveal' ? 'prompt' : 'reveal')}>
              <Text className='chip__t'>{phase === 'reveal' ? '🙈 藏起来背' : '👀 看诗句'}</Text>
            </View>
          </View>
          <Text className='poem__tip'>整首读不出来时,点单个字也能听 —— 每个字都是可点的</Text>
          <View className='row'>
            <View className='btn btn--gray' onClick={() => advance(false)}><Text className='btn__t'>还不熟</Text></View>
            <View className='btn btn--mint' onClick={() => advance(true)}><Text className='btn__t'>会背了</Text></View>
          </View>
        </View>
      )}

      {/* 看拼音选字 */}
      {mode === 'pinyin' && (
        <View className='card'>
          <Text className='card__front card__front--py'>{current.card.phonetic ?? current.card.back}</Text>
          <Text className='card__tip'>这个读音是哪个字?</Text>
          <View className='opts opts--grid'>
            {pinyinOptions.map((opt) => {
              const answer = current.card.front
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={`${cls} opt--hz`}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    if (opt === answer) void playText(answer, 'zh_CN')
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 磨耳朵:英中自动连播,孩子不用操作 */}
      {mode === 'earTrain' && (
        <View className='card'>
          <Text className='pic__emoji'>
            {(cards[earIdx]?.card.extra as { emoji?: string } | undefined)?.emoji ?? '🎵'}
          </Text>
          <Text className='ear__en'>
            {(cards[earIdx]?.card.extra as { en?: string } | undefined)?.en ?? ''}
          </Text>
          <Text className='ear__zh'>{cards[earIdx]?.card.front ?? ''}</Text>
          <Text className='card__tip'>
            {earOn ? '正在自动连播,躺着听就行' : '点下面开始,英语和中文轮流播'}
          </Text>
          <View className='btn btn--primary' onClick={() => setEarOn(!earOn)}>
            <Text className='btn__t'>{earOn ? '⏸ 暂停' : '▶️ 开始连播'}</Text>
          </View>
          <View className='btn btn--gray' onClick={() => finish(cards.length, cards.length)}>
            <Text className='btn__t'>听完了</Text>
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
                <View key={opt} className={cls} onClick={() => { if (picked) return; setPicked(opt); setTimeout(() => advance(opt === blank.answer), 650) }}>
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

      {/* 看图选一选 / 英语·看图选词:大图在上,文字选项在下 */}
      {(mode === 'picChoose' || mode === 'picChooseEn') && (
        <View className='card'>
          <Text className='pic__emoji'>{(current.card.extra as { emoji?: string } | undefined)?.emoji ?? '❓'}</Text>
          <View className='audio' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{picEn ? '这是什么?选英语单词' : '这是什么?选出名字'}</Text>
          <View className='opts'>
            {picTextOptions.map((opt) => {
              const answer = picEn ? current.card.back : current.card.front
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    if (opt === answer) playPic(current.card)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='opt__t'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 听音选图 / 英语·听音选图:听声音,在四张大图里点出来 */}
      {(mode === 'listenPic' || mode === 'listenPicEn') && (
        <View className='card'>
          <View className='audio audio--big' onClick={playCurrent}><Text className='audio__t'>🔊</Text></View>
          <Text className='card__tip'>{picEn ? '听英语,点出正确的图' : '听一听,点出正确的图'}</Text>
          <View className='picgrid'>
            {picEmojiOptions.map((opt) => {
              const answer = (current.card.extra as { emoji?: string } | undefined)?.emoji ?? '❓'
              const show = picked !== null
              const cls = show
                ? opt === answer
                  ? 'picopt picopt--right'
                  : opt === picked
                    ? 'picopt picopt--wrong'
                    : 'picopt'
                : 'picopt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === answer), 550)
                  }}
                >
                  <Text className='picopt__e'>{opt}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}

      {/* 常识问答·选一选 */}
      {mode === 'quiz' && (
        <View className='card'>
          <View className='qbox'><Text className='qbox__t'>{current.card.front}</Text></View>
          <View className='opts'>
            {quizOptions.map((opt) => {
              const answer = current.card.back
              const show = picked !== null
              const cls = show ? (opt === answer ? 'opt opt--right' : opt === picked ? 'opt opt--wrong' : 'opt') : 'opt'
              return (
                <View
                  key={opt}
                  className={cls}
                  onClick={() => {
                    if (picked) return
                    setPicked(opt)
                    setTimeout(() => advance(opt === answer), 550)
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

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Session)
