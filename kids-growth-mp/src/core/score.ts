// 本地发音「粗评」:把识别文本与目标做归一化相似度,映射成鼓励式星级(0–3)。
// 说明:这是启发式评分(串相似度 + 识别置信),不做音素级测评;对孩子够用、且护隐私(不上传)。

export function normalizeForCompare(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(
        dp[j] + 1, // 删除
        dp[j - 1] + 1, // 插入
        prev + (a[i - 1] === b[j - 1] ? 0 : 1), // 替换
      )
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
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length)
}

export interface ScoreResult {
  stars: 0 | 1 | 2 | 3
  sim: number
  message: string
}

/** 相似度 → 星级 + 鼓励文案(永远正向,不打击) */
export function scorePronunciation(recognized: string, target: string): ScoreResult {
  const sim = similarity(recognized, target)
  if (!normalizeForCompare(recognized)) {
    return { stars: 0, sim: 0, message: '没听清呀,凑近一点再读一遍～' }
  }
  if (sim >= 0.85) return { stars: 3, sim, message: '棒极了!发音很标准 🌟🌟🌟' }
  if (sim >= 0.6) return { stars: 2, sim, message: '不错哦!再清楚一点点就满分啦 🌟🌟' }
  return { stars: 1, sim, message: '有在认真读!多练几次会更好 🌟' }
}
