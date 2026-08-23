import type { ReviewGrade, SrsStatus, StudyState } from '../types'
import { addDays, todayISO } from './dateUtils'

/** 掌握门槛:间隔达到该天数即视为 mastered */
const MASTERED_INTERVAL = 21
const MIN_EASE = 1.3
const DEFAULT_EASE = 2.5

/**
 * 幼儿档的间隔参数。
 *
 * 原先所有年龄共用一套 `1 → 3 → 8 → 20 天`,而那是 SM-2 的原始参数 ——
 * **给成年人背单词调的**。4–6 岁的遗忘曲线陡得多:一个词隔 8 天再见面,
 * 对他基本等于一个新词,前面那两次练习等于白做。
 *
 * 幼儿档改成 `1 → 2 → 4 → 7 → …`,并把难度系数上限压到 2.0
 * (成人档是 2.5,每次乘上去间隔涨得太快)。
 *
 * 这是全套系统里**改动最小、对记忆留存影响最大**的一处 ——
 * 比再加十个内容包都值。
 */
export interface SrsTuning {
  /** 第一次答对后隔几天 */
  first: number
  /** 第二次答对后隔几天 */
  second: number
  /** 难度系数上限 */
  maxEase: number
}

export const TUNING_ADULT: SrsTuning = { first: 1, second: 3, maxEase: 2.5 }
export const TUNING_TODDLER: SrsTuning = { first: 1, second: 2, maxEase: 2.0 }

export function tuningFor(stage: string): SrsTuning {
  return stage === 'toddler' ? TUNING_TODDLER : TUNING_ADULT
}

export interface SrsUpdate {
  due: string
  interval: number
  ease: number
  reps: number
  lapses: number
  status: SrsStatus
}

/** 新卡的初始 SRS 字段(未学) */
export function initialSrs(): SrsUpdate {
  return { due: todayISO(), interval: 0, ease: DEFAULT_EASE, reps: 0, lapses: 0, status: 'new' }
}

/**
 * SM-2 精简版:根据孩子的评分推进记忆状态。
 * again=不会(重来) / good=会 / easy=太简单(跳更远)。
 */
export function gradeCard(
  state: Pick<StudyState, 'interval' | 'ease' | 'reps' | 'lapses'>,
  grade: ReviewGrade,
  tuning: SrsTuning = TUNING_ADULT,
): SrsUpdate {
  let { interval, ease, reps, lapses } = state
  if (grade === 'again') {
    // 答错:降低难度系数、次日重来
    ease = Math.max(MIN_EASE, ease - 0.2)
    reps = 0
    lapses += 1
    interval = 1
  } else {
    reps += 1
    if (reps === 1) interval = tuning.first
    else if (reps === 2) interval = tuning.second
    else interval = Math.round(interval * Math.min(ease, tuning.maxEase))
    if (grade === 'easy') {
      ease += 0.15
      interval = Math.round(interval * 1.3)
    }
    interval = Math.max(1, interval)
  }

  const status: SrsStatus =
    grade === 'again' || reps === 0
      ? 'learning'
      : interval >= MASTERED_INTERVAL
        ? 'mastered'
        : 'review'

  return { due: addDays(todayISO(), interval), interval, ease, reps, lapses, status }
}

/** 一张卡今天是否到期(new 卡视为到期) */
export function isDue(state: Pick<StudyState, 'due' | 'status'>, today = todayISO()): boolean {
  return state.status === 'new' || state.due <= today
}
