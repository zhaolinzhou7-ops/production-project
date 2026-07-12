/** 发音口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

// ============ 音频可靠性:单例元素 + 首次手势统一解锁 ============
// 移动端(尤其 iOS/微信)只允许「在用户手势里启动过的媒体」之后被程序化播放。
// 之前每次播放都 new Audio() → 翻卡自动播放的新元素被拦 → 偶发无声。
// 修法:全程复用一个 <audio> 元素,并在用户第一次触屏时静音"预启动"一次。

/** 1 帧静音 wav,用于在手势里解锁音频元素 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let wordEl: HTMLAudioElement | null = null
function ensureWordEl(): HTMLAudioElement {
  if (!wordEl) {
    wordEl = new Audio()
    wordEl.preload = 'auto'
  }
  return wordEl
}

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

/** 系统语音合成(TTS):中文、句子、离线兜底。 */
export function speak(text: string, lang = 'en-US', rate = 0.9): void {
  if (typeof speechSynthesis === 'undefined') return
  warmVoices()
  const doSpeak = () => {
    try {
      speechSynthesis.resume()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang
      u.rate = rate
      const prefix = lang.slice(0, 2).toLowerCase()
      const voice = speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith(prefix))
      if (voice) u.voice = voice
      speechSynthesis.speak(u)
    } catch {
      /* 忽略:部分环境不支持 */
    }
  }
  try {
    // Chrome/安卓已知竞态:cancel() 后立刻 speak() 会被静默吞掉 → 延迟一拍
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel()
      setTimeout(doSpeak, 60)
    } else {
      doSpeak()
    }
  } catch {
    doSpeak()
  }
}

/**
 * 播放单词的**真人发音**(有道 dictvoice)。
 * 复用单例 <audio> 元素(经首次手势解锁后,翻卡自动播放也不会被移动端拦截);
 * 拉取失败(离线/被拦截)时自动回退到系统 TTS。
 */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const fallbackLang = accent === 1 ? 'en-GB' : 'en-US'
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`
  try {
    const el = ensureWordEl()
    let settled = false
    const fallback = () => {
      if (settled) return
      settled = true
      speak(word, fallbackLang)
    }
    el.onplaying = () => {
      settled = true
    }
    el.onerror = fallback
    el.pause()
    el.src = url
    el.play()
      .then(() => {
        settled = true
      })
      .catch(fallback)
  } catch {
    speak(word, fallbackLang)
  }
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
