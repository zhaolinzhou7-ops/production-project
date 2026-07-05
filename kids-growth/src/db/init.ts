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

    // 按 code 补齐缺失的成就(老库升级后能拿到新增的成就定义)
    const existingCodes = new Set((await db.achievements.toArray()).map((a) => a.code))
    const missing = DEFAULT_ACHIEVEMENTS.filter((a) => !existingCodes.has(a.code))
    if (missing.length > 0) {
      await db.achievements.bulkAdd(missing.map((a) => ({ ...a, id: newId() })))
    }
  })
}
