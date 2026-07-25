import { useEffect, useState } from 'react'

/**
 * 答对时的视觉鼓励:一簇小花/星星/爱心从中间散开升起 + 中央一个大图章。
 * 每次答对都触发(trigger 变一次放一次),连击到里程碑时更盛大。
 *
 * 只用 CSS 动画,不引入额外依赖;尊重系统"减弱动态效果"设置。
 */

const PETALS = ['🌸', '🌟', '💖', '🌺', '✨', '🎉', '🌈', '🍀', '⭐', '🌼']
const STAMPS = ['🌸', '👏', '💯', '🎉', '🌟']
/** 连击里程碑用的更盛大图章 */
const BIG_STAMPS = ['🏆', '🎆', '🥳', '🚀']

export interface CorrectBurstProps {
  /** 每次答对把它 +1,即触发一次特效 */
  trigger: number
  /** 当前连击数:达到 3/5/10 时更盛大 */
  combo?: number
  /** 幼儿模式:图更大、飘得更久 */
  big?: boolean
}

interface Petal {
  id: number
  emoji: string
  dx: number
  dy: number
  rot: number
  delay: number
  size: number
}

export function CorrectBurst({ trigger, combo = 0, big = false }: CorrectBurstProps) {
  const [burst, setBurst] = useState<{ id: number; petals: Petal[]; stamp: string; grand: boolean } | null>(
    null,
  )

  useEffect(() => {
    if (trigger <= 0) return
    const grand = combo > 0 && combo % 5 === 0
    const count = grand ? 18 : big ? 12 : 9
    const petals: Petal[] = Array.from({ length: count }, (_, i) => {
      // 扇形散开:角度均分再加随机抖动
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6
      const dist = (grand ? 130 : 95) + Math.random() * 50
      return {
        id: i,
        emoji: PETALS[Math.floor(Math.random() * PETALS.length)],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - (grand ? 40 : 25),
        rot: (Math.random() - 0.5) * 260,
        delay: Math.random() * 140,
        size: (big ? 1.5 : 1.2) + Math.random() * 0.8,
      }
    })
    setBurst({
      id: trigger,
      petals,
      stamp: grand
        ? BIG_STAMPS[Math.floor(Math.random() * BIG_STAMPS.length)]
        : STAMPS[Math.floor(Math.random() * STAMPS.length)],
      grand,
    })
    const t = setTimeout(() => setBurst(null), grand ? 1800 : 1400)
    return () => clearTimeout(t)
  }, [trigger, combo, big])

  if (!burst) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
      {/* 中央大图章 */}
      <span
        className={`absolute animate-stamp-pop leading-none drop-shadow-lg ${
          burst.grand ? 'text-[7rem]' : big ? 'text-[5.5rem]' : 'text-[4.5rem]'
        }`}
      >
        {burst.stamp}
      </span>
      {/* 四散的花瓣 */}
      {burst.petals.map((p) => (
        <span
          key={p.id}
          className="absolute animate-petal-fly leading-none"
          style={
            {
              fontSize: `${p.size}rem`,
              animationDelay: `${p.delay}ms`,
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`,
            } as React.CSSProperties
          }
        >
          {p.emoji}
        </span>
      ))}
      {burst.grand && (
        <span className="absolute bottom-1/3 animate-stamp-pop text-lg font-extrabold text-sun-500 drop-shadow">
          连对 {combo} 题!
        </span>
      )}
    </div>
  )
}
