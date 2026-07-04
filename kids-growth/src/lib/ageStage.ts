import { ageInMonths } from './age'
import type { AgeStage, UiTone } from '../types'

/** 满该年龄(周岁)后界面切换为克制的「成长模式」。 */
export const MATURE_TONE_FROM_AGE = 12

export interface AgeStageMeta {
  stage: AgeStage
  label: string
  emoji: string
  /** 年龄下限(含),周岁 */
  fromAge: number
  /** 仪表盘侧重点说明(供文案) */
  focus: string
}

export const AGE_STAGES: AgeStageMeta[] = [
  { stage: 'toddler', label: '幼儿园', emoji: '🧸', fromAge: 0, focus: '生活自理与发育' },
  { stage: 'primary', label: '小学', emoji: '🎒', fromAge: 6, focus: '习惯养成与学业起步' },
  { stage: 'junior', label: '初中', emoji: '📚', fromAge: 12, focus: '学业、情绪与自主管理' },
  { stage: 'senior', label: '高中', emoji: '🎓', fromAge: 15, focus: '学业规划与身心状态' },
]

export function getAgeYears(birthdate: string, atDate: Date = new Date()): number {
  return Math.floor(ageInMonths(birthdate, atDate) / 12)
}

export function getAgeStage(birthdate: string, atDate: Date = new Date()): AgeStage {
  const years = getAgeYears(birthdate, atDate)
  let current: AgeStageMeta = AGE_STAGES[0]
  for (const meta of AGE_STAGES) {
    if (years >= meta.fromAge) current = meta
  }
  return current.stage
}

export function getStageMeta(stage: AgeStage): AgeStageMeta {
  return AGE_STAGES.find((m) => m.stage === stage) ?? AGE_STAGES[0]
}

export function getUiTone(birthdate: string, atDate: Date = new Date()): UiTone {
  return getAgeYears(birthdate, atDate) >= MATURE_TONE_FROM_AGE ? 'mature' : 'playful'
}

/** 按入学年份推导当前年级(一年级=1);没有入学年份时按年龄回退(6 岁入学)。 */
export function getGradeNumber(
  birthdate: string,
  enrollmentYear: number | undefined,
  atDate: Date = new Date(),
): number | null {
  // 学年从 9 月开始:9 月前算上一学年
  const schoolYear = atDate.getMonth() + 1 >= 9 ? atDate.getFullYear() : atDate.getFullYear() - 1
  const startYear = enrollmentYear ?? new Date(birthdate).getFullYear() + 6
  const grade = schoolYear - startYear + 1
  if (grade < 1 || grade > 12) return null
  return grade
}

export function formatGrade(grade: number | null): string {
  if (grade === null) return ''
  if (grade <= 6) return `${'一二三四五六'[grade - 1]}年级`
  if (grade <= 9) return `初${'一二三'[grade - 7]}`
  return `高${'一二三'[grade - 10]}`
}
