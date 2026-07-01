import growthStandards from '../data/growthStandards.json'
import type { Gender } from '../types'

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

const METRIC_DATA: Record<GrowthMetric, { male: StandardEntry[]; female: StandardEntry[] }> = {
  height: growthStandards.heightForAge as { male: StandardEntry[]; female: StandardEntry[] },
  weight: growthStandards.weightForAge as { male: StandardEntry[]; female: StandardEntry[] },
  bmi: growthStandards.bmiForAge as { male: StandardEntry[]; female: StandardEntry[] },
  headCirc: growthStandards.headCircForAge as { male: StandardEntry[]; female: StandardEntry[] },
}

export const METRIC_MONTH_RANGE: Record<GrowthMetric, [number, number]> = {
  height: growthStandards.meta.heightMonthsRange as [number, number],
  weight: growthStandards.meta.weightMonthsRange as [number, number],
  bmi: growthStandards.meta.bmiMonthsRange as [number, number],
  headCirc: growthStandards.meta.headCircMonthsRange as [number, number],
}

export const GROWTH_DATA_SOURCE = growthStandards.meta.source

function seriesFor(metric: GrowthMetric, gender: Gender): StandardEntry[] {
  return gender === 'male' ? METRIC_DATA[metric].male : METRIC_DATA[metric].female
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Linearly interpolates the L/M/S + percentile values at an arbitrary age in months. */
export function interpolateStandard(
  metric: GrowthMetric,
  gender: Gender,
  ageMonths: number,
): StandardEntry | null {
  const series = seriesFor(metric, gender)
  const [minMonth, maxMonth] = METRIC_MONTH_RANGE[metric]
  const clamped = Math.min(Math.max(ageMonths, minMonth), maxMonth)

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

  const entry: StandardEntry = { month: clamped, l: lerp(lo.l, hi.l, t), m: lerp(lo.m, hi.m, t), s: lerp(lo.s, hi.s, t), p3: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p97: 0 }
  for (const key of PERCENTILE_KEYS) {
    entry[key] = lerp(lo[key], hi[key], t)
  }
  return entry
}

/** Returns the raw percentile-band series (for charting) within the metric's supported range. */
export function getStandardSeries(metric: GrowthMetric, gender: Gender): StandardEntry[] {
  return seriesFor(metric, gender)
}

function standardNormalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 approximation of the error function.
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

/** z-score of a measured value against the LMS reference at that age. */
export function zScoreFor(l: number, m: number, s: number, value: number): number {
  if (Math.abs(l) < 1e-8) return Math.log(value / m) / s
  return (Math.pow(value / m, l) - 1) / (l * s)
}

/** Approximate percentile rank (0-100) of a measured value against same-age, same-sex peers. */
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

/** WHO BMI-for-age classification: z < -2 thin, -2..+1 normal, +1..+2 overweight, > +2 obese. */
export function classifyBmi(zScore: number): BmiCategory {
  if (zScore < -2) return 'thin'
  if (zScore <= 1) return 'normal'
  if (zScore <= 2) return 'overweight'
  return 'obese'
}
