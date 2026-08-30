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
import { OPTION_LETTERS } from '../lib/redo'
import { sfxFanfare } from '../lib/sfx'

/**
 * 阶段测验。
 *
 * 平时的练习都带着脚手架:有图、有选项、错了当场告诉他答案、同一批卡反复出现。
 * 这些在**学的时候**是对的,但它们让一个问题永远看不清:
 * **撤掉脚手架之后,他到底会多少?**
 *
 * 所以这一页故意和练习不一样:跨卡组抽题、**做完不当场纠正**
 * (当场纠正就变成边考边学,测出来的是短时记忆)、交卷后一次性给分。
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
  const [answers, setAnswers] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [reviewing, setReviewing] = useState(false)

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
    const correct = qs.reduce((n, x, i) => n + (finalAnswers[i] === x.answer ? 1 : 0), 0)
    saveExam(currentChildId, period, qs.length, correct)
    // 错的自动进错题本,重做形式和考试时一致
    qs.forEach((x, i) => {
      if (finalAnswers[i] === x.answer) return
      void autoAddErrorCard(currentChildId, {
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
    })
    sfxFanfare()
    setDone(true)
  }

  const choose = (opt: string) => {
    const next = [...answers]
    next[idx] = opt
    setAnswers(next)
    /*
      **不当场告诉他对错。**
      当场纠正会让后面的题变成「刚才那个是这样,那这道大概也……」——
      测出来的是短时记忆,不是他真正掌握的东西。
    */
    setTimeout(() => {
      if (idx + 1 >= qs.length) finish(next)
      else setIdx(idx + 1)
    }, 260)
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
    const correct = qs.reduce((n, x, i) => n + (answers[i] === x.answer ? 1 : 0), 0)
    const band = pickScoreBand(correct, qs.length)
    const score = Math.round((correct / qs.length) * 100)
    const prev = listExams(currentChildId).filter((r) => r.period === period)[1]
    const cmp = compareWithLast(score, prev ? prev.score : -1)

    if (reviewing) {
      return (
        <div className="pt-4 pb-12">
          <h1 className="mb-4 text-lg font-bold text-gray-800">逐题回顾</h1>
          <div className="space-y-2">
            {qs.map((x, i) => {
              const mine = answers[i]
              const right = mine === x.answer
              return (
                <div
                  key={x.cardId}
                  className={`rounded-2xl p-3 ${right ? 'bg-mint-400/15' : 'bg-red-100/70'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-xs text-gray-400">{i + 1}</span>
                    {x.emoji && <span className="text-2xl">{x.emoji}</span>}
                    <span className="min-w-0 flex-1 text-sm text-gray-700">{x.prompt}</span>
                    <button
                      onClick={() => play(x.audio, x.lang)}
                      className="rounded-full bg-white/70 p-1.5 text-brand-500"
                      aria-label="听一听"
                    >
                      <Volume2 size={14} />
                    </button>
                  </div>
                  <div className="mt-1 pl-8 text-xs text-gray-500">
                    正确:{x.answer}
                    {right ? ' ✅' : ` · 他选了:${mine || '(没选)'}`}
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
        {q.emoji && <div className="my-4 text-8xl leading-none">{q.emoji}</div>}
        <p className="mb-3 text-xl text-gray-800">{q.prompt}</p>
        {q.audio && (
          <button
            onClick={() => play(q.audio, q.lang)}
            className="mb-4 rounded-full bg-brand-100 p-3 text-brand-600 active:scale-90"
            aria-label="听一听"
          >
            <Volume2 size={24} />
          </button>
        )}

        <div className="w-full max-w-sm space-y-2">
          {q.options.map((opt, oi) => (
            <div
              key={opt}
              className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-3"
            >
              {/*
                考试时每个选项同样可以单独试听 —— 这是在考「音、形、义对不对得上」,
                不是在考「猜」。听不到选项的读音,英语题就退化成了看图连线。
              */}
              {q.lang === 'en' && (
                <button
                  onClick={() => playWordAudio(opt, 2, 1)}
                  className="rounded-full bg-brand-100 p-2 text-brand-600 active:scale-90"
                  aria-label={`听 ${opt}`}
                >
                  <Volume2 size={16} />
                </button>
              )}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-bold text-gray-500">
                {OPTION_LETTERS[oi] ?? ''}
              </span>
              <button onClick={() => choose(opt)} className="min-w-0 flex-1 py-1 text-left text-lg">
                {opt}
              </button>
            </div>
          ))}
        </div>

        {/* 考试期间不显示对错,所以要说明一句,否则孩子会以为是没点上 */}
        <p className="mt-6 text-[11px] text-gray-400">
          做完全部题目才公布成绩,所以现在不告诉你对不对哦
        </p>
      </div>
    </div>
  )
}
