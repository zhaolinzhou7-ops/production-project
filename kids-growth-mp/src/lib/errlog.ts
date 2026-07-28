import Taro from '@tarojs/taro'
import { BUILD_TAG } from './version'

/**
 * 运行时报错的记录本。
 *
 * 为什么要专门做一个:
 * 原先只把最后一条报错文本存进 `_lastError`,**没有时间、没有版本、没有页面**。
 * 结果是一条几天前、早就修好的老报错,会在首页红框里一直挂着 ——
 * 用户以为「又出错了」,只能靠清空数据把它弄走,还误以为「清了数据才好」。
 * 实际上清掉的只是这条留言,不是什么 bug。
 *
 * 现在每条报错都带上时间、版本号和出错页面:
 * - 属于**当前版本**的才在首页告警(这是真的要管的)
 * - 更早版本留下的自动丢弃(那些问题已经随更新走了,不该再吓人)
 * - 完整历史留在家长中心,排查时才看
 */
const KEY = '_errLog'
const MAX = 5

export interface ErrEntry {
  /** 报错文本 */
  msg: string
  /** 记录时间(毫秒时间戳) */
  at: number
  /** 出错时跑的是哪个版本 */
  ver: string
  /** 出错时在哪个页面 */
  page: string
}

/** 当前页面路径,出错时一并记下来 —— 不然只有一句报错,根本不知道去哪看 */
function currentPage(): string {
  try {
    const pages = Taro.getCurrentPages()
    const top = pages[pages.length - 1]
    return top && top.route ? top.route : ''
  } catch {
    return ''
  }
}

function readLog(): ErrEntry[] {
  try {
    const raw = Taro.getStorageSync(KEY)
    return Array.isArray(raw) ? (raw as ErrEntry[]).filter((e) => e && typeof e.msg === 'string') : []
  } catch {
    return []
  }
}

/** 记一条报错。同一条报错短时间内重复出现只记一次,免得刷屏。 */
export function noteError(err: unknown): void {
  try {
    const msg = String(err).slice(0, 400)
    // 音频解码失败是**预期内**的:某些音源连得上但返回的是网页而不是音频,
    // 播放器解不出来就报这个。管线会自动换下一家,不该拿它去吓用户。
    if (/decode audio|MEDIA_ERR|innerAudioContext/i.test(msg)) return

    const log = readLog()
    const last = log[0]
    // 同一条报错 10 秒内重复:只更新时间,不新增一条
    if (last && last.msg === msg && Date.now() - last.at < 10000) {
      last.at = Date.now()
      Taro.setStorageSync(KEY, log)
      return
    }
    log.unshift({ msg, at: Date.now(), ver: BUILD_TAG, page: currentPage() })
    Taro.setStorageSync(KEY, log.slice(0, MAX))
  } catch {
    /* 记录报错本身不能再抛 */
  }
}

/**
 * 首页要不要报警。
 *
 * 只认**当前版本**记下的报错。旧版本的一律不显示 ——
 * 那些问题要么已经修了,要么跟现在跑的代码没关系,挂在首页只会造成误判。
 */
export function currentError(): ErrEntry | null {
  const log = readLog()
  for (const e of log) {
    if (e.ver === BUILD_TAG) return e
  }
  return null
}

/** 完整历史(家长中心排查用),按时间倒序 */
export function errorHistory(): ErrEntry[] {
  return readLog()
}

export function clearErrors(): void {
  try {
    Taro.setStorageSync(KEY, [])
    // 顺手把老版本那个孤零零的字段也清掉
    Taro.setStorageSync('_lastError', '')
  } catch {
    /* 忽略 */
  }
}

/** 把时间戳写成「今天 20:47」这种人能读的形式 */
export function formatWhen(at: number): string {
  try {
    const d = new Date(at)
    const now = new Date()
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) return `今天 ${hm}`
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  } catch {
    return ''
  }
}
