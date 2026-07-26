import { View, Text } from '@tarojs/components'
import './CorrectBurst.scss'

/**
 * 答对时的鼓励特效:一圈花瓣从中心四散 + 中间一个大图章。
 *
 * 小程序没有 canvas 彩带库,这里用纯 CSS 动画做 —— 元素少、不占主线程,
 * 低端机上也不会卡。连击到整数关口时更盛大一点(花瓣更多、图章更大)。
 */
const PETALS = ['🌸', '🌺', '🌼', '⭐', '✨', '🎉', '💖', '🌟']

export interface CorrectBurstProps {
  /** 每答对一次就换一个新的值,用来重新触发动画 */
  seed: number
  /** 当前连对次数,用于决定隆重程度 */
  combo: number
}

export default function CorrectBurst({ seed, combo }: CorrectBurstProps) {
  const grand = combo > 0 && combo % 5 === 0
  const count = grand ? 18 : 10
  const items: Array<{ key: string; emoji: string; x: number; y: number; delay: number }> = []
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i
    const dist = grand ? 190 : 130
    const rad = (angle * Math.PI) / 180
    items.push({
      key: `${seed}-${i}`,
      emoji: PETALS[i % PETALS.length],
      x: Math.round(Math.cos(rad) * dist),
      y: Math.round(Math.sin(rad) * dist),
      delay: (i % 4) * 40,
    })
  }

  return (
    <View className='burst' key={seed}>
      {items.map((it) => (
        <Text
          key={it.key}
          className='burst__petal'
          style={{
            // CSS 变量在小程序里可用,动画读它决定飞行方向
            '--dx': `${it.x}rpx`,
            '--dy': `${it.y}rpx`,
            animationDelay: `${it.delay}ms`,
          } as React.CSSProperties}
        >
          {it.emoji}
        </Text>
      ))}
      <Text className={grand ? 'burst__stamp burst__stamp--grand' : 'burst__stamp'}>
        {grand ? `${combo} 连对!` : '答对啦'}
      </Text>
    </View>
  )
}
