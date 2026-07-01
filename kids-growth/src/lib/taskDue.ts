import type { Task } from '../types'
import { weekdayOf } from './dateUtils'

/** Whether a task is scheduled on the given date, ignoring completion state for 'once' tasks. */
export function isTaskScheduledOn(task: Task, dateISO: string): boolean {
  if (task.type === 'daily') return true
  if (task.type === 'weekly') return task.weeklyDays?.includes(weekdayOf(dateISO)) ?? false
  return true // 'once' — caller filters out already-completed ones
}
