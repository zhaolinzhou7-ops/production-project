/** 发音口音:1=英式 2=美式(有道 dictvoice 约定) */
export type Accent = 1 | 2

/** 系统语音合成(TTS):中文、句子、离线兜底。 */
export function speak(text: string, lang = 'en-US', rate = 0.9): void {
  if (typeof speechSynthesis === 'undefined') return
  try {
    speechSynthesis.cancel()
    // 部分移动端会把队列挂起,先恢复
    speechSynthesis.resume()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = rate
    // 尽量挑一个语言匹配的嗓音(尤其中文,否则可能不发声)
    const prefix = lang.slice(0, 2).toLowerCase()
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix))
    if (voice) u.voice = voice
    speechSynthesis.speak(u)
  } catch {
    /* 忽略:部分环境不支持 */
  }
}

/**
 * 播放单词的**真人发音**(有道 dictvoice)。
 * 直接用 `<audio>` 播放 URL(不经 fetch):既绕开跨域限制,又能在用户点击的
 * **同一手势内同步调用 play()**,满足移动端(尤其 iOS)必须由手势触发发声的要求。
 * 拉取失败(离线/被拦截,如 Artifact 的 CSP)时自动回退到系统 TTS。
 */
export function playWordAudio(word: string, accent: Accent = 2): void {
  const fallbackLang = accent === 1 ? 'en-GB' : 'en-US'
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`
  try {
    const audio = new Audio(url)
    let settled = false
    const fallback = () => {
      if (settled) return
      settled = true
      speak(word, fallbackLang)
    }
    audio.addEventListener('playing', () => {
      settled = true
    })
    audio.addEventListener('error', fallback)
    // 必须同步调用,保住用户手势;play() 被拒(自动播放策略/网络)时回退 TTS
    audio.play().then(() => {
      settled = true
    }).catch(fallback)
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
