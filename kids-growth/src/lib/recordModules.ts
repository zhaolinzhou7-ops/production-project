import type { AgeStage, RecordFieldValue, RecordModule } from '../types'

export type RecordFieldType = 'number' | 'text' | 'select' | 'rating'

export interface RecordFieldDef {
  key: string
  label: string
  type: RecordFieldType
  unit?: string
  required?: boolean
  /** select 的选项 */
  options?: string[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

export interface TrendFieldDef {
  key: string
  label: string
  color: string
}

export type RecordModuleGroup = 'health' | 'learning' | 'talent' | 'wellbeing'

export interface RecordModuleDef {
  module: RecordModule
  group: RecordModuleGroup
  label: string
  icon: string
  addLabel: string
  fields: RecordFieldDef[]
  /** 需要画趋势线的数值字段(有 ≥2 条含该字段的记录时展示) */
  trendFields?: TrendFieldDef[]
  /** 适用的年龄阶段(缺省=全龄) */
  stages?: AgeStage[]
  /** 至少填写一个字段(用于全部字段可选的模块) */
  requireAtLeastOne?: boolean
  hasNote?: boolean
  hasPhotos?: boolean
  disclaimer?: string
  /** 列表项摘要 */
  summarize: (fields: Record<string, RecordFieldValue>) => string
}

function fmt(v: RecordFieldValue | undefined, suffix = ''): string | null {
  if (v === undefined || v === '' || v === false) return null
  return `${v}${suffix}`
}

export const RECORD_MODULES: RecordModuleDef[] = [
  {
    module: 'vision',
    group: 'health',
    label: '视力记录',
    icon: '👁️',
    addLabel: '新增视力记录',
    requireAtLeastOne: true,
    hasNote: true,
    disclaimer: '仅供家庭参考，非医学验光结论；视力异常请前往正规医院眼科检查。',
    fields: [
      { key: 'leftEyesight', label: '左眼裸眼视力', type: 'number', step: 0.1, placeholder: '如 4.9 或 1.0' },
      { key: 'rightEyesight', label: '右眼裸眼视力', type: 'number', step: 0.1, placeholder: '如 5.0 或 1.2' },
      { key: 'leftDegree', label: '左眼近视度数', type: 'number', unit: '度', step: 25, placeholder: '如 100' },
      { key: 'rightDegree', label: '右眼近视度数', type: 'number', unit: '度', step: 25, placeholder: '如 75' },
    ],
    trendFields: [
      { key: 'leftDegree', label: '左眼度数', color: '#f9497a' },
      { key: 'rightDegree', label: '右眼度数', color: '#34c9a3' },
    ],
    summarize: (f) => {
      const parts: string[] = []
      const sight = [fmt(f.leftEyesight), fmt(f.rightEyesight)]
      if (sight[0] || sight[1]) parts.push(`裸眼 ${sight[0] ?? '—'} / ${sight[1] ?? '—'}`)
      const deg = [fmt(f.leftDegree, '°'), fmt(f.rightDegree, '°')]
      if (deg[0] || deg[1]) parts.push(`近视 ${deg[0] ?? '—'} / ${deg[1] ?? '—'}`)
      return parts.join(' · ') || '视力记录'
    },
  },
]

export function getRecordModule(module: string): RecordModuleDef | undefined {
  return RECORD_MODULES.find((m) => m.module === module)
}

export function getModulesByGroup(group: RecordModuleGroup, stage?: AgeStage): RecordModuleDef[] {
  return RECORD_MODULES.filter(
    (m) => m.group === group && (!m.stages || !stage || m.stages.includes(stage)),
  )
}
