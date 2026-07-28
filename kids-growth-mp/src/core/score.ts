// 本地发音「粗评」:把识别文本与目标做归一化相似度,映射成鼓励式星级(0–3)。
// 说明:这是启发式评分(串相似度 + 识别置信),不做音素级测评;对孩子够用、且护隐私(不上传)。

/**
 * 缩读还原表。
 *
 * 剧本里写的是「I am fine」,孩子照着自然英语说出口是「I'm fine」——
 * 两者一样地对,但按字面比只有 0.8 的相似度,会被扣成两星。
 * 孩子不知道自己错在哪(因为根本没错),只会觉得这个打分很随机。
 * 所以先把缩读统一还原成完整形式再比。
 */
const CONTRACTIONS: Array<[RegExp, string]> = [
  [/\bi'm\b/g, 'i am'],
  [/\b(he|she|it|that|there|what|who|where)'s\b/g, '$1 is'],
  [/\b(you|we|they)'re\b/g, '$1 are'],
  [/\b(i|you|he|she|it|we|they)'ll\b/g, '$1 will'],
  [/\b(i|you|he|she|it|we|they)'ve\b/g, '$1 have'],
  [/\bcan't\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\blet's\b/g, 'let us'],
  [/n't\b/g, ' not'],
]

export function normalizeForCompare(s: string): string {
  let t = (s || '').toLowerCase()
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to)
  return t.replace(/[^a-z0-9一-鿿]/g, '')
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

/**
 * 相似度 → 星级 + 鼓励文案(永远正向,不打击)。
 *
 * `alts` 是同样正确的其它说法。一个问题往往有好几个对的答法
 * (「How are you?」答 I am fine / I am good / Very well 都对),
 * 只认一个标准答案,等于在教孩子背句子而不是说英语。取最高的那个分。
 */
export function scorePronunciation(
  recognized: string,
  target: string,
  alts?: string[],
): ScoreResult {
  if (!normalizeForCompare(recognized)) {
    return { stars: 0, sim: 0, message: '没听清呀,凑近一点再读一遍～' }
  }
  let sim = similarity(recognized, target)
  if (alts) {
    for (const alt of alts) {
      const s = similarity(recognized, alt)
      if (s > sim) sim = s
    }
  }
  if (sim >= 0.85) return { stars: 3, sim, message: '棒极了!发音很标准 🌟🌟🌟' }
  if (sim >= 0.6) return { stars: 2, sim, message: '不错哦!再清楚一点点就满分啦 🌟🌟' }
  return { stars: 1, sim, message: '有在认真读!多练几次会更好 🌟' }
}
