import Taro from '@tarojs/taro'

/**
 * 小程序本地存储封装(替代网页版的 Dexie/IndexedDB)。
 *
 * ⚠️ 这一层的性能直接决定了整个小程序跟手不跟手。
 *
 * 最初的实现是每次读写都直连 `Taro.getStorageSync/setStorageSync`。看着没问题,
 * 但卡组装满之后:cards 表 1400+ 条(约 300KB),而**每一次 getStorageSync 都要把
 * 整张表反序列化一遍**。首页刷新一次会读十几遍 → 几 MB 的解析;每答对一题
 * 写一次 states 表 → 又是整表序列化。真机上就表现为「点哪儿都要等一下」。
 *
 * 所以这里加两层:
 * 1. **内存缓存**:读走缓存,一次会话里同一张表只反序列化一次。
 * 2. **合并写盘**:写只更新内存并打个脏标记,300ms 内的多次写合并成一次落盘;
 *    切后台(app.ts 的 useHide)与关键节点会强制 flush,不会丢数据。
 */
const cache = new Map<string, unknown>()
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

/** 合并写盘的等待时间:够把一串连续写攒到一起,又短到切后台前基本已经落盘 */
const FLUSH_DELAY = 300

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushNow()
  }, FLUSH_DELAY)
}

/** 立刻把脏数据写进存储。切后台、会话结束、兑换奖励等关键节点要主动调。 */
export function flushNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  for (const key of dirty) {
    try {
      Taro.setStorageSync(key, cache.get(key))
    } catch {
      /* 忽略:存储写入失败(通常是超出配额) */
    }
  }
  dirty.clear()
}

function readRaw(key: string): unknown {
  if (cache.has(key)) return cache.get(key)
  let v: unknown = ''
  try {
    v = Taro.getStorageSync(key)
  } catch {
    v = ''
  }
  cache.set(key, v)
  return v
}

export function readTable<T>(key: string): T[] {
  const v = readRaw(key)
  return Array.isArray(v) ? (v as T[]) : []
}

export function writeTable<T>(key: string, rows: T[]): void {
  cache.set(key, rows)
  dirty.add(key)
  scheduleFlush()
}

export function readObject<T>(key: string, fallback: T): T {
  const v = readRaw(key)
  return v == null || v === '' ? fallback : (v as T)
}

export function writeObject<T>(key: string, value: T): void {
  cache.set(key, value)
  dirty.add(key)
  scheduleFlush()
}

/** 清空本地数据时要连缓存一起清,否则旧数据会被缓存「复活」 */
export function clearAll(): void {
  cache.clear()
  dirty.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    Taro.clearStorageSync()
  } catch {
    /* 忽略 */
  }
}

/** 仅供自测使用:丢掉内存缓存,强制下次从存储重新读 */
export function __resetCache(): void {
  cache.clear()
  dirty.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
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

/**
 * 存储里现在有哪些 key。
 *
 * 备份用它来**枚举全部数据**,而不是照着一份手写的清单抄 ——
 * 手写清单一定会漏:这个项目里散着二十多个 key(pet/habits/rewards/
 * talkRecords/myVoices/childProfile……),我每加一个功能就多一个,
 * 漏掉哪个,用户就会在恢复之后发现「宠物还在,打卡记录没了」。
 */
export function allKeys(): string[] {
  try {
    const info = Taro.getStorageInfoSync()
    const keys = info && Array.isArray(info.keys) ? info.keys : []
    // 缓存里可能有还没落盘的新 key,一并算上
    for (const k of cache.keys()) if (!keys.includes(k)) keys.push(k)
    return keys
  } catch {
    return [...cache.keys()]
  }
}

/** 读原始值(备份用,不做类型加工) */
export function readAny(key: string): unknown {
  return readRaw(key)
}

/** 写原始值(恢复用) */
export function writeAny(key: string, value: unknown): void {
  cache.set(key, value)
  dirty.add(key)
  scheduleFlush()
}
