import type { ReviewGrade, SrsStatus, StudyState } from '../types'
import { addDays, todayISO } from './dateUtils'

/** 掌握门槛:间隔达到该天数即视为 mastered */
const MASTERED_INTERVAL = 21
const MIN_EASE = 1.3
const DEFAULT_EASE = 2.5

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
export function gradeCard(state: Pick<StudyState, 'interval' | 'ease' | 'reps' | 'lapses'>, grade: ReviewGrade): SrsUpdate {
  let { interval, ease, reps, lapses } = state
  if (grade === 'again') {
    // 答错:降低难度系数、次日重来
    ease = Math.max(MIN_EASE, ease - 0.2)
    reps = 0
    lapses += 1
    interval = 1
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 3
    else interval = Math.round(interval * ease)
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
