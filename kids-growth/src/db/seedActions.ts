import { db } from './db'
import { DEFAULT_TASKS } from './seedData'
import { newId } from '../lib/id'

/** Adds the default task template for a child, skipping titles that already exist. */
export async function importDefaultTasks(childId: string): Promise<number> {
  return db.transaction('rw', db.tasks, async () => {
    const existingTitles = new Set(
      (await db.tasks.where('childId').equals(childId).toArray()).map((t) => t.title),
    )
    const toAdd = DEFAULT_TASKS.filter((t) => !existingTitles.has(t.title))
    if (toAdd.length === 0) return 0
    await db.tasks.bulkAdd(
      toAdd.map((t) => ({
        id: newId(),
        childId,
        title: t.title,
        icon: t.icon,
        category: t.category,
        type: t.type,
        points: t.points,
        active: true,
        createdAt: Date.now(),
      })),
    )
    return toAdd.length
  })
}
