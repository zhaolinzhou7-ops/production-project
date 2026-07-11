// 学习音效:用 WebAudio 现场合成(无需任何音频素材),失败静默。
// 可静音,偏好存 localStorage,孩子端可一键开关。

const MUTE_KEY = 'kids-growth-sfx-muted'

let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/** 播一个音符(正弦/三角波,短促),time 为相对当前的秒偏移 */
function tone(
  freq: number,
  time: number,
  duration: number,
  volume = 0.18,
  type: OscillatorType = 'sine',
): void {
  const ac = audioCtx()
  if (!ac || isMuted()) return
  try {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.value = freq
    const t0 = ac.currentTime + time
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.05)
  } catch {
    /* 忽略 */
  }
}

/** 答对:清脆两连音 */
export function sfxCorrect(): void {
  tone(880, 0, 0.12)
  tone(1318.5, 0.09, 0.16)
}

/** 答错:低沉短音(温和,不刺耳) */
export function sfxWrong(): void {
  tone(220, 0, 0.18, 0.12, 'triangle')
}

/** 连击里程碑(3/5/10…):上行琶音,连击越高音越多 */
export function sfxCombo(level: number): void {
  const notes = [659.3, 784, 987.8, 1174.7, 1318.5]
  const n = Math.min(2 + level, notes.length)
  for (let i = 0; i < n; i++) tone(notes[i], i * 0.07, 0.12, 0.16)
}

/** 会话完成:小号角旋律 */
export function sfxFanfare(): void {
  const seq: Array<[number, number, number]> = [
    [523.3, 0, 0.14],
    [659.3, 0.12, 0.14],
    [784, 0.24, 0.14],
    [1046.5, 0.36, 0.3],
  ]
  for (const [f, t, d] of seq) tone(f, t, d, 0.2, 'triangle')
}

/** 获得贴纸:闪亮上滑音 */
export function sfxSticker(): void {
  tone(1046.5, 0, 0.1, 0.14)
  tone(1318.5, 0.08, 0.1, 0.14)
  tone(1568, 0.16, 0.1, 0.14)
  tone(2093, 0.24, 0.25, 0.16)
}
