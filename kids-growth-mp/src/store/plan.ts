import { readObject, writeObject } from './db'
import { todayISO } from '../core/dateUtils'
import type { PlanStep } from '../core/dailyPlan'

/**
 * 今天这条路走到第几步了。
 *
 * 存起来而不是只放在内存里,是因为每一步都是一个独立的页面 ——
 * 中间他可能被叫去洗澡、可能手滑退出。回来还能接着上次那一步,
 * 而不是从头再来一遍(4 岁半的孩子重来一遍就不肯做了)。
 */

const KEY = 'todayPlan'

interface PlanState {
  date: string
  steps: PlanStep[]
  /** 已经做完几步 */
  done: number
}

const EMPTY: PlanState = { date: '', steps: [], done: 0 }

function read(): PlanState {
  const p = readObject<PlanState>(KEY, EMPTY)
  if (!p || p.date !== todayISO() || !Array.isArray(p.steps)) return { ...EMPTY, date: todayISO() }
  return { date: p.date, steps: p.steps, done: typeof p.done === 'number' ? p.done : 0 }
}

/** 今天已经排过路没有(排过就沿用,免得每次进首页顺序都在变) */
export function getPlan(): { steps: PlanStep[]; done: number } {
  const p = read()
  return { steps: p.steps, done: p.done }
}

export function savePlan(steps: PlanStep[]): void {
  writeObject(KEY, { date: todayISO(), steps, done: 0 })
}

/** 走完一步。返回下一步(没有就是 undefined,表示今天这条路走完了) */
export function advancePlan(): PlanStep | undefined {
  const p = read()
  const done = Math.min(p.steps.length, p.done + 1)
  writeObject(KEY, { ...p, done })
  return p.steps[done]
}

export function planStepAt(i: number): PlanStep | undefined {
  return read().steps[i]
}

/** 今天这条路走完了没有 */
export function planFinished(): boolean {
  const p = read()
  return p.steps.length > 0 && p.done >= p.steps.length
}
