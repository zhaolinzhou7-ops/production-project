import Taro from '@tarojs/taro'

/**
 * 小程序本地存储封装(替代 Web 版的 Dexie/IndexedDB)。
 * 以「表名 → 数组/对象」的形式存取,同步 API,够学习模块用。
 * 云同步(批次 D)会在此之上加一层上/下行。
 */
export function readTable<T>(key: string): T[] {
  try {
    const v = Taro.getStorageSync(key)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

export function writeTable<T>(key: string, rows: T[]): void {
  try {
    Taro.setStorageSync(key, rows)
  } catch {
    /* 忽略:存储写入失败 */
  }
}

export function readObject<T>(key: string, fallback: T): T {
  try {
    const v = Taro.getStorageSync(key)
    return v == null || v === '' ? fallback : (v as T)
  } catch {
    return fallback
  }
}

export function writeObject<T>(key: string, value: T): void {
  try {
    Taro.setStorageSync(key, value)
  } catch {
    /* 忽略 */
  }
}

export const KEYS = {
  childId: 'childId',
  decks: 'decks',
  cards: 'cards',
  states: 'states',
  sessions: 'sessions',
  drills: 'drills',
  points: 'points',
} as const
