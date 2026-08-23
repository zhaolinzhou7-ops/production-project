import { useEffect, useState } from 'react'
import type { MathVisual } from '../../types'

/**
 * 数形结合的图示 —— 把算式配上看得见的实物。
 *
 * 两件事:
 * 1. **看得见**:「5 + 5」对一个 5 岁的孩子是两个抽象符号,只能靠背;
 *    十颗糖他能数出来。数出来的答案是他自己得到的。
 * 2. **点得着**:5 岁的孩子数东西会用手指一个个点 —— 这不是坏习惯,
 *    是这个阶段必经的一步(「一一对应」)。屏幕上没有手指可点,
 *    他只能凭眼睛扫,很容易数错,然后以为自己不会算。
 *    点一下就亮起来并报数,等于把手指还给他。
 *
 * 减法画成「摆出来再划掉几个」,比另起一排更接近「拿走」这个动作。
 */
export function VisualMath({ visual, resetKey }: { visual: MathVisual; resetKey?: string | number }) {
  const [tapped, setTapped] = useState<string[]>([])

  // 换一道题就把数过的清空,否则上一题的高亮会留在屏幕上
  useEffect(() => {
    setTapped([])
  }, [resetKey])

  const toggle = (key: string, struck: boolean) => {
    // 划掉的不参与数数 —— 它们已经被拿走了
    if (struck) return
    setTapped((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  return (
    <div className="mb-6 flex flex-col items-center">
      {visual.groups.map((g, gi) => (
        <div key={gi} className="mt-1 flex flex-wrap items-center justify-center">
          {gi > 0 && (
            <span className="mr-2 text-2xl text-gray-400">{visual.ops[gi - 1] ?? '+'}</span>
          )}
          <div className="flex max-w-[19rem] flex-wrap justify-center">
            {Array.from({ length: g.n }).map((_, i) => {
              const struck = gi === 0 && !!visual.strike && i >= g.n - visual.strike
              const key = `${gi}-${i}`
              const counted = tapped.includes(key)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(key, struck)}
                  className={`m-0.5 text-3xl leading-none transition ${
                    struck
                      ? 'scale-75 opacity-25'
                      : counted
                        ? 'scale-110 drop-shadow-[0_0_6px_rgba(99,102,241,0.9)]'
                        : ''
                  }`}
                  aria-label={struck ? '已拿走' : counted ? '数过了' : '点一下数它'}
                >
                  {g.emoji}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {tapped.length > 0 && (
        <div className="mt-2 text-base font-bold text-brand-600">数到 {tapped.length}</div>
      )}
      <div className="mt-1 text-[11px] text-gray-400">
        {visual.strike ? '划掉的是拿走的 · ' : ''}可以点着数,数一个亮一个
      </div>
    </div>
  )
}
