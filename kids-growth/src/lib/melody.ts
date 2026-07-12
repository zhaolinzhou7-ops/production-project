/**
 * 儿歌旋律(简化音乐盒版):用 WebAudio 合成三角波音符,不依赖任何外部音频文件。
 * 每首儿歌按 talkContent.RHYMES 的 key 对齐,逐行给出 [音名, 拍数] 数组,
 * 与歌词行一一对应,方便"播放一行旋律 + 高亮一行歌词"。
 * 曲目均为公有领域传统童谣,旋律为贴近原曲的简化编配。
 */

/** 音名 → 频率(Hz),C4 为中央 C */
const FREQ: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
}

/** 一个音符:[音名, 拍数];音名 'R' 表示休止 */
export type MelodyNote = [string, number]

/** 每首歌 = 与歌词行数一致的「行旋律」数组 */
const MELODIES: Record<string, MelodyNote[][]> = {
  // Twinkle Twinkle Little Star (6 行)
  twinkle: [
    [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2]],
    [['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
    [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]],
    [['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 2]],
    [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2]],
    [['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
  ],
  // Rain Rain Go Away (4 行) — 经典 sol-mi 童谣动机
  rain: [
    [['G4', 1], ['E4', 1], ['G4', 1], ['G4', 0.5], ['E4', 1.5]],
    [['G4', 0.5], ['G4', 0.5], ['A4', 1], ['G4', 0.5], ['G4', 0.5], ['E4', 1.5]],
    [['G4', 0.5], ['G4', 0.5], ['G4', 0.5], ['E4', 0.5], ['G4', 0.5], ['G4', 0.5], ['E4', 1.5]],
    [['G4', 1], ['E4', 1], ['G4', 1], ['G4', 0.5], ['E4', 1.5]],
  ],
  // Row Row Row Your Boat (4 行)
  row: [
    [['C4', 1], ['C4', 1], ['C4', 0.75], ['D4', 0.25], ['E4', 1]],
    [['E4', 0.75], ['D4', 0.25], ['E4', 0.75], ['F4', 0.25], ['G4', 2]],
    [
      ['C5', 0.33], ['C5', 0.33], ['C5', 0.34],
      ['G4', 0.33], ['G4', 0.33], ['G4', 0.34],
      ['E4', 0.33], ['E4', 0.33], ['E4', 0.34],
      ['C4', 0.33], ['C4', 0.33], ['C4', 0.34],
    ],
    [['G4', 0.75], ['F4', 0.25], ['E4', 0.75], ['D4', 0.25], ['C4', 2]],
  ],
  // Baa Baa Black Sheep (8 行) — 与小星星同族旋律
  baabaa: [
    [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1]],
    [['A4', 0.5], ['A4', 0.5], ['A4', 0.5], ['A4', 0.5], ['G4', 2]],
    [['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1]],
    [['D4', 1], ['D4', 1], ['C4', 2]],
    [['G4', 1], ['G4', 0.5], ['G4', 0.5], ['F4', 1], ['F4', 1]],
    [['E4', 1], ['E4', 0.5], ['E4', 0.5], ['D4', 2]],
    [['G4', 0.5], ['G4', 0.5], ['G4', 0.5], ['G4', 0.5], ['F4', 0.5], ['F4', 0.5], ['F4', 1]],
    [['E4', 0.5], ['E4', 0.5], ['E4', 0.5], ['E4', 0.5], ['D4', 1], ['C4', 2]],
  ],
  // Itsy Bitsy Spider (4 行)
  spider: [
    [
      ['G4', 0.5], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 1],
      ['E4', 0.5], ['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 1.5],
    ],
    [
      ['E4', 1], ['E4', 0.5], ['F4', 0.5], ['G4', 1],
      ['G4', 0.5], ['F4', 0.5], ['E4', 0.5], ['F4', 0.5], ['G4', 0.5], ['E4', 1.5],
    ],
    [
      ['C4', 1], ['C4', 0.5], ['D4', 0.5], ['E4', 1],
      ['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 1.5],
    ],
    [
      ['G4', 0.5], ['G4', 0.5], ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 1],
      ['E4', 0.5], ['E4', 0.5], ['D4', 0.5], ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['C4', 1.5],
    ],
  ],
}

export function hasMelody(key: string): boolean {
  return key in MELODIES
}

export function getMelody(key: string): MelodyNote[][] | null {
  return MELODIES[key] ?? null
}

// ---- 播放:三角波 + 短包络,像八音盒 ----

let ctx: AudioContext | null = null
function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

let activeNodes: { osc: OscillatorNode; gain: GainNode }[] = []

/** 停掉当前正在响/已排程的所有音符(切歌/退出时用) */
export function stopMelody(): void {
  for (const { osc, gain } of activeNodes) {
    try {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 0
      osc.stop()
    } catch {
      /* 已停 */
    }
  }
  activeNodes = []
}

/**
 * 播放一行旋律,返回这行的总时长(毫秒),供调用方链式高亮下一行。
 * WebAudio 不可用时返回兜底时长(调用方仍能推进高亮)。
 */
export function playMelodyLine(notes: MelodyNote[], bpm = 100): number {
  const beatSec = 60 / bpm
  const totalMs = Math.round(notes.reduce((s, [, b]) => s + b, 0) * beatSec * 1000)
  const ac = ensureCtx()
  if (!ac) return Math.max(totalMs, 1200)
  try {
    let t = ac.currentTime + 0.03
    for (const [name, beats] of notes) {
      const dur = beats * beatSec
      const freq = FREQ[name]
      if (freq) {
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = 'triangle'
        osc.frequency.value = freq
        // 八音盒式包络:快起音 → 缓慢衰减
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur * 0.92, 0.08))
        osc.connect(gain).connect(ac.destination)
        osc.start(t)
        osc.stop(t + dur)
        const node = { osc, gain }
        activeNodes.push(node)
        osc.onended = () => {
          activeNodes = activeNodes.filter((n) => n !== node)
        }
      }
      t += dur
    }
  } catch {
    /* 忽略:合成失败时只推进高亮 */
  }
  return Math.max(totalMs, 1200)
}
