/**
 * 多音源朗读管线:优先用**网络真人/神经网络音源**,层层回退,最后才用设备合成音。
 *
 * 为什么这么做:手机自带的 speechSynthesis 在很多安卓机上是老式拼接引擎,
 * 听起来很"机器人"。公开可用的在线音源(有道词典发音、百度语音)是神经网络
 * 合成,自然度高得多,而且不需要密钥。
 *
 * 关键实现细节:
 * - 这些音源都**没有 CORS 头**,用 fetch() 会被浏览器拦掉;但直接把 URL 交给
 *   <audio> 播放是允许的(opaque media)。所以这里不 fetch,只喂 URL。
 * - 因为不能 fetch,也就无法自己缓存 → 交给 Service Worker 的运行时缓存
 *   (vite.config.ts 里配置),重复播放走缓存,离线也能响。
 * - 音源是否可用取决于用户的网络环境,所以每个音源单独记"健康度",
 *   失败的短时间内跳过,过一阵自动重试;并提供自检面板让家长一眼看清。
 */

export type TtsLang = 'zh' | 'en'

export interface TtsSource {
  id: string
  label: string
  lang: TtsLang
  /** 该音源支持的最大文本长度(超了就跳过) */
  maxLen: number
  url: (text: string) => string
}

const enc = encodeURIComponent

/** 百度语音公开接口:per=4 是童声「度丫丫」,对小朋友最友好 */
const baidu = (lang: 'zh' | 'en', per: number, id: string, label: string): TtsSource => ({
  id,
  label,
  lang: lang === 'zh' ? 'zh' : 'en',
  maxLen: 300,
  url: (t) =>
    `https://tts.baidu.com/text2audio?lan=${lang}&text=${enc(t)}&spd=4&pit=5&vol=9&per=${per}&cuid=kidsgrowth&ctp=1&idx=1&aue=6`,
})

export const TTS_SOURCES: TtsSource[] = [
  // ---- 中文(有道通道已在国内 iOS 实测可达,优先) ----
  {
    // 实测有道 type=2 在国内 iOS 上可用(英语已验证);中文文本走同一参数,
    // 有道会用中文发音读出来 —— 这是目前最有希望的中文真人音源,故排在最前。
    id: 'youdao-zh-t2',
    label: '有道·中文(同英语通道)',
    lang: 'zh',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=2`,
  },
  {
    id: 'youdao-zh-t1',
    label: '有道·中文(通道2)',
    lang: 'zh',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=1`,
  },
  {
    id: 'youdao-zh',
    label: '有道·中文(le=zh)',
    lang: 'zh',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&le=zh`,
  },
  baidu('zh', 4, 'baidu-zh-child', '百度·童声(度丫丫)'),
  baidu('zh', 0, 'baidu-zh-female', '百度·女声'),
  {
    // 最简参数版:多余参数可能被服务端拒绝,留一个"最朴素"的形式提高命中率
    id: 'baidu-zh-plain',
    label: '百度·简版(参数最少)',
    lang: 'zh',
    maxLen: 300,
    url: (t) => `https://tts.baidu.com/text2audio?lan=zh&ie=UTF-8&spd=5&text=${enc(t)}`,
  },
  {
    id: 'sogou-zh',
    label: '搜狗·中文',
    lang: 'zh',
    maxLen: 200,
    url: (t) =>
      `https://fanyi.sogou.com/reventondc/synthesis?text=${enc(t)}&speed=1&lang=zh-CHS&from=translateweb&speaker=1`,
  },
  {
    id: 'baidu-fanyi-zh',
    label: '百度翻译·中文',
    lang: 'zh',
    maxLen: 200,
    url: (t) => `https://fanyi.baidu.com/gettts?lan=zh&text=${enc(t)}&spd=3&source=web`,
  },
  // ---- 英语 ----
  {
    id: 'youdao-en-us',
    label: '有道·美音(真人词库)',
    lang: 'en',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=2`,
  },
  {
    id: 'youdao-en-uk',
    label: '有道·英音(真人词库)',
    lang: 'en',
    maxLen: 120,
    url: (t) => `https://dict.youdao.com/dictvoice?audio=${enc(t)}&type=1`,
  },
  {
    id: 'google-en',
    label: 'Google·英语',
    lang: 'en',
    maxLen: 190,
    url: (t) => `https://translate.google.com/translate_tts?ie=UTF-8&q=${enc(t)}&tl=en&client=tw-ob`,
  },
  baidu('en', 4, 'baidu-en-child', '百度·英语童声'),
  {
    id: 'baidu-en-plain',
    label: '百度·英语简版',
    lang: 'en',
    maxLen: 300,
    url: (t) => `https://tts.baidu.com/text2audio?lan=en&ie=UTF-8&spd=5&text=${enc(t)}`,
  },
  {
    id: 'sogou-en',
    label: '搜狗·英语',
    lang: 'en',
    maxLen: 200,
    url: (t) =>
      `https://fanyi.sogou.com/reventondc/synthesis?text=${enc(t)}&speed=1&lang=en-USA&from=translateweb&speaker=1`,
  },
]

/** 音源所属域名(同域名的多个音源共享网络可达性) */
function hostOf(s: TtsSource): string {
  try {
    return new URL(s.url('x')).host
  } catch {
    return s.id
  }
}

export function sourcesFor(lang: TtsLang): TtsSource[] {
  return TTS_SOURCES.filter((s) => s.lang === lang)
}

export function getSource(id: string): TtsSource | undefined {
  return TTS_SOURCES.find((s) => s.id === id)
}

// ============ 健康度:失败的音源短期跳过,过后自动重试 ============

interface Health {
  fails: number
  lastFail: number
  ok?: number
}
const HEALTH_KEY = 'kids-growth-tts-health'
/**
 * 失败一次就先跳过该音源(10 分钟后自动重试)。
 * 原因:每个音源最多等 2.2 秒,若不跳过,断网时要连等 4 次≈9 秒才出声,
 * 孩子早就走神了。跳过后下一次直接用能用的音源/合成音,几乎无延迟。
 */
const SKIP_AFTER_FAILS = 1
const RETRY_AFTER_MS = 10 * 60 * 1000

function readHealth(): Record<string, Health> {
  try {
    return JSON.parse(localStorage.getItem(HEALTH_KEY) ?? '{}') as Record<string, Health>
  } catch {
    return {}
  }
}
function writeHealth(h: Record<string, Health>): void {
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(h))
  } catch {
    /* 忽略 */
  }
}
function markOk(id: string): void {
  const h = readHealth()
  h[id] = { fails: 0, lastFail: 0, ok: Date.now() }
  writeHealth(h)
}
function markFail(id: string): void {
  const h = readHealth()
  const cur = h[id] ?? { fails: 0, lastFail: 0 }
  h[id] = { ...cur, fails: cur.fails + 1, lastFail: Date.now() }
  writeHealth(h)
}
function isSkipped(id: string): boolean {
  const h = readHealth()[id]
  if (!h) return false
  if (h.fails < SKIP_AFTER_FAILS) return false
  return Date.now() - h.lastFail < RETRY_AFTER_MS
}

/** 自检面板用:每个音源最近状态 */
export function healthOf(id: string): 'ok' | 'bad' | 'unknown' {
  const h = readHealth()[id]
  if (!h) return 'unknown'
  if (h.fails >= SKIP_AFTER_FAILS && Date.now() - h.lastFail < RETRY_AFTER_MS) return 'bad'
  return h.ok ? 'ok' : 'unknown'
}

/** 家长手动指定优先音源 */
const PREF_KEY = 'kids-growth-tts-pref'
export function getPreferredSource(lang: TtsLang): string | null {
  try {
    return (JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Record<string, string>)[lang] ?? null
  } catch {
    return null
  }
}
export function setPreferredSource(lang: TtsLang, id: string | null): void {
  let cur: Record<string, string> = {}
  try {
    cur = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Record<string, string>
  } catch {
    /* 忽略 */
  }
  if (id) cur[lang] = id
  else delete cur[lang]
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(cur))
  } catch {
    /* 忽略 */
  }
}

// ============ 播放:单例 <audio> + 超时判定 ============

let el: HTMLAudioElement | null = null
export function ensureAudioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio()
    el.preload = 'auto'
    el.crossOrigin = null
  }
  return el
}

/** 当前这一轮播放的令牌:换题/换音源时作废旧的回调 */
let token = 0
export function cancelRemote(): void {
  token += 1
  const a = el
  if (!a) return
  try {
    a.pause()
  } catch {
    /* 忽略 */
  }
}

/**
 * 等音频的耐心:句子比单词大得多,首次下载也慢得多。
 * 之前统一 2.2 秒 → 长句常常超时退回机械音,但音频随后到达并被缓存,
 * 于是"第一遍难听、第二遍像真人"。按字数放宽即可消除这种落差。
 */
function timeoutFor(text: string): number {
  return Math.min(6500, 2200 + text.length * 55)
}

/**
 * 预热:提前把音频下载进缓存(只 load 不播),这样孩子点下去就是真人音,
 * 不会因为首次下载慢而退回合成音。
 */
export function preloadRemote(text: string, lang: TtsLang): void {
  const t = text.trim()
  if (!t) return
  const preferred = getPreferredSource(lang)
  const cand = [
    ...sourcesFor(lang).filter((s) => s.id === preferred),
    ...sourcesFor(lang).filter((s) => s.id !== preferred),
  ].find((s) => t.length <= s.maxLen && !isSkipped(s.id))
  if (!cand) return
  try {
    const warm = new Audio()
    warm.preload = 'auto'
    warm.muted = true
    warm.src = cand.url(t)
    warm.load()
    // 让它自己下载完就好,不播放;30 秒后释放
    setTimeout(() => {
      warm.src = ''
    }, 30_000)
  } catch {
    /* 忽略:预热失败不影响正常播放 */
  }
}

/**
 * 播一个 URL。resolve = 确实响了;reject = 拿不到音频(网络/格式/被拦)。
 * 首个 'playing' 事件即算成功;若 timeoutMs 内既没响也没报错,判为失败换下一个。
 */
function playUrl(url: string, timeoutMs = 3000, times = 1): Promise<void> {
  const a = ensureAudioEl()
  const my = ++token
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let played = 0
    const cleanup = () => {
      a.onplaying = null
      a.onerror = null
      a.onended = null
      clearTimeout(timer)
    }
    const fail = (why: string) => {
      if (settled || my !== token) return
      settled = true
      cleanup()
      reject(new Error(why))
    }
    const timer = setTimeout(() => fail('timeout'), timeoutMs)
    a.onplaying = () => {
      if (my !== token) return
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve() // 已经出声了,后续复读在 onended 里继续
      }
    }
    a.onended = () => {
      if (my !== token) return
      played += 1
      if (played < times) {
        a.currentTime = 0
        void a.play().catch(() => {})
      }
    }
    a.onerror = () => fail('audio error')
    try {
      a.pause()
      a.src = url
      a.play().catch(() => fail('play rejected'))
    } catch {
      fail('exception')
    }
  })
}

/**
 * 依次尝试该语言的所有音源(优先家长指定的、跳过近期失败的)。
 * 全部失败时 reject,由调用方回退到设备合成音。
 */
export async function playRemote(text: string, lang: TtsLang, times = 1): Promise<string> {
  const t = text.trim()
  if (!t) throw new Error('empty')
  const all = sourcesFor(lang)
  const preferred = getPreferredSource(lang)
  const ordered = [
    ...all.filter((s) => s.id === preferred),
    ...all.filter((s) => s.id !== preferred),
  ]
  let lastErr = 'no source'
  // 按"域名"去重:同一家(如有道美音/英音)刚失败,就不必再等它第二个地址,
  // 直接换下一家。一次播放最多试 2 家,再不行交给合成音,别让孩子干等。
  const deadHosts = new Set<string>()
  let hostsTried = 0
  for (const s of ordered) {
    if (t.length > s.maxLen) continue
    if (isSkipped(s.id) && s.id !== preferred) continue
    const host = hostOf(s)
    if (deadHosts.has(host)) {
      markFail(s.id) // 同域名已判死,顺手记上,下次直接跳过
      continue
    }
    if (hostsTried >= 2) break
    hostsTried += 1
    try {
      await playUrl(s.url(t), timeoutFor(t), times)
      markOk(s.id)
      return s.id
    } catch (e) {
      markFail(s.id)
      deadHosts.add(host)
      lastErr = e instanceof Error ? e.message : 'error'
    }
  }
  throw new Error(lastErr)
}

/** 自检:逐个试听,返回每个音源能否用(家长面板调用) */
export async function testSource(s: TtsSource, sample: string): Promise<boolean> {
  try {
    await playUrl(s.url(sample), 3500, 1)
    markOk(s.id)
    return true
  } catch {
    markFail(s.id)
    return false
  }
}

/**
 * 失败原因:
 * - 'ok'          能连上且能播
 * - 'unreachable' 请求根本发不出去(断网/被墙/被拦) → 换音源也没用,只能靠设备语音
 * - 'not-audio'   能连上,但返回的不是可播音频(参数不对/需鉴权/返回错误页) → 我可以改地址
 */
export type DiagReason = 'ok' | 'unreachable' | 'not-audio'

/**
 * 诊断单个音源:先用 no-cors 请求判断"能不能连上",再判断"返回的是不是能播的音频"。
 * 这两者的区别决定了问题是网络层还是接口参数,家长把结果发我即可精准修。
 */
export async function diagnoseSource(s: TtsSource, sample: string): Promise<DiagReason> {
  const url = s.url(sample)
  try {
    // opaque 请求:读不到内容,但能区分"请求成功发出并有响应" vs "网络层失败"
    await fetch(url, { mode: 'no-cors', cache: 'no-store' })
  } catch {
    markFail(s.id)
    return 'unreachable'
  }
  try {
    await playUrl(url, timeoutFor(sample) + 1500, 1)
    markOk(s.id)
    return 'ok'
  } catch {
    markFail(s.id)
    return 'not-audio'
  }
}
