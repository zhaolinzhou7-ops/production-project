import { ageMonthsAt } from './bodyMetrics'
import type { AgeStage } from '../types'

/**
 * 从生日推学段。
 *
 * 为什么要有这个:学段本来是家长在设置里单独选的一个抽象值,和孩子的真实
 * 信息没有任何关系 —— 结果是①第一次要家长自己判断「我孩子算幼儿还是小学」
 * ②清一次数据就退回默认值,孩子的内容悄悄变难 ③孩子长大了没人去改它,
 * 一直用着两年前的内容。
 *
 * 生日是**一次录入、终身有效**的事实。把学段挂在它上面,上面三个问题
 * 一次全消失:今天算今天的,明天他长大了,程序自己知道。
 */

/** 各学段的起始年龄(周岁) */
const PRIMARY_FROM = 6
const JUNIOR_FROM = 12
const SENIOR_FROM = 15

export function stageFromMonths(months: number): AgeStage {
  const years = months / 12
  if (years < PRIMARY_FROM) return 'toddler'
  if (years < JUNIOR_FROM) return 'primary'
  if (years < SENIOR_FROM) return 'junior'
  return 'senior'
}

/** 生日 + 今天 → 学段。生日不合法时返回 undefined,由调用方决定怎么办 */
export function stageFromBirthdate(birthdate: string, todayISO: string): AgeStage | undefined {
  if (!birthdate) return undefined
  const months = ageMonthsAt(birthdate, todayISO)
  if (months <= 0) return undefined
  return stageFromMonths(months)
}

/** 「4 岁 6 个月」这样的说法 —— 给家长看的,比「52 个月」好懂 */
export function describeAge(birthdate: string, todayISO: string): string {
  if (!birthdate) return ''
  const months = ageMonthsAt(birthdate, todayISO)
  if (months <= 0) return ''
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} 个月`
  return m === 0 ? `${y} 岁` : `${y} 岁 ${m} 个月`
}

/**
 * 每天建议的学习时长上限(分钟)与题量目标。
 *
 * 原先两个都是写死的:30 分钟 / 20 题。对一个 4 岁半、而且**是在晚上**用的
 * 孩子来说这太长了 —— 这个年纪的专注力本来就只有十几分钟,晚上又已经累了,
 * 硬撑到 30 分钟换来的是「学习 = 熬」这个印象,比少学十几分钟糟得多。
 *
 * 这两个值家长都能在家长中心改,这里只是把**默认值**放到合理的位置上,
 * 而不是让所有年龄共用一个数字。
 */
export function defaultDailyMinutes(stage: AgeStage): number {
  if (stage === 'toddler') return 15
  if (stage === 'primary') return 30
  return 45
}

export function defaultDailyGoal(stage: AgeStage): number {
  if (stage === 'toddler') return 10
  if (stage === 'primary') return 20
  return 30
}

export const STAGE_LABEL: Record<AgeStage, string> = {
  toddler: '幼儿园',
  primary: '小学',
  junior: '初中',
  senior: '高中',
}

/**
 * 距离升到下一个学段还有多少个月(已是最高段返回 undefined)。
 * 用来在快要升段时提前给家长打个招呼,而不是某天内容忽然全变了。
 */
export function monthsToNextStage(months: number): number | undefined {
  const years = months / 12
  if (years < PRIMARY_FROM) return Math.ceil(PRIMARY_FROM * 12 - months)
  if (years < JUNIOR_FROM) return Math.ceil(JUNIOR_FROM * 12 - months)
  if (years < SENIOR_FROM) return Math.ceil(SENIOR_FROM * 12 - months)
  return undefined
}
