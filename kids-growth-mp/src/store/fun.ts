import { readObject, writeObject } from './db'
import { todayISO } from '../core/dateUtils'
import { rollSticker, qualifiesForSticker, type StickerDef } from '../core/stickers'
import { stageOf, isFullyGrown, toNextStage, stageProgress, getLine } from '../core/pets'

// 趣味化的本地存档:贴纸册、学习宠物、每日挑战。
// 都是很小的对象,直接按 key 存,不走「表」。

const STICKERS_KEY = 'stickers'
const PET_KEY = 'pet'
const CHALLENGE_KEY = 'challenge'

// ---------------------------------------------------------------- 贴纸册

export function ownedStickers(): string[] {
  return readObject<string[]>(STICKERS_KEY, [])
}

/**
 * 一次练习结束后结算贴纸:正确率够高就掉一张还没有的。
 * 返回掉落的贴纸(没掉落返回 undefined)。
 */
export function awardSticker(correct: number, total: number): StickerDef | undefined {
  if (!qualifiesForSticker(correct, total)) return undefined
  const owned = ownedStickers()
  const got = rollSticker(owned)
  if (!got) return undefined
  writeObject(STICKERS_KEY, [...owned, got.key])
  return got
}

export function resetStickers(): void {
  writeObject(STICKERS_KEY, [])
}

// ---------------------------------------------------------------- 宠物

export interface PetState {
  /** 进化线 key;空 = 还没选蛋 */
  line: string
  /** 当前这只累计喂了几口(答对题数) */
  fed: number
  /**
   * 每只宠物各自的进度。
   *
   * 为什么要按只分开记:孩子想换一只养的时候,原先的做法是把 fed 归零 ——
   * 辛辛苦苦喂到 40 口的小家伙,换一下就没了。五六岁的孩子只是好奇
   * 「别的蛋会变成什么」,不该为这点好奇付出清零的代价。
   * 分开记之后,换来换去都不丢,想回去接着养随时可以。
   */
  fedByLine: Record<string, number>
  /** 已经养大出师的宠物(养满后可以再养一只) */
  graduated: string[]
}

const EMPTY_PET: PetState = { line: '', fed: 0, fedByLine: {}, graduated: [] }

export function getPet(): PetState {
  const p = readObject<PetState>(PET_KEY, EMPTY_PET)
  const byLine =
    p && p.fedByLine && typeof p.fedByLine === 'object' ? p.fedByLine : {}
  const line = p.line || ''
  const fed = p.fed || 0
  // 老版本没有 fedByLine —— 把当前这只的进度补录进去,不然一换就丢
  if (line && byLine[line] === undefined) byLine[line] = fed
  return { line, fed, fedByLine: byLine, graduated: p.graduated || [] }
}

/**
 * 选一只来养 —— **随时可以换**,两边进度都不丢。
 * 换回来的时候它还在你上次离开的地方。
 */
export function choosePet(line: string): void {
  const cur = getPet()
  const byLine = { ...cur.fedByLine }
  // 先把当前这只的进度存好
  if (cur.line) byLine[cur.line] = cur.fed
  const fed = byLine[line] ?? 0
  byLine[line] = fed
  writeObject(PET_KEY, { ...cur, line, fed, fedByLine: byLine })
}

/**
 * 喂食的结果 —— 要让孩子**看见变化**,光返回一个布尔值不够。
 *
 * 孩子选了蛋之后,答完题只看到「宠物进化啦」或者什么都没有,
 * 中间那段「我喂了几口、离下一次变身还差多少」是完全黑的。
 * 而养成类最抓人的恰恰是这段过程 —— 看得见的一点点靠近。
 */
export interface FeedResult {
  /** 这一组喂了几口 */
  ate: number
  /** 喂之前 / 之后的总口数 */
  before: number
  after: number
  /** 阶段序号,变了就是进化了 */
  stageBefore: number
  stageAfter: number
  evolved: boolean
  /** 还差几口到下一阶段(已满级为 0) */
  toNext: number
  /** 喂之前 / 之后在当前阶段的进度 0–1,进度条从前者滑到后者 */
  progressBefore: number
  progress: number
  /** 进化前后的样子,用来做「从 X 变成 Y」的动画 */
  emojiBefore: string
  emojiAfter: string
  stageName: string
}

/** 喂食:返回是否刚好进化了一级 */
export function feedPet(n: number): boolean {
  return feedPetDetailed(n).evolved
}

/** 喂食并返回完整过程,界面据此做动态展示 */
export function feedPetDetailed(n: number): FeedResult {
  const cur = getPet()
  const line = cur.line ? getLine(cur.line) : undefined
  const before = cur.fed
  const stageBefore = stageOf(before)
  const empty: FeedResult = {
    ate: 0,
    before,
    after: before,
    stageBefore,
    stageAfter: stageBefore,
    evolved: false,
    toNext: toNextStage(before),
    progressBefore: stageProgress(before),
    progress: stageProgress(before),
    emojiBefore: line ? line.stages[stageBefore].emoji : '🥚',
    emojiAfter: line ? line.stages[stageBefore].emoji : '🥚',
    stageName: line ? line.stages[stageBefore].label : '',
  }
  if (!cur.line || n <= 0) return empty

  const after = before + n
  writeObject(PET_KEY, {
    ...cur,
    fed: after,
    fedByLine: { ...cur.fedByLine, [cur.line]: after },
  })
  const stageAfter = stageOf(after)
  return {
    ate: n,
    before,
    after,
    stageBefore,
    stageAfter,
    evolved: stageAfter > stageBefore,
    toNext: toNextStage(after),
    // 进化了就从 0 起画 —— 刚变身就该是新阶段的开头,而不是接着上一段
    progressBefore: stageAfter > stageBefore ? 0 : stageProgress(before),
    progress: stageProgress(after),
    emojiBefore: line ? line.stages[stageBefore].emoji : '🥚',
    emojiAfter: line ? line.stages[stageAfter].emoji : '🥚',
    stageName: line ? line.stages[stageAfter].label : '',
  }
}

/** 养满了 → 收进「已出师」,腾出位置再养一只 */
export function graduatePet(): void {
  const cur = getPet()
  if (!cur.line || !isFullyGrown(cur.fed)) return
  const byLine = { ...cur.fedByLine }
  delete byLine[cur.line]
  writeObject(PET_KEY, {
    line: '',
    fed: 0,
    fedByLine: byLine,
    graduated: [...cur.graduated, cur.line],
  })
}

export function resetPet(): void {
  writeObject(PET_KEY, EMPTY_PET)
}

// ---------------------------------------------------------------- 每日挑战

/** 每天的小目标:做完几组练习 */
export const DAILY_GOAL = 3

interface ChallengeState {
  date: string
  done: number
}

export function getChallenge(): { done: number; goal: number } {
  const c = readObject<ChallengeState>(CHALLENGE_KEY, { date: todayISO(), done: 0 })
  const done = c.date === todayISO() ? c.done : 0
  return { done, goal: DAILY_GOAL }
}

/** 完成一组练习 → 挑战进度 +1,返回是否刚好达标 */
export function bumpChallenge(): boolean {
  const today = todayISO()
  const c = readObject<ChallengeState>(CHALLENGE_KEY, { date: today, done: 0 })
  const before = c.date === today ? c.done : 0
  const done = before + 1
  writeObject(CHALLENGE_KEY, { date: today, done })
  return before < DAILY_GOAL && done >= DAILY_GOAL
}
