/**
 * 等级阶梯:用「成长」的意象而不是排名,避免把孩子放进竞争框架。
 *
 * 设计取向(参考通行的儿童学习产品做法):
 * - 前几级门槛很低,让孩子第一天就能升一级,建立「我做得到」的感觉;
 * - 越往后越缓,但永远有下一级,不设终点;
 * - 只升不降 —— 不用扣级去惩罚,惩罚会让孩子回避而不是坚持。
 */
export interface LevelStep {
  level: number
  name: string
  emoji: string
  requiredXP: number
}

export const LEVELS: LevelStep[] = [
  { level: 1, name: '小种子', emoji: '🌰', requiredXP: 0 },
  { level: 2, name: '小嫩芽', emoji: '🌱', requiredXP: 30 },
  { level: 3, name: '小树苗', emoji: '🌿', requiredXP: 80 },
  { level: 4, name: '开花啦', emoji: '🌸', requiredXP: 160 },
  { level: 5, name: '结果子', emoji: '🍎', requiredXP: 300 },
  { level: 6, name: '小树', emoji: '🌳', requiredXP: 500 },
  { level: 7, name: '大树', emoji: '🌲', requiredXP: 800 },
  { level: 8, name: '小森林', emoji: '🏞️', requiredXP: 1200 },
  { level: 9, name: '学习小达人', emoji: '🎓', requiredXP: 1800 },
  { level: 10, name: '学习大师', emoji: '🏆', requiredXP: 2600 },
  { level: 11, name: '博学星', emoji: '🌟', requiredXP: 3600 },
  { level: 12, name: '智慧之光', emoji: '💫', requiredXP: 5000 },
]

export interface LevelInfo {
  cur: LevelStep
  next: LevelStep | null
  /** 距离下一级的进度 0~1(满级为 1) */
  progress: number
  /** 还差多少成长值升级(满级为 0) */
  toNext: number
}

export function levelOf(xp: number): LevelInfo {
  let cur = LEVELS[0]
  let next: LevelStep | null = null
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].requiredXP) {
      cur = LEVELS[i]
      next = LEVELS[i + 1] ?? null
    }
  }
  if (!next) return { cur, next: null, progress: 1, toNext: 0 }
  const span = next.requiredXP - cur.requiredXP
  const got = xp - cur.requiredXP
  return {
    cur,
    next,
    progress: Math.min(1, Math.max(0, got / span)),
    toNext: Math.max(0, next.requiredXP - xp),
  }
}
