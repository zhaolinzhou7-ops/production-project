import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { pickSpotCheck, scoreSpotCheck, type SpotItem } from '../lib/spotCheck'
import { spotCandidates, saveSpotCheck, listSpotChecks } from '../db/study'

/**
 * 线下抽查 —— 整套系统里**唯一一个不在屏幕上进行**的功能。
 *
 * 所有「他掌握了多少词」的数字都来自他在屏幕上点对了。而屏幕上有图、有选项、
 * 有排除法:什么都不会的孩子四选一也能蒙对 25%,认得图的能到 80%。
 * 于是掌握量会一路涨,涨到家长深信不疑,而孩子在真实场合一个词也说不出来。
 *
 * **虚假掌握是这类工具最大的系统性风险**:它不报错、不崩溃,
 * 只会安静地积累到某一天被现实戳破。
 *
 * 用法:**把手机拿在家长手里**,照着单子问,孩子用嘴回答。
 * 答不出的当场退回重学,让抽查真的能改变明天练什么。
 */
export function SpotCheckPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const items = useLiveQuery(async () => {
    if (!currentChildId) return null
    return pickSpotCheck(await spotCandidates(currentChildId))
    // 只在进页面时挑一次 —— 中途重挑会让家长问到一半换了题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChildId])

  const [idx, setIdx] = useState(0)
  const [marks, setMarks] = useState<boolean[]>([])
  const [done, setDone] = useState(false)
  /** 家长还没让孩子说之前,答案是藏着的 —— 摊开来孩子会照着念 */
  const [showAnswer, setShowAnswer] = useState(false)

  if (!child || !currentChildId || items === undefined) {
    return <div className="pt-20 text-center text-3xl">🔎</div>
  }

  const list: SpotItem[] = items ?? []

  const mark = (ok: boolean) => {
    const next = [...marks]
    next[idx] = ok
    setMarks(next)
    setShowAnswer(false)
    if (idx + 1 >= list.length) {
      void saveSpotCheck(
        currentChildId,
        list.map((it, i) => ({ cardId: it.cardId, ok: !!next[i] })),
      )
      setDone(true)
    } else {
      setIdx(idx + 1)
    }
  }

  if (list.length === 0) {
    return (
      <div className="pt-16 px-6 text-center">
        <div className="text-5xl mb-3">🔎</div>
        <p className="font-medium text-gray-600">还不能抽查</p>
        <p className="mt-2 text-sm text-gray-400">
          抽查的是<b>系统认为他已经掌握</b>的内容 —— 现在还没攒够。
          先正常练几天,等有内容进入复习期了再来。
        </p>
        <button
          onClick={() => navigate('/learn')}
          className="mt-6 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95"
        >
          知道了
        </button>
      </div>
    )
  }

  if (done) {
    const passed = marks.filter(Boolean).length
    const res = scoreSpotCheck(passed, list.length)
    const prev = listSpotChecks(currentChildId)[1]
    return (
      <div className="pt-10 px-4 text-center">
        <div className="text-6xl mb-2">{res.rate >= 80 ? '🎯' : res.rate >= 50 ? '📈' : '🔧'}</div>
        <h1 className="text-2xl font-bold text-gray-800">
          说出来 {passed}/{list.length}
        </h1>
        <div className="mt-1 text-lg text-brand-600">真实掌握率 {res.rate}%</div>
        {prev && (
          <div className="mt-1 text-xs text-gray-400">
            上次是 {prev.rate}%
            {res.rate > prev.rate ? ' · 比上次高了' : res.rate < prev.rate ? ' · 比上次低一些' : ' · 和上次一样'}
          </div>
        )}
        {/* 说实话,但每一档都要说清楚接下来做什么,而不是只给一个评价 */}
        <p className="mt-5 rounded-2xl bg-white/70 p-4 text-left text-sm leading-relaxed text-gray-600">
          {res.note}
        </p>
        <div className="mt-4 space-y-2 text-left">
          {list.map((it, i) => (
            <div
              key={it.cardId}
              className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                marks[i] ? 'bg-mint-400/15' : 'bg-red-100/70'
              }`}
            >
              <span className="text-gray-700">
                {it.emoji ? `${it.emoji} ` : ''}
                {it.expect}
              </span>
              <span className="text-xs text-gray-400">
                {marks[i] ? '✅ 说出来了' : '↩︎ 退回重学'}
              </span>
            </div>
          ))}
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

  const it = list[idx]
  return (
    <div className="pt-4 pb-12">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => navigate('/learn')} className="p-1 text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <span className="flex-1 text-xs text-gray-400">
          {idx + 1}/{list.length}
        </span>
      </div>

      {/*
        这一段是给**家长**读的。
        整个功能的前提是屏幕不对着孩子 —— 说清楚这一点,它才成立。
      */}
      <div className="mb-6 rounded-2xl bg-sun-400/20 p-4">
        <div className="font-bold text-orange-800">把手机拿在自己手里,别让他看屏幕</div>
        <div className="mt-1 text-sm text-orange-700">
          照着下面问,他用嘴回答 —— 没有选项、没有图可以蒙
        </div>
      </div>

      <div className="rounded-3xl bg-white/80 p-8 text-center shadow-sm">
        <div className="text-xs text-gray-400">{it.deckName}</div>
        <div className="my-4 text-4xl font-bold leading-snug text-gray-800">{it.ask}</div>
        <div className="text-sm text-gray-500">问他:这个用英语/怎么说?</div>
        {showAnswer ? (
          <div className="mt-5 text-2xl font-bold text-brand-600">答案:{it.expect}</div>
        ) : (
          <button
            onClick={() => setShowAnswer(true)}
            className="mt-5 text-sm text-brand-500 underline"
          >
            点这里看答案
          </button>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => mark(false)}
          className="flex-1 rounded-2xl bg-white/80 py-3 font-bold text-gray-500 active:scale-95"
        >
          没说出来
        </button>
        <button
          onClick={() => mark(true)}
          className="flex-1 rounded-2xl bg-mint-500 py-3 font-bold text-white active:scale-95"
        >
          说出来了
        </button>
      </div>
      <p className="mt-5 text-[11px] leading-relaxed text-gray-400">
        没说出来的会<b>自动退回重学</b>,并排到下一组的最前面 ——
        抽查不只是一份报告,它会改变明天练什么。
      </p>
    </div>
  )
}
