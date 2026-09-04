import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { ArrowLeft, Timer } from 'lucide-react'
import { db } from '../db/db'
import { CorrectBurst } from '../components/common/CorrectBurst'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { finishDrill, autoAddErrorCard } from '../db/study'
import { VisualMath } from '../components/common/VisualMath'
import { evaluateAchievements } from '../db/achievements'
import { computeLevelInfo, getChildPointStats } from '../lib/points'
import {
  MATH_TIERS,
  defaultTierFor,
  mathGroupsForTier,
  mathKindsForTier,
  tierOfKind,
  generateDrill,
  type MathKind,
  type MathProblem,
  type MathTier,
} from '../lib/mathDrill'
import { sfxCorrect, sfxWrong, sfxCombo, sfxFanfare, sfxSticker } from '../lib/sfx'
import { qualifiesForSticker, awardSticker, type StickerDef } from '../lib/stickers'
import { feedPet, type FeedResult } from '../lib/pets'
import { LevelUpModal } from '../components/points/LevelUpModal'
import { AchievementUnlockModal } from '../components/points/AchievementUnlockModal'
import type { Achievement, LevelStep } from '../types'

type Screen = 'config' | 'run' | 'done'
const COUNT_OPTIONS = [10, 20, 30]

export function MathDrillPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child, stage, tone } = useCurrentChild()

  /*
    做题状态放到**地址里**(?run=1),不是放在组件 state 里。

    这样浏览器的返回键天然退回选题页,而不是一步跳回学习首页 ——
    实际用起来几乎每次都是连着做两三组,回首页再点进来要三下。
    返回键是系统的,页面拦不住它;唯一可靠的办法就是让它有一层可退的历史。
  */
  const [searchParams, setSearchParams] = useSearchParams()
  const running = searchParams.get('run') === '1'
  const [screen, setScreen] = useState<Screen>('config')
  /*
    难度档跟着学段走 —— 幼儿一进来看到的就该是「10 以内加法」这一档,
    而不是先在乘除法里翻半天。选过之后由家长自己切。
  */
  const [tier, setTier] = useState<MathTier>(() => defaultTierFor(stage))
  const [kind, setKind] = useState<MathKind>(
    () => mathKindsForTier(defaultTierFor(stage))[0]?.kind ?? 'add',
  )
  /*
    切档之后如果当前题型不在这一档里,自动落到这一档的第一个 ——
    否则「选了幼儿档,开始做却出来一道鸡兔同笼」。
  */
  useEffect(() => {
    if (tierOfKind(kind) !== tier) {
      const first = mathKindsForTier(tier)[0]
      if (first) setKind(first.kind)
    }
  }, [tier, kind])
  const [count, setCount] = useState(20)
  const [problems, setProblems] = useState<MathProblem[]>([])
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [correct, setCorrect] = useState(0)
  const [feedback, setFeedback] = useState<'none' | 'ok' | 'no'>('none')
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [summary, setSummary] = useState<{ correct: number; total: number; points: number; sec: number; capped: boolean } | null>(null)
  const [levelUp, setLevelUp] = useState<LevelStep | null>(null)
  const [newAch, setNewAch] = useState<Achievement | null>(null)
  const [combo, setCombo] = useState(0)
  const [burst, setBurst] = useState(0)
  const [wonSticker, setWonSticker] = useState<StickerDef | null>(null)
  const [petResult, setPetResult] = useState<FeedResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** 点选题:他点的是第几个(0 = 还没点)—— 只用来画高亮,判分在 submit 里 */
  const [chosen, setChosen] = useState(0)

  // 计时器
  useEffect(() => {
    if (screen !== 'run') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250)
    return () => clearInterval(t)
  }, [screen, startedAt])

  const start = () => {
    // 推一条历史,返回键就能退回选题页
    setSearchParams({ run: '1', kind, count: String(count) })
  }

  // 地址里带上 run=1 就开一组新题;返回键把它去掉,自动回到选题页
  useEffect(() => {
    if (!running) {
      setScreen('config')
      setSummary(null)
      return
    }
    const k = (searchParams.get('kind') as MathKind) || kind
    const n = Number(searchParams.get('count')) || count
    setProblems(generateDrill(k, n, stage))
    setIdx(0)
    setCorrect(0)
    setCombo(0)
    setWonSticker(null)
    setInput('')
    setFeedback('none')
    setStartedAt(Date.now())
    setElapsed(0)
    setScreen('run')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const finish = useCallback(
    async (finalCorrect: number, total: number, sec: number) => {
      if (!currentChildId || !child) return
      const settings = await db.settings.get('singleton')
      const before = await getChildPointStats(currentChildId)
      const res = await finishDrill({ childId: currentChildId, kind, total, correct: finalCorrect, durationSec: sec })
      setSummary({ correct: finalCorrect, total, points: res.pointsAwarded, sec, capped: res.capped })
      if (settings) {
        const lvBefore = computeLevelInfo(before.xp, settings.levelLadder).level
        const lvAfter = computeLevelInfo(res.newXp, settings.levelLadder).level
        if (lvAfter.level > lvBefore.level) setLevelUp(lvAfter)
      }
      const unlocked = await evaluateAchievements(currentChildId)
      if (unlocked.length > 0) setNewAch(unlocked[0])
      // 练得好掉落贴纸
      if (qualifiesForSticker(finalCorrect, total)) {
        const win = await awardSticker(currentChildId)
        if (win) {
          setWonSticker(win)
          setTimeout(sfxSticker, 500)
        }
      }
      // 喂宠物
      const fedRes = await feedPet(currentChildId, finalCorrect)
      if (fedRes) {
        setPetResult(fedRes)
        if (fedRes.evolved) setTimeout(sfxSticker, 900)
      }
      sfxFanfare()
      if (tone === 'playful') confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } })
      setScreen('done')
    },
    [currentChildId, child, kind, tone],
  )

  /**
   * 交卷。
   * `picked` 是点选题选中的第几个(从 1 开始);输入题不传,走输入框。
   */
  const submit = (picked?: number) => {
    if (feedback !== 'none') return
    const val = Number(input.trim())
    const isRight =
      picked !== undefined
        ? picked === problems[idx].answer
        : input.trim() !== '' && val === problems[idx].answer
    const nextCorrect = correct + (isRight ? 1 : 0)
    setCorrect(nextCorrect)
    setFeedback(isRight ? 'ok' : 'no')
    if (isRight) {
      const nextCombo = combo + 1
      setCombo(nextCombo)
      setBurst((b) => b + 1)
      if (nextCombo >= 3 && nextCombo % 3 === 0) sfxCombo(Math.floor(nextCombo / 3))
      else sfxCorrect()
    } else {
      setCombo(0)
      sfxWrong()
      // 算错的题自动进错题本(同题去重)
      if (currentChildId) {
        /*
          算错的题以「能重新算一遍」的形式进错题本:带上答案和那张图。
          看一眼答案,他记住的是答案;自己再算一遍,他练到的才是这道题。
        */
        void autoAddErrorCard(currentChildId, {
          front: problems[idx].text.trim(),
          back: String(problems[idx].answer),
          subject: '数学',
          /*
            重做时的形式要和做题时**一模一样** —— 点选题错了不能变成让他打字。
            这是定过的规矩:「错了什么类型的题就归入什么错题,不要换类型」。
          */
          redo: problems[idx].choices
            ? {
                type: 'choice',
                options: problems[idx].choices!.map((c) => c.label),
                answer:
                  problems[idx].choices![problems[idx].answer - 1]?.label ??
                  String(problems[idx].answer),
                optionKind: problems[idx].choices![0]?.kind === 'text' ? 'text' : 'emoji',
              }
            : { type: 'input', answer: problems[idx].answer, visual: problems[idx].visual },
        })
      }
    }
    setTimeout(() => {
      if (idx + 1 >= problems.length) {
        void finish(nextCorrect, problems.length, Math.floor((Date.now() - startedAt) / 1000))
      } else {
        setIdx(idx + 1)
        setInput('')
        setChosen(0)
        setFeedback('none')
        inputRef.current?.focus()
      }
    }, isRight ? 450 : 1100)
  }

  if (!child || !currentChildId) return null

  // ---- 配置 ----
  if (screen === 'config') {
    return (
      <div className="pt-4 pb-10">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/learn')} className="p-1 text-gray-500">
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">口算练习 🧮</h1>
        </div>

        {/*
          ---- w69:按难度档 + 分组,不再把 40 多种题型平铺一屏 ----

          题型从 6 种长到 40 多种之后,平铺出来家长要在一屏里扫四十个格子,
          而其中大半(鸡兔同笼、盈亏问题)对这个孩子根本用不上。
          先按学段给一档,再按「加 / 减 / 数与量 / 思维 / 英语」分组 ——
          找题从「扫四十个」变成「先挑一组,再挑一个」。
        */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">难度</span>
          <div className="flex gap-1.5">
            {MATH_TIERS.map((t) => (
              <button
                key={t.tier}
                onClick={() => setTier(t.tier)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  tier === t.tier ? 'bg-brand-500 text-white' : 'bg-white/70 text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-gray-400">
          {MATH_TIERS.find((t) => t.tier === tier)?.desc}
        </p>

        {mathGroupsForTier(tier).map((g) => (
          <div key={g.def.group} className="mb-4">
            <div className="mb-1.5 text-xs font-bold text-gray-500">
              {g.def.icon} {g.def.label}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {g.kinds.map((k) => (
                <button
                  key={k.kind}
                  onClick={() => setKind(k.kind)}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-left transition active:scale-95 ${
                    kind === k.kind ? 'bg-brand-500 text-white shadow-sm' : 'bg-white/70 text-gray-700'
                  }`}
                >
                  <span className="text-xl">{k.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-bold text-sm">{k.label}</span>
                    <span
                      className={`block text-[11px] ${kind === k.kind ? 'text-white/80' : 'text-gray-400'}`}
                    >
                      {k.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="text-sm font-medium text-gray-500 mb-2">题目数量</div>
        <div className="flex gap-2 mb-8">
          {COUNT_OPTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`flex-1 rounded-2xl py-3 font-bold transition active:scale-95 ${
                count === c ? 'bg-brand-500 text-white' : 'bg-white/70 text-gray-600'
              }`}
            >
              {c} 题
            </button>
          ))}
        </div>

        <button
          onClick={start}
          className="w-full rounded-2xl bg-gradient-to-r from-brand-400 to-brand-500 py-4 font-bold text-white shadow-sm active:scale-95 transition"
        >
          开始限时口算
        </button>
        <p className="mt-3 text-[11px] text-gray-400">题目随机生成、限时作答,答对越多、用时越短越棒;答对即得积分。</p>
      </div>
    )
  }

  // ---- 结算 ----
  if (screen === 'done' && summary) {
    const pct = summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0
    const avg = summary.total > 0 ? (summary.sec / summary.total).toFixed(1) : '0'
    return (
      <>
        <div className="pt-12 text-center px-6">
          <div className="text-6xl mb-3">{pct >= 90 ? '🏆' : pct >= 70 ? '🌟' : '💪'}</div>
          <h1 className="text-2xl font-bold text-gray-800">练完啦!</h1>
          <div className="mt-6 rounded-3xl bg-white/70 p-6 shadow-sm max-w-xs mx-auto">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xl font-bold text-gray-800">{summary.correct}/{summary.total}</div>
                <div className="text-[10px] text-gray-400">答对</div>
              </div>
              <div>
                <div className="text-xl font-bold text-brand-500">{summary.sec}s</div>
                <div className="text-[10px] text-gray-400">用时(均 {avg}s/题)</div>
              </div>
              <div>
                <div className="text-xl font-bold text-sun-500">+{summary.points}</div>
                <div className="text-[10px] text-gray-400">积分</div>
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
          <div className="mt-8 flex gap-3 justify-center">
            <button
              onClick={() => navigate('/learn')}
              className="rounded-2xl bg-white/80 px-6 py-3 font-bold text-gray-600 active:scale-95 transition"
            >
              回学习首页
            </button>
            {/*
              做完之后**先回到选题页**,不是学习首页 —— 浏览器返回键也是这个行为,
              两边一致,不会让人愣一下。
            */}
            <button
              onClick={() => navigate(-1)}
              className="rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white active:scale-95 transition"
            >
              ← 再来一组
            </button>
          </div>
        </div>
        <LevelUpModal level={levelUp} tone={tone} onClose={() => setLevelUp(null)} />
        <AchievementUnlockModal achievement={newAch} tone={tone} onClose={() => setNewAch(null)} />
      </>
    )
  }

  // ---- 作答 ----
  const p = problems[idx]
  const progress = (idx / problems.length) * 100
  return (
    <div className="pt-4 pb-10 min-h-screen flex flex-col">
      <CorrectBurst trigger={burst} combo={combo} big={stage === 'toddler'} />
      <div className="flex items-center gap-3 mb-6">
        {/* 中途退出退回选题页 —— 通常是想换个题型,不是想离开 */}
        <button onClick={() => navigate(-1)} className="text-gray-400 text-sm">
          ‹ 退出
        </button>
        <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-400 tabular-nums">
          <Timer size={13} /> {elapsed}s
        </span>
        <span className="text-xs text-gray-400 tabular-nums">{idx + 1}/{problems.length}</span>
      </div>

      <div className="h-7 text-center">
        {combo >= 2 && (
          <span
            key={combo}
            className="animate-combo-pulse inline-block rounded-full bg-orange-100 px-3 py-0.5 text-sm font-bold text-orange-500"
          >
            🔥 连对 {combo}
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {/*
          数形结合:算式上面把实物摆出来,而且可以点着数。
          他先数出答案,慢慢才把「5 + 5」这个符号和那堆糖对上 ——
          这个顺序反过来就成了死记硬背。
        */}
        {p.visual && <VisualMath visual={p.visual} resetKey={idx} />}

        {/*
          **钟面。**
          emoji 里的 🕒 只有十二个固定整点、而且小到看不清指针 ——
          认时间这道题的全部内容就在指针上,所以只能自己画一个。
          时针要跟着分钟走(3:30 的时针在 3 和 4 中间),
          画成正对着 3 的话,教给他的是错的。
        */}
        {p.clock && (
          <div className="relative mb-6 h-52 w-52 rounded-full border-8 border-slate-300 bg-white shadow-sm">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h, i) => (
              <span
                key={h}
                className="absolute left-1/2 top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center text-sm font-bold text-slate-600"
                style={{ transform: `rotate(${i * 30}deg) translateY(-82px) rotate(${-i * 30}deg)` }}
              >
                {h}
              </span>
            ))}
            <span
              className="absolute bottom-1/2 left-1/2 -ml-[3px] w-[6px] rounded bg-slate-700"
              style={{
                height: 52,
                transformOrigin: '50% 100%',
                transform: `rotate(${((p.clock.hour % 12) + p.clock.minute / 60) * 30}deg)`,
              }}
            />
            <span
              className="absolute bottom-1/2 left-1/2 -ml-[2px] w-[4px] rounded bg-brand-500"
              style={{
                height: 78,
                transformOrigin: '50% 100%',
                transform: `rotate(${p.clock.minute * 6}deg)`,
              }}
            />
            <span className="absolute left-1/2 top-1/2 -ml-[6px] -mt-[6px] h-3 w-3 rounded-full bg-slate-700" />
          </div>
        )}

        {/*
          **方位图。**
          「在盒子里面」用任何 emoji 组合都表达不了 ——
          试过用 ASCII 方括号 `[ 🐰 ]`,孩子看到的是两个字符,不是一个盒子。
          所以画一个真的方框,把东西摆进去 / 摆上面 / 摆下面 / 摆旁边。
        */}
        {p.spatial && (
          <div className="mb-6 flex flex-col items-center">
            {p.spatial.where === 'above' && <span className="my-1 text-5xl">{p.spatial.thing}</span>}
            <div className="flex items-center">
              <div className="flex h-24 w-32 items-center justify-center rounded-xl border-4 border-dashed border-slate-400 bg-white/70">
                {p.spatial.where === 'in' && <span className="text-5xl">{p.spatial.thing}</span>}
              </div>
              {p.spatial.where === 'beside' && <span className="mx-2 text-5xl">{p.spatial.thing}</span>}
            </div>
            {p.spatial.where === 'below' && <span className="my-1 text-5xl">{p.spatial.thing}</span>}
          </div>
        )}

        <div className="mb-6 whitespace-pre-line text-center text-4xl font-bold leading-snug text-gray-800">
          {p.text}
        </div>

        {/*
          **点选题:点一下就是作答,不用打字。**

          思维板块(找不同类、找不同、比长短、找规律)原先每一道都要求
          读题、然后输入一个序号 ——「1.🍎 2.🚗 …(答序号)」。
          一个不识字的 4 岁半明明一眼就知道苹果不是车,却因为不会输入而做不了。
          题目考的东西被交互挡在了外面。
        */}
        {p.choices ? (
          <div
            className={`mb-6 flex w-full max-w-sm flex-wrap justify-center gap-4 ${
              p.choices[0]?.kind === 'row' ? 'flex-col' : ''
            }`}
          >
            {p.choices.map((c, i) => {
              const n = i + 1
              const show = feedback !== 'none'
              const right = show && n === p.answer
              const wrong = show && n === chosen && n !== p.answer
              return (
                <button
                  key={`${c.label}-${i}`}
                  disabled={feedback !== 'none'}
                  onClick={() => {
                    if (feedback !== 'none') return
                    setChosen(n)
                    submit(n)
                  }}
                  className={`flex min-h-[88px] items-center justify-center rounded-2xl px-4 py-3 shadow-sm transition active:scale-95 ${
                    c.kind === 'row' ? 'w-full justify-start' : 'w-[44%]'
                  } ${
                    right
                      ? 'bg-mint-400/40'
                      : wrong
                        ? 'animate-tap-shake bg-red-200'
                        : chosen === n
                          ? 'animate-tap-pop bg-white'
                          : 'bg-white/85'
                  }`}
                >
                  <span
                    className={
                      c.kind === 'text'
                        ? 'text-2xl font-bold text-gray-800'
                        : c.kind === 'row'
                          ? 'break-all text-3xl leading-snug'
                          : 'text-5xl leading-none'
                    }
                  >
                    {c.label}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mb-8 flex items-center gap-3 text-5xl font-bold text-gray-800">
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^0-9-]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              inputMode="numeric"
              disabled={feedback !== 'none'}
              className={`w-32 rounded-2xl border-2 px-3 py-2 text-center outline-none transition ${
                feedback === 'ok'
                  ? 'border-mint-500 text-mint-600'
                  : feedback === 'no'
                    ? 'border-red-400 text-red-500'
                    : 'border-gray-200 focus:border-brand-400 text-gray-800'
              }`}
              placeholder="?"
            />
          </div>
        )}

        {/* 点选题的正确答案已经在选项上标出来了,不用再写一遍序号 */}
        {feedback === 'no' && !p.choices && (
          <div className="mb-4 text-lg text-red-500">正确答案:{p.answer}</div>
        )}

        {/*
          点选题**不给「确定」按钮** —— 点了选项就已经答完了,
          再让他找一个确定键,等于多设一道他不认识的门槛。
        */}
        {!p.choices && (
          <button
            onClick={() => submit()}
            disabled={feedback !== 'none' || input.trim() === ''}
            className="rounded-2xl bg-brand-500 px-10 py-3 font-bold text-white active:scale-95 transition disabled:opacity-40"
          >
            {feedback === 'none' ? '确定' : feedback === 'ok' ? '✓ 答对了' : '看下一题'}
          </button>
        )}
      </div>
    </div>
  )
}
