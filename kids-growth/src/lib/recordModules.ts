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
  {
    module: 'dental',
    group: 'health',
    label: '牙齿记录',
    icon: '🦷',
    addLabel: '新增牙齿记录',
    hasNote: true,
    hasPhotos: true,
    fields: [
      {
        key: 'event',
        label: '事项',
        type: 'select',
        required: true,
        options: ['长牙', '换牙', '龋齿', '补牙', '拔牙', '正畸', '洁牙', '常规检查', '其他'],
      },
      { key: 'position', label: '牙位', type: 'text', placeholder: '如「左下第一乳磨牙」，可选' },
    ],
    summarize: (f) => [fmt(f.event), fmt(f.position)].filter(Boolean).join(' · ') || '牙齿记录',
  },
  {
    module: 'medical',
    group: 'health',
    label: '就医记录',
    icon: '🏥',
    addLabel: '新增就医记录',
    hasNote: true,
    hasPhotos: true,
    disclaimer: '就医与用药信息请以医院病历为准，此处仅作家庭备忘。',
    fields: [
      { key: 'symptom', label: '症状', type: 'text', required: true, placeholder: '如「发烧38.5°C、咳嗽」' },
      { key: 'diagnosis', label: '诊断', type: 'text', placeholder: '如「急性支气管炎」' },
      { key: 'medication', label: '用药', type: 'text', placeholder: '药名与剂量' },
      { key: 'hospital', label: '医院/科室', type: 'text', placeholder: '可选' },
      { key: 'allergy', label: '新发现过敏', type: 'text', placeholder: '如「青霉素过敏」，重要！' },
    ],
    summarize: (f) =>
      [fmt(f.symptom), fmt(f.diagnosis), f.allergy ? `⚠️过敏:${f.allergy}` : null]
        .filter(Boolean)
        .join(' · ') || '就医记录',
  },
  {
    module: 'checkup',
    group: 'health',
    label: '体检记录',
    icon: '🩺',
    addLabel: '新增体检记录',
    hasNote: true,
    hasPhotos: true,
    disclaimer: '体检结论请以体检机构报告为准；身高体重请在「身体发育记录」中登记以纳入生长曲线。',
    fields: [
      { key: 'org', label: '体检机构', type: 'text', placeholder: '如「市妇幼保健院」「学校体检」' },
      { key: 'conclusion', label: '主要结论', type: 'text', required: true, placeholder: '如「各项正常」' },
      { key: 'followUp', label: '需复查/关注项', type: 'text', placeholder: '可选' },
    ],
    summarize: (f) =>
      [fmt(f.conclusion), f.followUp ? `复查:${f.followUp}` : null].filter(Boolean).join(' · ') ||
      '体检记录',
  },
  {
    module: 'vaccine',
    group: 'health',
    label: '疫苗接种',
    icon: '💉',
    addLabel: '新增接种记录',
    hasNote: true,
    fields: [
      {
        key: 'name',
        label: '疫苗名称',
        type: 'select',
        required: true,
        options: [
          '乙肝疫苗',
          '卡介苗',
          '脊灰疫苗',
          '百白破疫苗',
          '麻腮风疫苗',
          '乙脑疫苗',
          '流脑疫苗',
          '甲肝疫苗',
          '水痘疫苗',
          '手足口(EV71)疫苗',
          '流感疫苗',
          'HPV疫苗',
          '新冠疫苗',
          '狂犬疫苗',
          '其他',
        ],
      },
      { key: 'dose', label: '第几剂', type: 'number', min: 1, step: 1, placeholder: '如 2' },
      { key: 'org', label: '接种单位', type: 'text', placeholder: '可选' },
    ],
    summarize: (f) =>
      [fmt(f.name), f.dose ? `第${f.dose}剂` : null].filter(Boolean).join(' · ') || '接种记录',
  },
  {
    module: 'grading',
    group: 'talent',
    label: '考级记录',
    icon: '🏅',
    addLabel: '新增考级记录',
    hasNote: true,
    hasPhotos: true,
    fields: [
      { key: 'project', label: '项目', type: 'text', required: true, placeholder: '如「钢琴」「围棋」「剑桥英语」' },
      { key: 'level', label: '级别/证书', type: 'text', required: true, placeholder: '如「五级」「KET」「业余1段」' },
      { key: 'result', label: '结果', type: 'select', options: ['通过', '优秀', '良好', '未通过'] },
      { key: 'org', label: '考级机构', type: 'text', placeholder: '可选' },
    ],
    summarize: (f) =>
      [fmt(f.project), fmt(f.level), fmt(f.result)].filter(Boolean).join(' · ') || '考级记录',
  },
  {
    module: 'award',
    group: 'talent',
    label: '比赛获奖',
    icon: '🏆',
    addLabel: '新增获奖记录',
    hasNote: true,
    hasPhotos: true,
    fields: [
      { key: 'contest', label: '比赛名称', type: 'text', required: true, placeholder: '如「市青少年绘画大赛」' },
      { key: 'prize', label: '奖项', type: 'text', required: true, placeholder: '如「一等奖」「金奖」' },
      {
        key: 'scope',
        label: '级别',
        type: 'select',
        options: ['校级', '区级', '市级', '省级', '国家级', '国际级'],
      },
    ],
    summarize: (f) =>
      [fmt(f.contest), fmt(f.scope), fmt(f.prize)].filter(Boolean).join(' · ') || '获奖记录',
  },
  {
    module: 'emotion',
    group: 'wellbeing',
    label: '情绪记录',
    icon: '🌤️',
    addLabel: '记一次情绪',
    hasNote: true,
    disclaimer: '情绪记录用于观察规律、更好地陪伴，仅供家庭参考，非心理评估或诊断。',
    fields: [
      {
        key: 'mood',
        label: '情绪',
        type: 'select',
        required: true,
        options: ['开心', '平静', '疲惫', '烦躁', '焦虑', '难过', '愤怒'],
      },
      { key: 'intensity', label: '强度（1轻微—5强烈）', type: 'rating', max: 5 },
      { key: 'trigger', label: '触发事件', type: 'text', placeholder: '如「和同学闹矛盾」，可选' },
    ],
    summarize: (f) =>
      [fmt(f.mood), f.intensity ? `强度${f.intensity}` : null, fmt(f.trigger)]
        .filter(Boolean)
        .join(' · ') || '情绪记录',
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
