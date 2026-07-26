// 学习宠物养成(从网页版原样移植的进化线)。
// 选一颗蛋孵宠物,每答对一题喂一口,攒够就进化;养满可以再养一只。

export interface PetStage {
  emoji: string
  label: string
}

export interface PetLine {
  key: string
  eggName: string
  /** 选蛋时的提示图 */
  hint: string
  stages: PetStage[]
}

/** 各阶段所需累计喂食量(答对题数) */
export const FEED_THRESHOLDS = [0, 15, 40, 80, 150, 250]

export const PET_LINES: PetLine[] = [
  {
    key: 'chick',
    eggName: '小鸡蛋',
    hint: '🐤',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🐣', label: '破壳啦' },
      { emoji: '🐥', label: '小毛球' },
      { emoji: '🐤', label: '小小鸡' },
      { emoji: '🐓', label: '大公鸡' },
      { emoji: '🦚', label: '开屏孔雀' },
    ],
  },
  {
    key: 'cat',
    eggName: '小猫蛋',
    hint: '🐱',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🐱', label: '小猫咪' },
      { emoji: '😺', label: '开心猫' },
      { emoji: '🐈', label: '大猫' },
      { emoji: '🐯', label: '小老虎' },
      { emoji: '🦁', label: '森林之王' },
    ],
  },
  {
    key: 'dino',
    eggName: '恐龙蛋',
    hint: '🦖',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🦎', label: '小蜥蜴' },
      { emoji: '🦕', label: '小恐龙' },
      { emoji: '🦖', label: '霸王龙' },
      { emoji: '🐲', label: '小神龙' },
      { emoji: '🐉', label: '神龙' },
    ],
  },
  {
    key: 'bunny',
    eggName: '小兔蛋',
    hint: '🐰',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🐰', label: '小兔叽' },
      { emoji: '🐇', label: '蹦蹦兔' },
      { emoji: '🦘', label: '袋鼠跳跳' },
      { emoji: '🦌', label: '小花鹿' },
      { emoji: '🦄', label: '独角兽' },
    ],
  },
  {
    key: 'ocean',
    eggName: '海洋蛋',
    hint: '🐠',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🐟', label: '小鱼儿' },
      { emoji: '🐠', label: '彩虹鱼' },
      { emoji: '🐬', label: '小海豚' },
      { emoji: '🦈', label: '大鲨鱼' },
      { emoji: '🐋', label: '鲸鱼王' },
    ],
  },
  {
    key: 'bear',
    eggName: '毛球蛋',
    hint: '🐼',
    stages: [
      { emoji: '🥚', label: '神秘的蛋' },
      { emoji: '🐹', label: '小毛团' },
      { emoji: '🐻', label: '小棕熊' },
      { emoji: '🐼', label: '胖达' },
      { emoji: '🐻‍❄️', label: '冰雪熊' },
      { emoji: '🧸', label: '传说泰迪' },
    ],
  },
]

export function getLine(key: string): PetLine | undefined {
  return PET_LINES.find((l) => l.key === key)
}

/** 累计喂食量 → 当前处于第几个形态 */
export function stageOf(fed: number): number {
  let s = 0
  for (let i = 0; i < FEED_THRESHOLDS.length; i++) {
    if (fed >= FEED_THRESHOLDS[i]) s = i
  }
  return s
}

/** 距离下一次进化还差几口(已是最终形态返回 0) */
export function toNextStage(fed: number): number {
  const s = stageOf(fed)
  if (s >= FEED_THRESHOLDS.length - 1) return 0
  return FEED_THRESHOLDS[s + 1] - fed
}

export function isFullyGrown(fed: number): boolean {
  return stageOf(fed) >= FEED_THRESHOLDS.length - 1
}
