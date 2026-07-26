import { readObject, writeObject } from './db'
import { todayISO, addDays } from '../core/dateUtils'
import { computeStreak } from '../core/streak'
import { defaultHabitsFor, type HabitPeriod, type HabitTemplate } from '../core/habits'
import { getStage, adjustPoints } from './study'

// 习惯清单与打卡记录。
// habits:   家长配置的习惯清单(从模板初始化,可增删)
// habitLog: { 'YYYY-MM-DD': [habitId, ...] } —— 只记「做到了什么」,不记失败。

const HABITS_KEY = 'habits'
const LOG_KEY = 'habitLog'
const INIT_KEY = 'habitsInited'

export interface Habit {
  id: string
  name: string
  emoji: string
  period: HabitPeriod
  points: number
}

type HabitLog = Record<string, string[]>

function readLog(): HabitLog {
  return readObject<HabitLog>(LOG_KEY, {})
}

/** 首次使用时按当前学段装上默认习惯(只装一次,之后家长改了就不覆盖) */
export function ensureHabits(): Habit[] {
  const existing = readObject<Habit[]>(HABITS_KEY, [])
  if (existing.length > 0 || readObject<boolean>(INIT_KEY, false)) return existing
  const seeded: Habit[] = defaultHabitsFor(getStage()).map(toHabit)
  writeObject(HABITS_KEY, seeded)
  writeObject(INIT_KEY, true)
  return seeded
}

function toHabit(t: HabitTemplate): Habit {
  return { id: t.key, name: t.name, emoji: t.emoji, period: t.period, points: t.points }
}

export function listHabits(): Habit[] {
  return readObject<Habit[]>(HABITS_KEY, [])
}

export function addHabitFromTemplate(t: HabitTemplate): void {
  const list = listHabits()
  if (list.some((h) => h.id === t.key)) return
  writeObject(HABITS_KEY, [...list, toHabit(t)])
}

export function addCustomHabit(name: string, period: HabitPeriod, points = 5): void {
  const clean = name.trim()
  if (!clean) return
  const list = listHabits()
  writeObject(HABITS_KEY, [
    ...list,
    { id: `c-${Date.now().toString(36)}`, name: clean, emoji: '⭐', period, points },
  ])
}

export function removeHabit(id: string): void {
  writeObject(
    HABITS_KEY,
    listHabits().filter((h) => h.id !== id),
  )
}

// ---------------------------------------------------------------- 打卡

export function doneToday(): string[] {
  return readLog()[todayISO()] ?? []
}

export function isDone(id: string, date = todayISO()): boolean {
  return (readLog()[date] ?? []).includes(id)
}

/**
 * 勾选 / 取消勾选。
 *
 * 取消时会把加过的分**扣回去** —— 不是惩罚,是防止反复勾选刷分。
 * 漏做一天什么都不扣,记录里根本不存「没做」这件事。
 */
export function toggleHabit(id: string, date = todayISO()): boolean {
  const log = readLog()
  const day = log[date] ?? []
  const habit = listHabits().find((h) => h.id === id)
  const pts = habit?.points ?? 5
  let nowDone: boolean
  if (day.includes(id)) {
    log[date] = day.filter((x) => x !== id)
    adjustPoints(-pts)
    nowDone = false
  } else {
    log[date] = [...day, id]
    adjustPoints(pts)
    nowDone = true
  }
  writeObject(LOG_KEY, log)
  return nowDone
}

/** 某个习惯的连续达成天数 */
export function habitStreak(id: string): number {
  const log = readLog()
  const dates = new Set<string>()
  for (const [d, ids] of Object.entries(log)) {
    if (ids.includes(id)) dates.add(d)
  }
  return computeStreak(dates, todayISO())
}

/** 最近 7 天的打卡格子(用于一眼看规律) */
export function weekGrid(id: string): Array<{ date: string; done: boolean }> {
  const log = readLog()
  const today = todayISO()
  const out: Array<{ date: string; done: boolean }> = []
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i)
    out.push({ date: d, done: (log[d] ?? []).includes(id) })
  }
  return out
}

export interface HabitProgress {
  done: number
  total: number
}

export function todayProgress(): HabitProgress {
  const total = listHabits().length
  const done = doneToday().filter((id) => listHabits().some((h) => h.id === id)).length
  return { done, total }
}

/** 全部习惯都做到的连续天数(用于「全勤」类鼓励) */
export function allDoneStreak(): number {
  const habits = listHabits()
  if (habits.length === 0) return 0
  const log = readLog()
  const full = new Set<string>()
  for (const [d, ids] of Object.entries(log)) {
    if (habits.every((h) => ids.includes(h.id))) full.add(d)
  }
  return computeStreak(full, todayISO())
}
