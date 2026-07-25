import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { Volume2, ArrowRight, Mic, Play, Square, Disc } from 'lucide-react'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { getSessionCards, getFreeSessionCards, applyGrade, finishSession, addWrongCard, autoAddErrorCard, type DueCard } from '../db/study'
import { evaluateAchievements } from '../db/achievements'
import { computeLevelInfo, getChildPointStats } from '../lib/points'
import {
  playWordAudio,
  speakChinese,
  speakEnglish,
  prefetchSpeech,
  recognizeOnce,
  isSpeechRecognitionSupported,
  normalizeForCompare,
} from '../lib/audio'
import { sfxCorrect, sfxWrong, sfxCombo, sfxFanfare, sfxSticker } from '../lib/sfx'
import {
  scorePronunciation,
  isRecordingSupported,
  startRecording,
  playRecording,
  type Recorder,
} from '../lib/pronounce'
import { qualifiesForSticker, awardSticker, type StickerDef } from '../lib/stickers'
import { feedPet, type FeedResult } from '../lib/pets'
import { CorrectBurst } from '../components/common/CorrectBurst'
import { LevelUpModal } from '../components/points/LevelUpModal'
import { AchievementUnlockModal } from '../components/points/AchievementUnlockModal'
import type { Achievement, LearnDeck, LevelStep, PracticeMode } from '../types'

const PRAISE = ['棒!', '真快!', '厉害!', '就是这样!', '太对了!', '哇!']
/** 幼儿:答对时用语音读出来的夸奖 */
const VOICE_PRAISE = ['真棒', '太厉害啦', '答对啦', '你真聪明', '好棒哦', '真了不起']
/** 幼儿英语模式:用英语夸,顺便磨耳朵 */
const VOICE_PRAISE_EN = ['Good job', 'Well done', 'Great', 'Awesome', 'Perfect', 'Super']

type Phase = 'prompt' | 'reveal' | 'done'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function StudySessionPage() {
  const navigate = useNavigate()
  const { deckId, mode } = useParams<{ deckId: string; mode: PracticeMode }>()
  const [searchParams] = useSearchParams()
  /** 自由练习:随机抽卡、不改记忆排期、不限组数 */
  const isFree = searchParams.get('free') === '1'
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, tone, stage } = useCurrentChild()
  const isToddler = stage === 'toddler'

  const [cards, setCards] = useState<DueCard[] | null>(null)
  const [deck, setDeck] = useState<LearnDeck | null>(null)
  const [pool, setPool] = useState<string[]>([]) // 干扰项池(释义/拼音)
  const [poolFront, setPoolFront] = useState<string[]>([]) // 干扰项池(正面:汉字)
  const [linePool, setLinePool] = useState<string[]>([]) // 古诗诗句池(补全诗句干扰项)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('prompt')
  const [correctCount, setCorrectCount] = useState(0)
  const [startedAt] = useState(Date.now())
  const [spellInput, setSpellInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [speakMsg, setSpeakMsg] = useState('')
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number; capped: boolean } | null>(null)
  const [levelUp, setLevelUp] = useState<LevelStep | null>(null)
  const [newAch, setNewAch] = useState<Achievement | null>(null)
  // 趣味包:连击 / 飘字 / 抖动 / 录音回放 / 跟读星级 / 贴纸
  const [combo, setCombo] = useState(0)
  const [floatText, setFloatText] = useState<{ id: number; text: string } | null>(null)
  const [shaking, setShaking] = useState(false)
  const [recBlob, setRecBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<Recorder | null>(null)
  const [speakStars, setSpeakStars] = useState(-1)
  const [wonSticker, setWonSticker] = useState<StickerDef | null>(null)
  const [poolPic, setPoolPic] = useState<{ front: string; en: string; emoji: string }[]>([])
  const [petResult, setPetResult] = useState<FeedResult | null>(null)
  /** 答对特效计数器:每答对 +1 触发一次花瓣鼓励 */
  const [burst, setBurst] = useState(0)

  useEffect(() => {
    if (!currentChildId || !deckId) return
    let alive = true
    void (async () => {
      const list = isFree
        ? await getFreeSessionCards(currentChildId, deckId, 12)
        : await getSessionCards(currentChildId, deckId, 12)
      const allCards = await db.cards.where('deckId').equals(deckId).toArray()
      const d = await db.decks.get(deckId)
      if (!alive) return
      setPool(allCards.map((c) => c.back))
      setPoolFront(allCards.map((c) => c.front))
      const lines: string[] = []
      const pics: { front: string; en: string; emoji: string }[] = []
      for (const c of allCards) {
        const ls = (c.extra as { lines?: string[] } | undefined)?.lines
        if (Array.isArray(ls)) lines.push(...ls)
        const ext = c.extra as { emoji?: string; en?: string } | undefined
        if (ext?.emoji) pics.push({ front: c.front, en: ext.en ?? '', emoji: ext.emoji })
      }
      setLinePool(lines)
      setPoolPic(pics)
      setDeck(d ?? null)
      setCards(list)
    })()
    return () => {
      alive = false
    }
  }, [currentChildId, deckId, isFree])

  /** 自由练习:重新抽一组,原地重开 */
  const restartFree = useCallback(async () => {
    if (!currentChildId || !deckId) return
    const list = await getFreeSessionCards(currentChildId, deckId, 12)
    setCards(list)
    setIdx(0)
    setPhase('prompt')
    setCorrectCount(0)
    setCombo(0)
    setPicked(null)
    setSpellInput('')
    setSpeakMsg('')
    setSpeakStars(-1)
    setRecBlob(null)
    setSummary(null)
    setWonSticker(null)
    setPetResult(null)
  }, [currentChildId, deckId])

  const current = cards?.[idx]
  const itemType = deck?.itemType ?? 'word'
  const isHanzi = itemType === 'hanzi'

  /** 按学科播放:都优先走网络真人音源,拿不到才用设备合成音。times=2 自动复读一遍。 */
  const playAudio = useCallback(
    (text: string, times = 1) => {
      if (itemType === 'word') void playWordAudio(text, 2, times)
      else speakChinese(text, itemType === 'poem' ? 0.85 : 0.8, times)
    },
    [itemType],
  )

  // 幼儿看图:3 个名字选项(picChoose) / 4 张图选项(listenPic)
  const picOptions = useMemo(() => {
    if (!current || mode !== 'picChoose') return []
    const answer = current.card.front
    const distractors = shuffle(poolPic.map((p) => p.front).filter((f) => f !== answer)).slice(0, 2)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolPic])

  const listenPicOptions = useMemo(() => {
    if (!current || (mode !== 'listenPic' && mode !== 'listenPicEn')) return []
    const ext = current.card.extra as { emoji?: string; en?: string } | undefined
    const answer = { front: current.card.front, en: ext?.en ?? '', emoji: ext?.emoji ?? '' }
    const distractors = shuffle(poolPic.filter((p) => p.front !== answer.front)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolPic])

  // 英语·看图选词:3 个英语单词选项
  const picOptionsEn = useMemo(() => {
    if (!current || mode !== 'picChooseEn') return []
    const answer = (current.card.extra as { en?: string })?.en ?? current.card.back
    const distractors = shuffle(poolPic.map((p) => p.en).filter((e) => e && e !== answer)).slice(0, 2)
    return shuffle([answer, ...distractors])
  }, [current, mode, poolPic])

  const currentEn = (current?.card.extra as { en?: string } | undefined)?.en ?? current?.card.back ?? ''

  // 问答四选一:正确答案 + 3 个本卡组其他答案作干扰
  const quizOptions = useMemo(() => {
    if (!current || mode !== 'quiz') return []
    const answer = current.card.back
    const distractors = shuffle([...new Set(pool.filter((b) => b !== answer))]).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, pool])

  // 听音选(义/字) 4 选项:汉字选正面,单词选释义
  const options = useMemo(() => {
    if (!current || mode !== 'listenChoose') return []
    const answer = isHanzi ? current.card.front : current.card.back
    const src = isHanzi ? poolFront : pool
    const distractors = shuffle(src.filter((b) => b !== answer)).slice(0, 3)
    return shuffle([answer, ...distractors])
  }, [current, mode, pool, poolFront, isHanzi])

  // 补全诗句:随机挖掉一句,4 选项(正确句 + 3 干扰句)
  const blank = useMemo(() => {
    if (!current || mode !== 'fillBlank') return null
    const lines = (current.card.extra as { lines?: string[] } | undefined)?.lines ?? []
    if (lines.length === 0) return null
    const hideIdx = Math.floor(Math.random() * lines.length)
    const answer = lines[hideIdx]
    // 干扰句:同字数、且不属于本诗(避免用本诗其它句作干扰)
    const own = new Set(lines)
    const distractors = shuffle(
      linePool.filter((l) => !own.has(l) && l.length === answer.length),
    ).slice(0, 3)
    return { lines, hideIdx, answer, options: shuffle([answer, ...distractors]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, linePool, idx])

  // 进入每张卡时,听音类模式自动播放发音;幼儿延迟一点,给语音夸奖留时间
  useEffect(() => {
    if (!current || phase !== 'prompt') return
    if (mode === 'listenChoose' || mode === 'speak' || mode === 'dictation' || mode === 'listenPic') {
      const delay = isToddler ? 1200 : 0
      // 听音类题目自动读两遍,防止走神/环境吵漏听
      const times = mode === 'speak' ? 1 : 2
      const t = setTimeout(() => playAudio(current.card.audioText ?? current.card.front, times), delay)
      return () => clearTimeout(t)
    }
    if (mode === 'listenPicEn') {
      const en = (current.card.extra as { en?: string })?.en ?? current.card.back
      const t = setTimeout(() => void playWordAudio(en, 2, 2), isToddler ? 1200 : 0)
      return () => clearTimeout(t)
    }
  }, [current, phase, mode, playAudio, isToddler])

  // 预热下一张卡的音频:提前下载好,翻到它时直接是真人音,不会因首次下载慢而退回合成音
  useEffect(() => {
    if (!cards) return
    const next = cards[idx + 1]
    if (!next) return
    const en = (next.card.extra as { en?: string } | undefined)?.en
    if (itemType === 'word') prefetchSpeech(next.card.front, 'en')
    else if (en && (mode === 'picChooseEn' || mode === 'listenPicEn' || mode === 'earTrain')) {
      prefetchSpeech(en, 'en')
    } else prefetchSpeech(next.card.audioText ?? next.card.front, 'zh')
  }, [cards, idx, itemType, mode])

  const finish = useCallback(
    async (finalCorrect: number, total: number) => {
      if (!currentChildId || !deckId || !mode || !child) return
      const settings = await db.settings.get('singleton')
      const before = await getChildPointStats(currentChildId)
      const res = await finishSession({
        childId: currentChildId,
        deckId,
        mode,
        total,
        correct: finalCorrect,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
      })
      setSummary({ correct: finalCorrect, total, points: res.pointsAwarded, capped: res.capped })
      // 升级判定
      if (settings) {
        const lvBefore = computeLevelInfo(before.xp, settings.levelLadder).level
        const lvAfter = computeLevelInfo(res.newXp, settings.levelLadder).level
        if (lvAfter.level > lvBefore.level) setLevelUp(lvAfter)
      }
      const unlocked = await evaluateAchievements(currentChildId)
      if (unlocked.length > 0) setNewAch(unlocked[0])
      // 练得好掉落贴纸(正确率≥80% 且答对≥5)
      if (qualifiesForSticker(finalCorrect, total)) {
        const win = await awardSticker(currentChildId)
        if (win) {
          setWonSticker(win)
          setTimeout(sfxSticker, 500)
        }
      }
      // 喂宠物:每答对一题喂一口
      const fedRes = await feedPet(currentChildId, finalCorrect)
      if (fedRes) {
        setPetResult(fedRes)
        if (fedRes.evolved) setTimeout(sfxSticker, 900)
      }
      sfxFanfare()
      if (tone === 'playful') confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } })
      setPhase('done')
    },
    [currentChildId, deckId, mode, child, startedAt, tone],
  )

  const advance = useCallback(
    async (wasCorrect: boolean) => {
      if (!current) return
      // 自由练习不动 SRS 排期(想练多少组都不打乱明日计划)
      if (!isFree) await applyGrade(current.state.id, wasCorrect ? 'good' : 'again')
      // 答错的单词自动收进错词本(错词本自身除外)
      if (!isFree && !wasCorrect && currentChildId && deck && deck.source !== 'wrong' && deck.itemType === 'word') {
        await addWrongCard(currentChildId, {
          front: current.card.front,
          back: current.card.back,
          phonetic: current.card.phonetic,
          audioText: current.card.audioText,
          extra: current.card.extra,
        })
      }
      // 其他学科答错自动进错题本(识字/看图/古诗;英语单词走上面的错词本)
      if (!isFree && !wasCorrect && currentChildId && deck && deck.source !== 'wrong') {
        if (deck.itemType === 'hanzi') {
          const word = (current.card.extra as { word?: string })?.word
          await autoAddErrorCard(currentChildId, {
            front: `认字:${current.card.front}`,
            back: `读音 ${current.card.back}${word ? ` · 组词 ${word}` : ''}`,
            subject: '语文',
          })
        } else if (deck.itemType === 'pic') {
          const ex = current.card.extra as { emoji?: string; en?: string }
          await autoAddErrorCard(currentChildId, {
            front: `${ex?.emoji ?? ''} 这是什么?`,
            back: `${current.card.front}${ex?.en ? ` (${ex.en})` : ''}`,
            subject: deck.subject,
          })
        } else if (deck.itemType === 'poem') {
          await autoAddErrorCard(currentChildId, {
            front: `背诵《${current.card.front}》`,
            back: current.card.back,
            subject: '语文',
          })
        } else if (deck.itemType === 'fact') {
          await autoAddErrorCard(currentChildId, {
            front: current.card.front,
            back: current.card.back,
            subject: deck.subject,
          })
        }
      }
      // 趣味反馈:音效 + 连击 + 飘字 / 抖动;幼儿加语音夸奖
      if (wasCorrect) {
        const nextCombo = combo + 1
        setCombo(nextCombo)
        setBurst((b) => b + 1)
        if (nextCombo >= 3 && nextCombo % 3 === 0) sfxCombo(Math.floor(nextCombo / 3))
        else sfxCorrect()
        if (isToddler) {
          const enMode = mode === 'picChooseEn' || mode === 'listenPicEn'
          if (enMode) speakEnglish(VOICE_PRAISE_EN[Math.floor(Math.random() * VOICE_PRAISE_EN.length)], 1)
          else speakChinese(VOICE_PRAISE[Math.floor(Math.random() * VOICE_PRAISE.length)], 1.05)
        }
        const praise =
          nextCombo >= 3
            ? `${PRAISE[nextCombo % PRAISE.length]} 连对${nextCombo}!`
            : PRAISE[Math.floor(Math.random() * PRAISE.length)]
        setFloatText({ id: Date.now(), text: `+2 ${praise}` })
      } else {
        setCombo(0)
        sfxWrong()
        setShaking(true)
        setTimeout(() => setShaking(false), 450)
      }
      const nextCorrect = correctCount + (wasCorrect ? 1 : 0)
      setCorrectCount(nextCorrect)
      const total = cards!.length
      if (idx + 1 >= total) {
        await finish(nextCorrect, total)
      } else {
        setIdx(idx + 1)
        setPhase('prompt')
        setSpellInput('')
        setPicked(null)
        setSpeakMsg('')
        setSpeakStars(-1)
        setRecBlob(null)
      }
    },
    [current, correctCount, cards, idx, finish, currentChildId, deck, combo, isToddler, mode, isFree],
  )

  // 磨耳朵:每张卡自动「英语×2(真人音)→中文」连播,然后翻下一张;不评分、听完整组照常结算
  useEffect(() => {
    if (mode !== 'earTrain' || !current || phase === 'done' || !cards) return
    const en = (current.card.extra as { en?: string })?.en ?? current.card.back
    void playWordAudio(en, 2, 2)
    const t1 = setTimeout(() => speakChinese(current.card.audioText ?? current.card.front, 0.9), 3100)
    const t2 = setTimeout(() => {
      if (idx + 1 >= cards.length) void finish(cards.length, cards.length)
      else setIdx((i) => i + 1)
    }, 5700)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [mode, current, phase, cards, idx, finish])

  // 录我读的 → 回放
  const toggleRecord = useCallback(async () => {
    if (recording) {
      setRecording(false)
      const rec = recorderRef.current
      recorderRef.current = null
      if (rec) setRecBlob(await rec.stop())
      return
    }
    try {
      setRecBlob(null)
      recorderRef.current = await startRecording()
      setRecording(true)
    } catch {
      setSpeakMsg('麦克风不可用,检查浏览器授权')
    }
  }, [recording])

  if (!child || !currentChildId) return null

  if (cards && cards.length === 0 && phase !== 'done') {
    return (
      <div className="pt-16 text-center px-6">
        <div className="text-5xl mb-3">🎉</div>
        <p className="text-gray-600 font-medium">这个词库今天已经学完啦!</p>
        <p className="text-sm text-gray-400 mt-1">明天到期的卡片会自动出现;也可以自由再练,不限次数</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => navigate('/learn')}
            className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-500 active:scale-95 transition"
          >
            返回
          </button>
          <button
            onClick={() => navigate(`/learn/session/${deckId}/${mode}?free=1`, { replace: true })}
            className="rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95 transition"
          >
            🔁 自由再练一组
          </button>
        </div>
      </div>
    )
  }

  if (!cards) return <div className="pt-20 text-center text-3xl">📚</div>

  // 结算页
  if (phase === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    const sessStars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct > 0 ? 1 : 0
    return (
      <>
        <div className="pt-12 text-center px-6">
          <div className="text-6xl mb-2">{pct >= 80 ? '🌟' : pct >= 60 ? '👍' : '💪'}</div>
          <h1 className="text-2xl font-bold text-gray-800">练完啦!</h1>
          <div className="mt-2 text-3xl tracking-wider" aria-label={`${sessStars}星`}>
            {'⭐'.repeat(sessStars)}
            <span className="opacity-30">{'⭐'.repeat(3 - sessStars)}</span>
          </div>
          <div className="mt-5 rounded-3xl bg-white/70 p-6 shadow-sm max-w-xs mx-auto">
            <div className="flex justify-around">
              <div>
                <div className="text-2xl font-bold text-gray-800">
                  {summary.correct}/{summary.total}
                </div>
                <div className="text-xs text-gray-400">答对</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sun-500">+{summary.points}</div>
                <div className="text-xs text-gray-400">积分</div>
              </div>
            </div>
          </div>
          {summary.capped && (
            <p className="mt-2 text-[11px] text-gray-400">今天的学习积分已经拿满啦,继续练习照样有记录,明天再来赚积分~</p>
          )}
          {wonSticker && (
            <div className="mt-5 mx-auto max-w-xs rounded-3xl bg-gradient-to-br from-sun-400/25 to-brand-100 p-5">
              <div className="text-xs font-bold text-sun-500 mb-1">🎁 获得新贴纸!</div>
              <div className="animate-sticker-pop text-6xl">{wonSticker.emoji}</div>
              <div className="mt-1 text-sm font-medium text-gray-700">{wonSticker.name}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">已放进你的贴纸册</div>
            </div>
          )}
          {petResult && (
            <div className="mt-4 mx-auto max-w-xs rounded-3xl bg-mint-400/15 p-4">
              {petResult.evolved && petResult.fromStage ? (
                <>
                  <div className="text-xs font-bold text-mint-600 mb-1">✨ 进化啦!</div>
                  <div className="text-3xl">
                    {petResult.fromStage.emoji} <span className="text-gray-400">→</span>{' '}
                    <span className="animate-sticker-pop inline-block text-5xl">{petResult.pet.stage.emoji}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-gray-700">
                    变成了「{petResult.pet.stage.label}」!
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-4xl">{petResult.pet.stage.emoji}</span>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-700">
                      {petResult.pet.stage.label}吃了 {summary.correct} 口,好开心
                    </div>
                    {petResult.pet.toNext && (
                      <div className="text-[11px] text-gray-400">
                        再喂 {petResult.pet.toNext.need - petResult.pet.toNext.have} 口就进化啦
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-8 flex justify-center gap-3">
            {isFree && (
              <button
                onClick={() => void restartFree()}
                className="rounded-2xl bg-white/80 px-6 py-3 font-bold text-gray-600 active:scale-95 transition"
              >
                🔁 再来一组
              </button>
            )}
            <button
              onClick={() => navigate('/learn')}
              className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 transition"
            >
              完成
            </button>
          </div>
        </div>
        <CorrectBurst trigger={burst} combo={combo} big={isToddler} />
        <LevelUpModal level={levelUp} tone={tone} onClose={() => setLevelUp(null)} />
        <AchievementUnlockModal achievement={newAch} tone={tone} onClose={() => setNewAch(null)} />
      </>
    )
  }

  if (!current) return <div className="pt-20 text-center text-3xl">📚</div>

  const progress = ((idx + (phase === 'reveal' ? 0.5 : 0)) / cards.length) * 100

  const AudioBtn = ({ big }: { big?: boolean }) => (
    <button
      onClick={() => playAudio(current.card.audioText ?? current.card.front)}
      className={`inline-flex items-center justify-center rounded-full bg-brand-100 text-brand-600 active:scale-90 transition ${
        big ? 'h-16 w-16' : 'h-10 w-10'
      }`}
      aria-label="播放发音"
    >
      <Volume2 size={big ? 28 : 18} />
    </button>
  )

  return (
    <div className={`pt-4 pb-10 min-h-screen flex flex-col relative ${shaking ? 'animate-shake' : ''}`}>
      <CorrectBurst trigger={burst} combo={combo} big={isToddler} />
      {/* 顶部进度 */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/learn')} className="text-gray-400 text-sm">
          退出
        </button>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">
          {idx + 1}/{cards.length}
          {isFree ? ' · 自由' : ''}
        </span>
      </div>

      {/* 连击徽标 */}
      <div className="h-7 mb-1 text-center">
        {combo >= 2 && (
          <span
            key={combo}
            className="animate-combo-pulse inline-block rounded-full bg-orange-100 px-3 py-0.5 text-sm font-bold text-orange-500"
          >
            🔥 连对 {combo}
          </span>
        )}
      </div>

      {/* 答对飘字 */}
      {floatText && (
        <div
          key={floatText.id}
          className="animate-float-up pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 text-xl font-bold text-mint-500"
        >
          {floatText.text}
        </div>
      )}

      {/* ---- 认词 / 认字 ---- */}
      {mode === 'recognize' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className={`font-bold text-gray-800 mb-2 ${isHanzi ? 'text-7xl' : 'text-4xl'}`}>
            {current.card.front}
          </div>
          {!isHanzi && current.card.phonetic && (
            <div className="text-sm text-gray-400 mb-3">/{current.card.phonetic}/</div>
          )}
          <AudioBtn />
          {phase === 'reveal' ? (
            <>
              {isHanzi ? (
                <>
                  <div className="mt-6 text-2xl text-brand-600 font-bold">{current.card.phonetic}</div>
                  {(current.card.extra as { word?: string } | undefined)?.word && (
                    <div className="mt-1 text-gray-500">
                      组词:{(current.card.extra as { word?: string }).word}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-6 text-lg text-brand-600 font-medium">{current.card.back}</div>
              )}
              <div className="mt-8 flex gap-3">
                <button onClick={() => void advance(false)} className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-500 active:scale-95">
                  {isHanzi ? '不认识' : '没记住'}
                </button>
                <button onClick={() => void advance(true)} className="rounded-2xl bg-mint-500 px-8 py-3 font-bold text-white active:scale-95">
                  {isHanzi ? '认识' : '记住了'}
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setPhase('reveal')} className="mt-8 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
              {isHanzi ? '看读音' : '看意思'}
            </button>
          )}
        </div>
      )}

      {/* ---- 听音选义 / 听音选字 ---- */}
      {mode === 'listenChoose' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="mt-4 mb-8">
            <AudioBtn big />
          </div>
          <p className="text-sm text-gray-400 mb-4">
            {isHanzi ? '听读音,选出正确的字' : '听发音,选出正确的意思'}
          </p>
          <div className={`w-full max-w-sm ${isHanzi ? 'grid grid-cols-2 gap-3' : 'space-y-3'}`}>
            {options.map((opt) => {
              const answer = isHanzi ? current.card.front : current.card.back
              const isCorrect = opt === answer
              const show = picked !== null
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    setTimeout(() => void advance(opt === answer), 900)
                  }}
                  className={`w-full rounded-2xl px-4 py-3 font-medium transition ${
                    isHanzi ? 'text-center text-3xl' : 'text-left'
                  } ${
                    show && isCorrect
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- 拼写 ---- */}
      {mode === 'spell' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="text-lg text-brand-600 font-medium mt-4 mb-2 text-center">{current.card.back}</div>
          <AudioBtn />
          <p className="text-sm text-gray-400 mt-4 mb-3">拼出这个单词</p>
          {phase === 'reveal' ? (
            <div className="flex flex-col items-center">
              <div
                className={`text-3xl font-bold ${
                  normalizeForCompare(spellInput) === normalizeForCompare(current.card.front)
                    ? 'text-mint-500'
                    : 'text-red-400'
                }`}
              >
                {current.card.front}
              </div>
              {normalizeForCompare(spellInput) !== normalizeForCompare(current.card.front) && (
                <div className="text-sm text-gray-400 mt-1">你写的:{spellInput || '(空)'}</div>
              )}
              <button
                onClick={() => void advance(normalizeForCompare(spellInput) === normalizeForCompare(current.card.front))}
                className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 flex items-center gap-1"
              >
                下一个 <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPhase('reveal')
              }}
              className="w-full max-w-xs flex flex-col items-center"
            >
              <input
                autoFocus
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 text-center text-2xl outline-none focus:border-brand-400"
                placeholder="输入英文"
              />
              <button type="submit" className="mt-5 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
                检查
              </button>
            </form>
          )}
        </div>
      )}

      {/* ---- 听写(只听发音,写出单词) ---- */}
      {mode === 'dictation' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="mt-4 mb-6">
            <AudioBtn big />
          </div>
          <p className="text-sm text-gray-400 mb-4">听发音,写出这个单词</p>
          {phase === 'reveal' ? (
            <div className="flex flex-col items-center">
              <div
                className={`text-3xl font-bold ${
                  normalizeForCompare(spellInput) === normalizeForCompare(current.card.front)
                    ? 'text-mint-500'
                    : 'text-red-400'
                }`}
              >
                {current.card.front}
              </div>
              {current.card.phonetic && (
                <div className="text-sm text-gray-400 mt-0.5">/{current.card.phonetic}/</div>
              )}
              <div className="text-brand-600 mt-1">{current.card.back}</div>
              {normalizeForCompare(spellInput) !== normalizeForCompare(current.card.front) && (
                <div className="text-sm text-gray-400 mt-1">你写的:{spellInput || '(空)'}</div>
              )}
              <button
                onClick={() => void advance(normalizeForCompare(spellInput) === normalizeForCompare(current.card.front))}
                className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 flex items-center gap-1"
              >
                下一个 <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setPhase('reveal')
              }}
              className="w-full max-w-xs flex flex-col items-center"
            >
              <input
                autoFocus
                value={spellInput}
                onChange={(e) => setSpellInput(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 text-center text-2xl outline-none focus:border-brand-400"
                placeholder="听写英文"
              />
              <button type="submit" className="mt-5 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
                检查
              </button>
            </form>
          )}
        </div>
      )}

      {/* ---- 跟读(范读 → 录音回放 → 星级打分) ---- */}
      {mode === 'speak' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="text-4xl font-bold text-gray-800 mb-2">{current.card.front}</div>
          {current.card.phonetic && <div className="text-sm text-gray-400 mb-1">/{current.card.phonetic}/</div>}
          <div className="text-brand-600 mb-4">{current.card.back}</div>

          {/* 范读 / 录我读的 / 回放 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => playAudio(current.card.audioText ?? current.card.front)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-600 active:scale-95"
            >
              <Volume2 size={15} /> 范读
            </button>
            {isRecordingSupported() && (
              <button
                onClick={() => void toggleRecord()}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium active:scale-95 ${
                  recording ? 'bg-orange-100 text-orange-600' : 'bg-brand-100 text-brand-600'
                }`}
              >
                {recording ? <Square size={15} /> : <Disc size={15} />}
                {recording ? '停止' : '录我读的'}
              </button>
            )}
            {recBlob && (
              <button
                onClick={() => playRecording(recBlob)}
                className="inline-flex items-center gap-1.5 rounded-full bg-mint-400/25 px-4 py-2 text-sm font-medium text-mint-600 active:scale-95"
              >
                <Play size={15} /> 回放
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            先听范读 → 录一遍听听自己的 → 点麦克风打分
          </p>

          {isSpeechRecognitionSupported() ? (
            <>
              <button
                onClick={async () => {
                  setSpeakMsg('聆听中…请读出来')
                  setSpeakStars(-1)
                  try {
                    const r = await recognizeOnce(current.card.front, 'en-US')
                    const score = scorePronunciation(r.transcript, current.card.front)
                    setSpeakStars(score.stars)
                    setSpeakMsg(
                      score.message + (r.transcript ? `(听到:${r.transcript})` : ''),
                    )
                    if (score.stars >= 2) {
                      setTimeout(() => void advance(true), 1300)
                    }
                  } catch {
                    setSpeakMsg('没听清,可再试或跳过(识别需联网)')
                  }
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95"
              >
                <Mic size={18} /> 跟读打分
              </button>
              {speakStars >= 0 && (
                <div className="mt-3 text-3xl tracking-wider">
                  {'⭐'.repeat(speakStars)}
                  <span className="opacity-30">{'⭐'.repeat(3 - speakStars)}</span>
                </div>
              )}
              {speakMsg && <div className="mt-2 text-sm text-gray-500">{speakMsg}</div>}
              <div className="mt-5 flex gap-3">
                <button onClick={() => void advance(false)} className="rounded-xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
                  跳过
                </button>
                <button onClick={() => void advance(true)} className="rounded-xl bg-mint-100 px-4 py-2 text-sm text-mint-600">
                  我读对了
                </button>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <p className="text-sm text-orange-500 mb-3">
                此设备不支持语音识别打分,可录音回放自查后点"读好了"
              </p>
              <button onClick={() => void advance(true)} className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
                读好了
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- 古诗:朗读背诵 ---- */}
      {mode === 'recite' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="text-xl font-bold text-gray-800 mt-2">{current.card.front}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {(current.card.extra as { dynasty?: string; author?: string } | undefined)?.dynasty}
            ·{(current.card.extra as { author?: string } | undefined)?.author}
          </div>
          <div className="my-6 flex flex-col items-center gap-2 text-lg leading-relaxed text-gray-700">
            {((current.card.extra as { lines?: string[] } | undefined)?.lines ?? []).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <button
            onClick={() => playAudio(current.card.audioText ?? current.card.front)}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-100 px-5 py-2.5 font-medium text-brand-600 active:scale-95"
          >
            <Volume2 size={18} /> 朗读一遍
          </button>
          <p className="text-xs text-gray-400 mt-4">听一听、跟着读,试着背下来</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => void advance(false)} className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-500 active:scale-95">
              还不熟
            </button>
            <button onClick={() => void advance(true)} className="rounded-2xl bg-mint-500 px-8 py-3 font-bold text-white active:scale-95">
              会背了
            </button>
          </div>
        </div>
      )}

      {/* ---- 古诗:补全诗句 ---- */}
      {mode === 'fillBlank' && blank && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="text-base font-bold text-gray-700 mt-2">{current.card.front}</div>
          <div className="my-6 flex flex-col items-center gap-2 text-lg leading-relaxed text-gray-700">
            {blank.lines.map((l, i) => (
              <div key={i} className={i === blank.hideIdx ? 'font-bold text-brand-500' : ''}>
                {i === blank.hideIdx ? (picked ? blank.answer : '　'.repeat(l.length)) : l}
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-400 mb-3">选出缺少的那一句</p>
          <div className="w-full max-w-sm space-y-3">
            {blank.options.map((opt) => {
              const show = picked !== null
              const isCorrect = opt === blank.answer
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    setTimeout(() => void advance(opt === blank.answer), 1000)
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-center font-medium transition ${
                    show && isCorrect
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- 错题本:看题回想 → 翻答案自评 ---- */}
      {mode === 'review' && (
        <div className="flex-1 flex flex-col items-center px-4">
          {(current.card.extra as { subject?: string } | undefined)?.subject && (
            <span className="mb-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-600">
              {(current.card.extra as { subject?: string }).subject}
            </span>
          )}
          <div className="w-full max-w-md rounded-2xl bg-white/80 p-4 text-gray-800 whitespace-pre-line leading-relaxed">
            {current.card.front}
          </div>
          {(current.card.extra as { photo?: string } | undefined)?.photo && (
            <img
              src={(current.card.extra as { photo?: string }).photo}
              alt="错题图片"
              className="mt-3 max-h-60 rounded-2xl object-contain"
            />
          )}
          {phase === 'reveal' ? (
            <>
              <div className="mt-4 w-full max-w-md rounded-2xl bg-mint-400/15 p-4 text-gray-800 whitespace-pre-line leading-relaxed">
                <div className="text-xs text-mint-600 font-bold mb-1">答案</div>
                {current.card.back}
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => void advance(false)} className="rounded-2xl bg-gray-100 px-6 py-3 font-bold text-gray-500 active:scale-95">
                  还没掌握
                </button>
                <button onClick={() => void advance(true)} className="rounded-2xl bg-mint-500 px-8 py-3 font-bold text-white active:scale-95">
                  已掌握
                </button>
              </div>
            </>
          ) : (
            <button onClick={() => setPhase('reveal')} className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95">
              看答案
            </button>
          )}
        </div>
      )}

      {/* ---- 问答:看题四选一(科学/安全/成语/地理) ---- */}
      {mode === 'quiz' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="mt-4 w-full max-w-md rounded-2xl bg-white/80 p-5 text-center shadow-sm">
            <div className="text-lg font-bold text-gray-800 leading-relaxed">{current.card.front}</div>
            <button
              onClick={() => playAudio(current.card.front)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-600 active:scale-95"
            >
              <Volume2 size={13} /> 读题
            </button>
          </div>
          <div className="mt-4 w-full max-w-md space-y-2.5">
            {quizOptions.map((opt) => {
              const show = picked !== null
              const isRight = opt === current.card.back
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    setTimeout(() => void advance(opt === current.card.back), 1100)
                  }}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-[15px] font-medium transition ${
                    show && isRight
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ---- 幼儿:看图选一选(大图 → 3 个名字) ---- */}
      {mode === 'picChoose' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="my-4 flex min-h-36 items-center justify-center">
            <span className="text-8xl leading-none break-all text-center" style={{ wordBreak: 'break-all' }}>
              {(current.card.extra as { emoji?: string })?.emoji}
            </span>
          </div>
          <button
            onClick={() => playAudio(current.card.audioText ?? current.card.front)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-600 active:scale-95"
          >
            <Volume2 size={15} /> 听一听
          </button>
          <p className="text-sm text-gray-400 mb-3">这是什么呀?点一点</p>
          <div className="w-full max-w-sm space-y-3">
            {picOptions.map((opt) => {
              const show = picked !== null
              const isRight = opt === current.card.front
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    playAudio(current.card.audioText ?? current.card.front)
                    setTimeout(() => void advance(opt === current.card.front), 1100)
                  }}
                  className={`w-full rounded-2xl px-4 py-4 text-center text-2xl font-bold transition ${
                    show && isRight
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-xs text-gray-400">
            {(current.card.extra as { en?: string })?.en}
          </div>
        </div>
      )}

      {/* ---- 幼儿:听音选图(中文/英语共用,听声音 → 4 张大图) ---- */}
      {(mode === 'listenPic' || mode === 'listenPicEn') && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="mt-4 mb-6">
            <button
              onClick={() =>
                mode === 'listenPicEn'
                  ? void playWordAudio(currentEn)
                  : playAudio(current.card.audioText ?? current.card.front)
              }
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-600 active:scale-90 transition"
              aria-label="播放发音"
            >
              <Volume2 size={28} />
            </button>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            {mode === 'listenPicEn' ? '听英语,点对应的图片' : '听一听,点对应的图片'}
          </p>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            {listenPicOptions.map((opt) => {
              const show = picked !== null
              const isRight = opt.front === current.card.front
              return (
                <button
                  key={opt.front}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt.front)
                    setTimeout(() => void advance(opt.front === current.card.front), 1000)
                  }}
                  className={`flex min-h-28 items-center justify-center rounded-3xl p-3 transition ${
                    show && isRight
                      ? 'bg-mint-500'
                      : show && opt.front === picked
                        ? 'bg-red-400'
                        : 'bg-white/80'
                  }`}
                >
                  <span className="text-6xl leading-none break-all text-center">{opt.emoji}</span>
                </button>
              )
            })}
          </div>
          {mode === 'listenPicEn' && picked && (
            <div className="mt-4 text-lg font-bold text-brand-600">
              {currentEn} <span className="text-sm font-normal text-gray-400">{current.card.front}</span>
            </div>
          )}
        </div>
      )}

      {/* ---- 幼儿英语:看图选词(大图 → 3 个英语单词) ---- */}
      {mode === 'picChooseEn' && (
        <div className="flex-1 flex flex-col items-center px-4">
          <div className="my-4 flex min-h-36 items-center justify-center">
            <span className="text-8xl leading-none break-all text-center">
              {(current.card.extra as { emoji?: string })?.emoji}
            </span>
          </div>
          <button
            onClick={() => void playWordAudio(currentEn)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-4 py-2 text-sm font-medium text-brand-600 active:scale-95"
          >
            <Volume2 size={15} /> 听英语
          </button>
          <p className="text-sm text-gray-400 mb-3">What is it? 点一点</p>
          <div className="w-full max-w-sm space-y-3">
            {picOptionsEn.map((opt) => {
              const show = picked !== null
              const isRight = opt === currentEn
              return (
                <button
                  key={opt}
                  disabled={picked !== null}
                  onClick={() => {
                    setPicked(opt)
                    void playWordAudio(currentEn)
                    setTimeout(() => void advance(opt === currentEn), 1200)
                  }}
                  className={`w-full rounded-2xl px-4 py-4 text-center text-2xl font-bold transition ${
                    show && isRight
                      ? 'bg-mint-500 text-white'
                      : show && opt === picked
                        ? 'bg-red-400 text-white'
                        : 'bg-white/80 text-gray-700'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
          {picked && <div className="mt-3 text-sm text-gray-400">{current.card.front}</div>}
        </div>
      )}

      {/* ---- 幼儿英语:磨耳朵(英语→中文自动连播,不用操作) ---- */}
      {mode === 'earTrain' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <span className="text-8xl leading-none break-all">
            {(current.card.extra as { emoji?: string })?.emoji}
          </span>
          <div className="mt-6 text-4xl font-bold text-brand-600">{currentEn}</div>
          <div className="mt-2 text-xl text-gray-600">{current.card.front}</div>
          <p className="mt-8 text-xs text-gray-400">🎵 磨耳朵中…会自动翻页,听完这组就好啦</p>
        </div>
      )}
    </div>
  )
}
