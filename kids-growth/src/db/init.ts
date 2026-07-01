import { db } from './db'
import { DEFAULT_ACHIEVEMENTS, DEFAULT_LEVEL_LADDER } from './seedData'
import { newId } from '../lib/id'

const DEFAULT_PIN = '1234'

export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', db.settings, db.achievements, async () => {
    const settings = await db.settings.get('singleton')
    if (!settings) {
      await db.settings.add({
        id: 'singleton',
        parentPin: DEFAULT_PIN,
        theme: 'default',
        enablePenalty: false,
        levelLadder: DEFAULT_LEVEL_LADDER,
      })
    }

    const achievementCount = await db.achievements.count()
    if (achievementCount === 0) {
      await db.achievements.bulkAdd(
        DEFAULT_ACHIEVEMENTS.map((a) => ({ ...a, id: newId() })),
      )
    }
  })
}
