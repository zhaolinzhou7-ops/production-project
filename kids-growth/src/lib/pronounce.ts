// 发音「粗评」打分:识别文本与目标做归一化相似度 → 鼓励式 0–3 星。
// 启发式(编辑距离),不做音素级测评;够孩子练、且不上传录音。
import { normalizeForCompare } from './audio'

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[n]
}

/** 0..1 相似度 */
export function similarity(recognized: string, target: string): number {
  const a = normalizeForCompare(recognized)
  const b = normalizeForCompare(target)
  if (!a && !b) return 1
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

export interface PronounceScore {
  stars: 0 | 1 | 2 | 3
  sim: number
  message: string
}

/** 相似度 → 星级 + 鼓励文案(永远正向) */
export function scorePronunciation(recognized: string, target: string): PronounceScore {
  const sim = similarity(recognized, target)
  if (!normalizeForCompare(recognized)) {
    return { stars: 0, sim: 0, message: '没听清呀,凑近一点再读一遍~' }
  }
  if (sim >= 0.85) return { stars: 3, sim, message: '棒极了!发音很标准' }
  if (sim >= 0.6) return { stars: 2, sim, message: '不错哦!再清楚一点点就满分啦' }
  return { stars: 1, sim, message: '有在认真读!多练几次会更好' }
}

// ============ 录音回放(听自己读的) ============

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

export interface Recorder {
  stop: () => Promise<Blob>
  cancel: () => void
}

/** 开始录音;stop() 返回音频 Blob 供回放。只存内存,不落盘不上传。 */
export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream)
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  rec.start()

  const cleanup = () => stream.getTracks().forEach((t) => t.stop())

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          cleanup()
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }))
        }
        rec.stop()
      }),
    cancel: () => {
      try {
        rec.stop()
      } catch {
        /* 忽略 */
      }
      cleanup()
    },
  }
}

/** 回放录音 Blob */
export function playRecording(blob: Blob): void {
  try {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    void audio.play()
  } catch {
    /* 忽略 */
  }
}
