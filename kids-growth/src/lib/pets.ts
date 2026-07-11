import { db } from '../db/db'

// 学习宠物养成:选一颗蛋孵宠物,每答对一题喂一口,攒够就进化(有惊喜最终形态)。
// 存在 settings.pets(childId → {line, fed}),随备份导出。

export interface PetStage {
  emoji: string
  label: string
}

export interface PetLine {
  key: string
  eggName: string
  hint: string // 选蛋时的提示图
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
]

const lineByKey = new Map(PET_LINES.map((l) => [l.key, l]))

export interface PetState {
  line: PetLine
  fed: number
  stageIdx: number
  stage: PetStage
  /** 距下一次进化还差多少口;满级为 null */
  toNext: { need: number; have: number } | null
}

export function stageOf(fed: number): number {
  let idx = 0
  for (let i = 0; i < FEED_THRESHOLDS.length; i++) {
    if (fed >= FEED_THRESHOLDS[i]) idx = i
  }
  return idx
}

function toState(lineKey: string, fed: number): PetState | null {
  const line = lineByKey.get(lineKey)
  if (!line) return null
  const stageIdx = Math.min(stageOf(fed), line.stages.length - 1)
  const nextThreshold = FEED_THRESHOLDS[stageIdx + 1]
  return {
    line,
    fed,
    stageIdx,
    stage: line.stages[stageIdx],
    toNext:
      nextThreshold == null
        ? null
        : { need: nextThreshold - FEED_THRESHOLDS[stageIdx], have: fed - FEED_THRESHOLDS[stageIdx] },
  }
}

export async function getPet(childId: string): Promise<PetState | null> {
  const settings = await db.settings.get('singleton')
  const rec = settings?.pets?.[childId]
  if (!rec) return null
  return toState(rec.line, rec.fed)
}

/** 选蛋(已有宠物则不覆盖) */
export async function choosePet(childId: string, lineKey: string): Promise<PetState | null> {
  const settings = await db.settings.get('singleton')
  if (!settings || !lineByKey.has(lineKey)) return null
  if (settings.pets?.[childId]) return toState(settings.pets[childId].line, settings.pets[childId].fed)
  const pets = { ...(settings.pets ?? {}), [childId]: { line: lineKey, fed: 0 } }
  await db.settings.update('singleton', { pets })
  return toState(lineKey, 0)
}

export interface FeedResult {
  pet: PetState
  evolved: boolean
  fromStage?: PetStage
}

/** 喂食(答对题数);跨过阈值则返回进化信息 */
export async function feedPet(childId: string, amount: number): Promise<FeedResult | null> {
  if (amount <= 0) return null
  const settings = await db.settings.get('singleton')
  const rec = settings?.pets?.[childId]
  if (!settings || !rec) return null
  const before = stageOf(rec.fed)
  const fed = rec.fed + amount
  const pets = { ...(settings.pets ?? {}), [childId]: { line: rec.line, fed } }
  await db.settings.update('singleton', { pets })
  const state = toState(rec.line, fed)
  if (!state) return null
  const evolved = state.stageIdx > before
  return {
    pet: state,
    evolved,
    fromStage: evolved ? state.line.stages[before] : undefined,
  }
}
