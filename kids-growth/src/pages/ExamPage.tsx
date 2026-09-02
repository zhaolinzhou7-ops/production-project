import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Volume2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import {
  buildExam,
  examPeriodDef,
  pickScoreBand,
  compareWithLast,
  type ExamPeriod,
  type ExamQuestion,
} from '../lib/exam'
import { examCandidates, saveExam, listExams, autoAddErrorCard } from '../db/study'
import { playWordAudio, speakChinese } from '../lib/audio'
import { sfxFanfare } from '../lib/sfx'

/**
 * 阶段测验 —— **看图说出来,家长判对错**。
 *
 * w64 把这一页从四选一整个改掉了。理由见 lib/exam 顶部:
 * 四选一有 25% 蒙对率,而且它测的是**再认**(认得出 goat 长什么样),
 * 不是**产出**(见到山羊能说出 goat)—— 后者才是我们想知道的。
 *
 * 这一页因此和练习页彻底不一样:
 * - 屏幕上**没有选项**,只有一张图和一句问话
 * - 他开口说,旁边的家长点「说对了 / 还不会」
 * - 出题时**不播答案**、**不显示答案**(家长要核对时可以单独展开)
 * - 交卷后一次性给分、逐题回顾、错的自动进错题本(还是开口说的形式)
 *
 * 家长必须在场 —— 这不是缺点,是这件事的前提。
 * 分数永远和**自己的上一次**比,而且没有不及格。
 */
export function ExamPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const period = (params.get('period') as ExamPeriod) || 'week'
  const def = examPeriodDef(period)
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const questions = useLiveQuery(async () => {
    if (!currentChildId) return null
    return buildExam(await examCandidates(currentChildId), def.size)
    // 只在进页面时组一次卷 —— 依赖里不要放会变的东西,否则会边考边换题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChildId])

  const [idx, setIdx] = useState(0)
  /** 每道题家长判了什么:'y' 说对了 / 'n' 还不会 / 空串没答 */
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
  */
  const [showAnswer, setShowAnswer] = useState(false)

  if (!child || !currentChildId || questions === undefined) {
    return <div className="pt-20 text-center text-3xl">📝</div>
  }

  const qs: ExamQuestion[] = questions ?? []

  const play = (text?: string, lang: 'zh' | 'en' = 'zh') => {
    if (!text) return
    if (lang === 'en') playWordAudio(text, 2, 1)
    else speakChinese(text, 0.85, 1)
  }

  const finish = (finalAnswers: string[]) => {
    const correct = qs.reduce((n, _x, i) => n + (finalAnswers[i] === 'y' ? 1 : 0), 0)
    /*
      没说出来的那几张要**退回重学**,不能只存个分数。
      原先测验只把错的塞进错题本,而那张卡在正常复习里的排期纹丝不动 ——
      可能还排在两周之后。一次测出来的「不会」,总得改变明天练什么。
      (线下抽查一直是这么做的,测验这边纯粹是漏了。)
    */
    const missed = qs.filter((_x, i) => finalAnswers[i] !== 'y').map((x) => x.cardId)
    void saveExam(currentChildId, period, qs.length, correct, missed)
    // 错的自动进错题本,重做形式和考试时一致(开口说,家长判)
    qs.forEach((x, i) => {
      if (finalAnswers[i] === 'y') return
      void autoAddErrorCard(currentChildId, {
        front: x.emoji ? `${x.emoji} ${x.prompt}` : x.show ? `${x.show} ${x.prompt}` : x.prompt,
        back: x.answer,
        subject: '测验',
        redo: {
          type: 'speak',
          answer: x.answer,
          emoji: x.emoji ?? x.show,
          audio: x.audio,
        },
      })
    })
    sfxFanfare()
    setDone(true)
  }

  /** 家长判这一题:right=说对了 */
  const judge = (right: boolean) => {
    const next = [...answers]
    next[idx] = right ? 'y' : 'n'
    setAnswers(next)
    /*
      **不把正确答案念出来。**
      念出来这道题就变成了教学:他刚才没说上来,听一遍就记住了,
      下一题会顺着刚学的往下猜 —— 测出来的是短时记忆。
      要教在交卷之后的「逐题回顾」里教,那时候整份卷子已经定分了。
    */
    setShowAnswer(false)
    if (idx + 1 >= qs.length) finish(next)
    else setIdx(idx + 1)
  }

  if (qs.length === 0) {
    return (
      <div className="pt-16 px-6 text-center">
        <div className="text-5xl mb-3">📝</div>
        <p className="font-medium text-gray-600">还不能考</p>
        <p className="mt-2 text-sm text-gray-400">
          测验只考<b>学过的</b>内容 —— 先去练几组,学过的够了再来。
          考没教过的东西不是测验,是打击。
        </p>
        <button
          onClick={() => navigate('/learn')}
          className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95"
        >
          先去学习
        </button>
      </div>
    )
  }

  if (done) {
    const correct = qs.reduce((n, _x, i) => n + (answers[i] === 'y' ? 1 : 0), 0)
    const band = pickScoreBand(correct, qs.length)
    const score = Math.round((correct / qs.length) * 100)
    const prev = listExams(currentChildId).filter((r) => r.period === period)[1]
    const cmp = compareWithLast(score, prev ? prev.score : -1)

    if (reviewing) {
      return (
        <div className="pt-4 pb-12">
          <h1 className="mb-1 text-lg font-bold text-gray-800">逐题回顾</h1>
          {/*
            回顾是**交卷之后**才来的,这里才该把答案念出来 ——
            考的时候念等于边考边教,考完念才是真的在补。
          */}
          <p className="mb-3 text-[11px] text-gray-400">
            这里可以放心点 🔊 听:成绩已经定了,现在念是补给他听的
          </p>
          <div className="space-y-2">
            {qs.map((x, i) => {
              const right = answers[i] === 'y'
              return (
                <div
                  key={x.cardId}
                  className={`rounded-2xl p-3 ${right ? 'bg-mint-400/15' : 'bg-red-100/70'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-xs text-gray-400">{i + 1}</span>
                    {x.emoji && <span className="text-2xl">{x.emoji}</span>}
                    <span className="min-w-0 flex-1 text-sm text-gray-700">
                      {x.show ? `${x.show} · ${x.prompt}` : x.prompt}
                    </span>
                    <button
                      onClick={() => play(x.audio, x.lang)}
                      className="rounded-full bg-white/70 p-1.5 text-brand-500"
                      aria-label="听一听"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>
                  <div className="mt-1 pl-8 text-xs text-gray-500">
                    答案:{x.answer}
                    {right ? ' ✅ 说出来了' : ' · 这次没说上来'}
                  </div>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => navigate('/learn')}
            className="mt-6 w-full rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95"
          >
            完成
          </button>
        </div>
      )
    }

    return (
      <div className="pt-12 px-6 text-center">
        <div className="text-6xl mb-2">{band.stars >= 4 ? '🏆' : band.stars >= 3 ? '🌟' : '💪'}</div>
        <div className="text-3xl tracking-wider">
          {'⭐'.repeat(band.stars)}
          <span className="opacity-25">{'⭐'.repeat(5 - band.stars)}</span>
        </div>
        <h1 className="mt-3 text-2xl font-bold text-gray-800">{band.title}</h1>
        <div className="mt-1 text-lg text-brand-600">
          {correct}/{qs.length} · {score} 分
        </div>
        <p className="mt-3 text-sm text-gray-500">{band.cheer}</p>
        {/* 和自己的上一次比 —— 测验真正的价值在这里,不在分数本身 */}
        <p className="mt-2 text-sm text-mint-600">{cmp}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={() => setReviewing(true)}
            className="rounded-2xl bg-white/80 px-6 py-3 font-bold text-gray-600 active:scale-95"
          >
            看看每道题
          </button>
          <button
            onClick={() => navigate('/learn')}
            className="rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95"
          >
            完成
          </button>
        </div>
        <p className="mt-5 text-[11px] text-gray-400">
          做错的题已经收进错题本,重做时和考试时是同一种形式。
        </p>
      </div>
    )
  }

  const q = qs[idx]
  return (
    <div className="pt-4 pb-12 min-h-screen flex flex-col">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => navigate('/learn')} className="p-1 text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-400 transition-all"
            style={{ width: `${(idx / qs.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">
          {def.label} {idx + 1}/{qs.length}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center px-4">
        {/*
          图 / 字摆出来,**底下什么都没有** —— 没有选项就没有蒙的余地。
          也不给 🔊:一放就是把答案念给他听,这道题就白出了。
        */}
        {q.emoji && <div className="my-4 text-8xl leading-none">{q.emoji}</div>}
        {q.show && <div className="my-4 text-7xl leading-tight text-gray-800">{q.show}</div>}
        <p className="mb-3 text-xl text-gray-800">{q.prompt}</p>

        {/*
          答案只给家长。默认藏着,点一下才出;**只出字不出声** ——
          孩子不识字,看见了也读不出来,念出来他就直接学会了。
        */}
        <button
          onClick={() => setShowAnswer((v) => !v)}
          className="mt-2 w-full max-w-sm rounded-2xl bg-black/5 px-4 py-2.5 text-center active:scale-95"
        >
          <span className={showAnswer ? 'text-base font-bold text-gray-700' : 'text-xs text-gray-400'}>
            {showAnswer ? `答案:${q.answer}` : '答案(家长核对用)'}
          </span>
        </button>
        {showAnswer && q.note && (
          <p className="mt-1.5 max-w-sm text-center text-[11px] leading-relaxed text-gray-400">
            {q.note}
          </p>
        )}

        {/*
          家长判分。

          两个按钮做得一样大、颜色不做强对比 —— 这不是「奖励对、惩罚错」的地方,
          是家长在如实记录。做成一个绿一个红,家长会不自觉地往绿的那边点。
        */}
        <div className="mt-8 flex w-full max-w-sm gap-3">
          <button
            onClick={() => judge(false)}
            className="flex-1 rounded-2xl bg-gray-100 py-4 text-lg font-bold text-gray-600 active:scale-95"
          >
            还不会
          </button>
          <button
            onClick={() => judge(true)}
            className="flex-1 rounded-2xl bg-mint-400/25 py-4 text-lg font-bold text-mint-700 active:scale-95"
          >
            说对了
          </button>
        </div>

        {/*
          这一页需要家长在场,得说清楚 —— 不说的话孩子自己点开会一脸茫然,
          而且他会自己点「说对了」,那这份成绩就没有任何意义了。
        */}
        <p className="mt-6 max-w-sm text-center text-[11px] leading-relaxed text-gray-400">
          让他看着图<b>说出来</b>,你听完点上面。做完全部题目才公布成绩。
        </p>
      </div>
    </div>
  )
}
