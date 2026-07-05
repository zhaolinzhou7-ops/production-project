import { addDays } from './dateUtils'

/** Consecutive-day streak ending today, or ending yesterday if today isn't checked in yet. */
export function computeStreak(doneDates: Set<string>, todayISO: string): number {
  let cursor = doneDates.has(todayISO) ? todayISO : addDays(todayISO, -1)
  let count = 0
  while (doneDates.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}
