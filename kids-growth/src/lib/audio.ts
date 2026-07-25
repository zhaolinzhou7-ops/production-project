import { playRemote, cancelRemote, ensureAudioEl, preloadRemote } from './tts'

/** 发音口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

// ============ 音频可靠性:单例元素 + 首次手势统一解锁 ============
// 移动端(尤其 iOS/微信)只允许「在用户手势里启动过的媒体」之后被程序化播放。
// 之前每次播放都 new Audio() → 翻卡自动播放的新元素被拦 → 偶发无声。
// 修法:全程复用一个 <audio> 元素,并在用户第一次触屏时静音"预启动"一次。

/** 1 帧静音 wav,用于在手势里解锁音频元素 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** 与 tts.ts 共用同一个已解锁的 <audio> 元素 */
const ensureWordEl = ensureAudioEl

let voicesWarmed = false
function warmVoices(): void {
  if (voicesWarmed || typeof speechSynthesis === 'undefined') return
  voicesWarmed = true
  try {
    // 首次 getVoices 常为空,监听加载完成再取一遍
    speechSynthesis.getVoices()
    speechSynthesis.onvoiceschanged = () => {
      try {
        speechSynthesis.getVoices()
      } catch {
        /* 忽略 */
      }
    }
  } catch {
    /* 忽略 */
  }
}

let unlockInstalled = false
/** 在 App 启动时调用一次:用户第一次触屏即解锁 <audio>/TTS,之后自动播放不再被拦 */
export function initAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  warmVoices()
  const unlock = () => {
    try {
      const el = ensureWordEl()
      el.muted = true
      el.src = SILENT_WAV
      void el
        .play()
        .then(() => {
          el.pause()
          el.muted = false
        })
        .catch(() => {
          el.muted = false
        })
    } catch {
      /* 忽略 */
    }
    try {
      // iOS 的 speechSynthesis 也需要一次手势内的 speak 才会开口
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      speechSynthesis.speak(u)
    } catch {
      /* 忽略 */
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
}

// Chrome/安卓两个已知坑,都表现为「偶尔漏读一个词」:
// ① utterance 对象在播放中被垃圾回收 → 该句被静默吞掉 → 播放期间强持引用;
// ② 上一次 speak 的"延迟一拍"定时器还没触发,新的 speak 又来了 → 迟到的旧
//    定时器把旧词插播进来、互相 cancel → 全局只保留最新一个待播定时器。
const liveUtterances: SpeechSynthesisUtterance[] = []
let pendingSpeakTimer: ReturnType<typeof setTimeout> | null = null

// ============ 音色挑选:尽量像真人 ============
// 同一台手机常装着好几种语音,默认那个往往最"机器人"。
// 这里给每个音色打分,优先挑神经网络/云端音色(Google/Microsoft Natural/Siri 等)。

const VOICE_PREF_KEY = 'kids-growth-voice-pref'

/** 家长手动指定的音色(按语言前缀存 voiceURI) */
function getVoicePref(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(VOICE_PREF_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function setPreferredVoice(langPrefix: string, voiceURI: string | null): void {
  const pref = getVoicePref()
  if (voiceURI) pref[langPrefix] = voiceURI
  else delete pref[langPrefix]
  try {
    localStorage.setItem(VOICE_PREF_KEY, JSON.stringify(pref))
  } catch {
    /* 忽略 */
  }
}

export function getPreferredVoiceURI(langPrefix: string): string | null {
  return getVoicePref()[langPrefix] ?? null
}

/**
 * 苹果系统自带的**搞怪音色**(novelty voices):Bad News 是阴森报丧腔、
 * Bahh 是羊叫、Boing 是弹簧音、Zarvox 是机器人…… 它们本来就是故意难听的,
 * 却混在 getVoices() 里,一不小心就会被选来给孩子读英语。必须排除干净。
 */
const NOVELTY_VOICE =
  /\b(albert|bad news|good news|bahh|bells|boing|bubbles|cellos|deranged|hysterical|jester|junior|kathy|organ|pipe organ|princess|ralph|superstar|trinoids|whisper|wobble|zarvox|bruce|fred|agnes|vicki|victoria|grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed)\b/i

/** 各平台公认较自然的音色名(苹果 Samantha/Karen…,中文 婷婷/美佳…) */
const GOOD_VOICE =
  /\b(samantha|karen|daniel|moira|tessa|rishi|veena|fiona|nicky|aaron|ava|allison|susan|alex|siri|tingting|ting-ting|meijia|mei-jia|sinji|yu-shu|li-mu|liangliang|xiaoxiao|yunyang)\b/i

/** 音色"像真人"程度打分(越高越自然) */
function voiceScore(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI}`.toLowerCase()
  let s = 0
  // 明确标注的高质量/神经网络音色
  if (/natural|neural|premium|enhanced|wavenet|journey|studio/.test(n)) s += 60
  if (/google/.test(n)) s += 40
  if (/microsoft/.test(n)) s += 25
  if (/siri/.test(n)) s += 35
  if (GOOD_VOICE.test(n)) s += 30
  // 明显机械的老引擎
  if (/espeak|pico|compact|eloquence|fallback/.test(n)) s -= 60
  // 搞怪音色:绝不使用
  if (NOVELTY_VOICE.test(n)) s -= 1000
  // 云端音色通常比本地合成更自然
  if (!v.localService) s += 15
  if (v.default) s += 3
  return s
}

/** 是否为搞怪音色(界面里也不该列出来) */
export function isNoveltyVoice(v: SpeechSynthesisVoice): boolean {
  return NOVELTY_VOICE.test(`${v.name} ${v.voiceURI}`)
}

/**
 * 某语言下**可用于朗读**的音色,按"像真人"排序;搞怪音色一律剔除。
 * includeNovelty=true 时才带上(仅用于诊断展示)。
 */
export function listVoices(langPrefix: string, includeNovelty = false): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  try {
    return speechSynthesis
      .getVoices()
      .filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith(langPrefix.toLowerCase()))
      .filter((v) => includeNovelty || !isNoveltyVoice(v))
      .sort((a, b) => voiceScore(b) - voiceScore(a))
  } catch {
    return []
  }
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const prefix = lang.slice(0, 2).toLowerCase()
  const candidates = listVoices(prefix)
  if (candidates.length === 0) return undefined
  const wanted = getVoicePref()[prefix]
  if (wanted) {
    const hit = candidates.find((v) => v.voiceURI === wanted)
    if (hit) return hit
  }
  // 同分时优先完全匹配地区(如 en-US 优于 en-IN)
  const exact = candidates.filter((v) => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase())
  return (exact.length > 0 ? exact : candidates)[0]
}

/**
 * 系统语音合成(TTS):离线兜底。times=2 自动复读一遍。
 * isFallback=true 表示这是网络音源失败后的兜底,不再去掐断远端播放。
 */
export function speak(text: string, lang = 'en-US', rate = 0.9, times = 1, isFallback = false): void {
  if (typeof speechSynthesis === 'undefined') return
  if (!isFallback) cancelRemote() // 手动点朗读时,先停掉正在放的网络音频
  warmVoices()
  if (pendingSpeakTimer) {
    clearTimeout(pendingSpeakTimer)
    pendingSpeakTimer = null
  }
  const speakOnce = (remaining: number) => {
    try {
      speechSynthesis.resume()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      u.rate = rate
      u.pitch = 1 // 保持自然音高(拔高会有"卡通味")
      const voice = pickVoice(lang)
      if (voice) u.voice = voice
      liveUtterances.push(u)
      const release = () => {
        const i = liveUtterances.indexOf(u)
        if (i >= 0) liveUtterances.splice(i, 1)
      }
      u.onend = () => {
        release()
        if (remaining > 1) {
          pendingSpeakTimer = setTimeout(() => speakOnce(remaining - 1), 450)
        }
      }
      u.onerror = release
      speechSynthesis.speak(u)
    } catch {
      /* 忽略:部分环境不支持 */
    }
  }
  try {
    // cancel() 后立刻 speak() 会被静默吞掉 → 延迟一拍
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel()
      pendingSpeakTimer = setTimeout(() => speakOnce(times), 80)
    } else {
      speakOnce(times)
    }
  } catch {
    speakOnce(times)
  }
}

/**
 * 说英文:先试**网络真人/神经网络音源**(有道真人词库 → Google → 百度),
 * 全都拿不到才用设备合成音。times=2 自动复读一遍。
 */
export function playWordAudio(word: string, _accent: Accent = 2, times = 1): void {
  void playRemote(word, 'en', times).catch(() => {
    speak(word, 'en-US', 0.9, times, true)
  })
}

/** 说一句英文(对话/复述/儿歌朗读),同样走真人音源优先 */
export function speakEnglish(text: string, rate = 0.85, times = 1): void {
  void playRemote(text, 'en', times).catch(() => {
    speak(text, 'en-US', rate, times, true)
  })
}

/**
 * 说中文:先试网络神经网络音源(百度童声等),失败才用设备合成音。
 * 识字/古诗/看图/语音夸奖都走这里 —— 中文是最容易听出"机器人味"的地方。
 */
export function speakChinese(text: string, rate = 0.9, times = 1): void {
  void playRemote(text, 'zh', times).catch(() => {
    speak(text, 'zh-CN', rate, times, true)
  })
}

/** 提前把要读的内容下载好(下一张卡 / 下一句台词),点下去就是真人音 */
export function prefetchSpeech(text: string, lang: 'zh' | 'en'): void {
  preloadRemote(text, lang)
}

/** 按语言自动选路:zh→中文管线,其它→英文管线 */
export function say(text: string, lang: string, rate = 0.9, times = 1): void {
  if (lang.toLowerCase().startsWith('zh')) speakChinese(text, rate, times)
  else speakEnglish(text, rate, times)
}

// ============ 语音识别(口语跟读比对) ============

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  )
}

/** 归一化文本以便宽松比对(去标点/空格/大小写) */
export function normalizeForCompare(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '')
}

export interface RecognizeResult {
  transcript: string
  matched: boolean
}

/**
 * 录一次音并识别,与目标文本宽松比对。需联网、仅 Chrome/Safari;不支持时 reject。
 */
export function recognizeOnce(target: string, lang = 'en-US'): Promise<RecognizeResult> {
  return new Promise((resolve, reject) => {
    const Ctor =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    if (!Ctor) {
      reject(new Error('语音识别不支持'))
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new (Ctor as any)()
    rec.lang = lang
    rec.interimResults = false
    rec.maxAlternatives = 3
    let done = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      done = true
      const alts: string[] = []
      for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript)
      const t = normalizeForCompare(target)
      const matched = alts.some((a) => normalizeForCompare(a) === t)
      resolve({ transcript: alts[0] ?? '', matched })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (!done) reject(new Error(e?.error ?? '识别失败'))
    }
    rec.onend = () => {
      if (!done) reject(new Error('未识别到语音'))
    }
    try {
      rec.start()
    } catch {
      reject(new Error('无法启动识别'))
    }
  })
}
