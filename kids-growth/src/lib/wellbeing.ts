import { db } from '../db/db'
import { addDays, todayISO } from './dateUtils'
import { getAgeStage } from './ageStage'
import type { Child } from '../types'

const WINDOW_DAYS = 14
const NEGATIVE_MOODS = new Set(['烦躁', '焦虑', '难过', '愤怒'])
const NEGATIVE_DIARY_MOODS = new Set(['sad', 'tired'])
/** 触发关怀提示所需的近 14 天负面记录条数 */
const CARE_THRESHOLD = 3

export interface WellbeingHint {
  negativeCount: number
  windowDays: number
}

/**
 * 青春期关怀:初/高中孩子近两周情绪记录与家长日记心情持续偏低时,
 * 返回一个温和的提示(非诊断)。其余情况返回 null。
 */
export async function getWellbeingHint(child: Child): Promise<WellbeingHint | null> {
  const stage = getAgeStage(child.birthdate)
  if (stage !== 'junior' && stage !== 'senior') return null

  const since = addDays(todayISO(), -WINDOW_DAYS)

  const [emotions, diaries] = await Promise.all([
    db.records
      .where('[childId+module]')
      .equals([child.id, 'emotion'])
      .filter((r) => r.date >= since)
      .toArray(),
    db.diaryEntries
      .where('childId')
      .equals(child.id)
      .filter((d) => d.date >= since)
      .toArray(),
  ])

  let negativeCount = 0
  for (const r of emotions) {
    const mood = String(r.fields.mood ?? '')
    const intensity = Number(r.fields.intensity ?? 0)
    if (NEGATIVE_MOODS.has(mood) && (intensity === 0 || intensity >= 3)) negativeCount++
  }
  for (const d of diaries) {
    if (d.mood && NEGATIVE_DIARY_MOODS.has(d.mood)) negativeCount++
  }

  if (negativeCount < CARE_THRESHOLD) return null
  return { negativeCount, windowDays: WINDOW_DAYS }
}
