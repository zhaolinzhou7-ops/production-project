/** 发音口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

const AUDIO_CACHE = 'kids-growth-audio-v1'

/** 系统语音合成(TTS):中文、句子、离线兜底。 */
export function speak(text: string, lang = 'en-US', rate = 0.9): void {
  if (typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = rate
    speechSynthesis.speak(u)
  } catch {
    /* 忽略:部分环境不支持 */
  }
}

async function cacheGet(url: string): Promise<Blob | null> {
  try {
    if (typeof caches === 'undefined') return null
    const cache = await caches.open(AUDIO_CACHE)
    const hit = await cache.match(url)
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

async function cachePut(url: string, resp: Response): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    const cache = await caches.open(AUDIO_CACHE)
    await cache.put(url, resp)
  } catch {
    /* 忽略 */
  }
}

/**
 * 播放单词的**真人发音**(有道 dictvoice)。首次联网拉取并缓存,之后离线可重播;
 * 失败(离线/被拦截,如 Artifact 的 CSP)时回退到系统 TTS。
 */
export async function playWordAudio(word: string, accent: Accent = 2): Promise<void> {
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`
  try {
    const cached = await cacheGet(url)
    if (cached) {
      await playBlob(cached)
      return
    }
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) throw new Error('audio fetch failed')
    await cachePut(url, resp.clone())
    await playBlob(await resp.blob())
  } catch {
    // 回退:合成音
    speak(word, accent === 1 ? 'en-GB' : 'en-US')
  }
}

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(URL.createObjectURL(blob))
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  })
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
