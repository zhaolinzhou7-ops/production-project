import { readObject, writeObject } from './db'
import { todayISO } from '../core/dateUtils'
import { rollSticker, qualifiesForSticker, type StickerDef } from '../core/stickers'
import { stageOf, isFullyGrown } from '../core/pets'

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
  /** 累计喂食量(答对题数) */
  fed: number
  /** 已经养大出师的宠物(养满后可以再养一只) */
  graduated: string[]
}

const EMPTY_PET: PetState = { line: '', fed: 0, graduated: [] }

export function getPet(): PetState {
  const p = readObject<PetState>(PET_KEY, EMPTY_PET)
  return { line: p.line || '', fed: p.fed || 0, graduated: p.graduated || [] }
}

export function choosePet(line: string): void {
  const cur = getPet()
  writeObject(PET_KEY, { ...cur, line, fed: 0 })
}

/** 喂食:返回是否刚好进化了一级 */
export function feedPet(n: number): boolean {
  const cur = getPet()
  if (!cur.line || n <= 0) return false
  const before = stageOf(cur.fed)
  const fed = cur.fed + n
  writeObject(PET_KEY, { ...cur, fed })
  return stageOf(fed) > before
}

/** 养满了 → 收进「已出师」,腾出位置再养一只 */
export function graduatePet(): void {
  const cur = getPet()
  if (!cur.line || !isFullyGrown(cur.fed)) return
  writeObject(PET_KEY, {
    line: '',
    fed: 0,
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
