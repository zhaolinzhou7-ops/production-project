import growthStandards from '../data/growthStandards.json'
import type { Gender } from '../types'

// 这两个不依赖标准表,放在单独的小模块里(见 bodyMetrics.ts 的说明),
// 这里转出一份,生长曲线页照旧从本文件一次性拿全。
export { bmiOf, ageMonthsAt } from './bodyMetrics'

/**
 * 生长曲线百分位换算(WHO / 中国儿童生长标准的 LMS 参数表)。
 *
 * 「我家孩子这个身高算矮吗」—— 光看厘米数没意义,得跟同年龄同性别的孩子比。
 * 百分位就是回答这个:P50 表示比一半同龄孩子高,P3 表示只比 3% 的孩子高。
 * 这套算法从网页版原样搬过来,数据表也是同一份。
 */
export type PercentileKey = 'p3' | 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'p97'
export const PERCENTILE_KEYS: PercentileKey[] = ['p3', 'p10', 'p25', 'p50', 'p75', 'p90', 'p97']

export interface StandardEntry {
  month: number
  l: number
  m: number
  s: number
  p3: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p97: number
}

export type GrowthMetric = 'height' | 'weight' | 'bmi' | 'headCirc'

type Pair = { male: StandardEntry[]; female: StandardEntry[] }

const METRIC_DATA: Record<GrowthMetric, Pair> = {
  height: growthStandards.heightForAge as unknown as Pair,
  weight: growthStandards.weightForAge as unknown as Pair,
  bmi: growthStandards.bmiForAge as unknown as Pair,
  headCirc: growthStandards.headCircForAge as unknown as Pair,
}

export const METRIC_MONTH_RANGE: Record<GrowthMetric, [number, number]> = {
  height: growthStandards.meta.heightMonthsRange as [number, number],
  weight: growthStandards.meta.weightMonthsRange as [number, number],
  bmi: growthStandards.meta.bmiMonthsRange as [number, number],
  headCirc: growthStandards.meta.headCircMonthsRange as [number, number],
}

export const GROWTH_DATA_SOURCE = growthStandards.meta.source

export const METRIC_LABEL: Record<GrowthMetric, string> = {
  height: '身高',
  weight: '体重',
  bmi: 'BMI',
  headCirc: '头围',
}

export const METRIC_UNIT: Record<GrowthMetric, string> = {
  height: 'cm',
  weight: 'kg',
  bmi: '',
  headCirc: 'cm',
}

function seriesFor(metric: GrowthMetric, gender: Gender): StandardEntry[] {
  return gender === 'male' ? METRIC_DATA[metric].male : METRIC_DATA[metric].female
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 在任意月龄上线性插值出 L/M/S 与各百分位值 */
export function interpolateStandard(
  metric: GrowthMetric,
  gender: Gender,
  ageMonths: number,
): StandardEntry | null {
  const series = seriesFor(metric, gender)
  if (!series || series.length === 0) return null
  const range = METRIC_MONTH_RANGE[metric]
  const clamped = Math.min(Math.max(ageMonths, range[0]), range[1])

  let lo = series[0]
  let hi = series[series.length - 1]
  for (let i = 0; i < series.length - 1; i++) {
    if (clamped >= series[i].month && clamped <= series[i + 1].month) {
      lo = series[i]
      hi = series[i + 1]
      break
    }
  }
  if (lo.month === hi.month) return lo
  const t = (clamped - lo.month) / (hi.month - lo.month)

  const entry: StandardEntry = {
    month: clamped,
    l: lerp(lo.l, hi.l, t),
    m: lerp(lo.m, hi.m, t),
    s: lerp(lo.s, hi.s, t),
    p3: 0,
    p10: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    p90: 0,
    p97: 0,
  }
  for (const key of PERCENTILE_KEYS) {
    entry[key] = lerp(lo[key], hi[key], t)
  }
  return entry
}

function standardNormalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 对误差函数的近似
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * x)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

/** 实测值相对同龄同性别参考值的 z 分数 */
export function zScoreFor(l: number, m: number, s: number, value: number): number {
  if (Math.abs(l) < 1e-8) return Math.log(value / m) / s
  return (Math.pow(value / m, l) - 1) / (l * s)
}

/** 百分位排名(0–100):比多少百分比的同龄同性别孩子高 */
export function percentileRankFor(
  metric: GrowthMetric,
  gender: Gender,
  ageMonths: number,
  value: number,
): number | null {
  const std = interpolateStandard(metric, gender, ageMonths)
  if (!std) return null
  const z = zScoreFor(std.l, std.m, std.s, value)
  return Math.round(standardNormalCdf(z) * 1000) / 10
}

export type BmiCategory = 'thin' | 'normal' | 'overweight' | 'obese'

export const BMI_CATEGORY_LABEL: Record<BmiCategory, string> = {
  thin: '偏瘦',
  normal: '正常',
  overweight: '偏重',
  obese: '肥胖',
}

/** WHO 的 BMI-for-age 分级:z < -2 偏瘦,-2..+1 正常,+1..+2 偏重,> +2 肥胖 */
export function classifyBmi(zScore: number): BmiCategory {
  if (zScore < -2) return 'thin'
  if (zScore <= 1) return 'normal'
  if (zScore <= 2) return 'overweight'
  return 'obese'
}

/**
 * 把百分位翻译成一句家长能懂的话。
 * 刻意不说「偏矮/偏胖」这种带评判的词 —— 曲线是用来看趋势的,不是给孩子定性的。
 */
export function describePercentile(p: number, metric: GrowthMetric): string {
  const what = METRIC_LABEL[metric]
  const n = Math.round(p)
  if (p < 3) return `${what}处在同龄孩子的后 3%,建议找儿保科医生看一看`
  if (p < 15) return `${what}比约 ${n}% 的同龄孩子高,偏下但仍在正常范围`
  if (p <= 85) return `${what}比约 ${n}% 的同龄孩子高,处在中间的常见区间`
  if (p <= 97) return `${what}比约 ${n}% 的同龄孩子高,偏上但仍在正常范围`
  return `${what}处在同龄孩子的前 3%,长得比较快`
}
