import type { Achievement, AgeStage, LevelStep, TaskCategory, TaskType } from '../types'

export interface TaskTemplate {
  title: string
  icon: string
  category: TaskCategory
  type: TaskType
  points: number
}

/** 分龄默认任务模板:导入时按孩子当前年龄阶段选择 */
export const DEFAULT_TASKS_BY_STAGE: Record<AgeStage, TaskTemplate[]> = {
  toddler: [
    { title: '自己吃饭', icon: '🍚', category: '生活', type: 'daily', points: 10 },
    { title: '自己刷牙洗脸', icon: '🪥', category: '生活', type: 'daily', points: 10 },
    { title: '自己穿衣穿鞋', icon: '👕', category: '生活', type: 'daily', points: 10 },
    { title: '自己上厕所', icon: '🚽', category: '生活', type: 'daily', points: 10 },
    { title: '按时午睡', icon: '😴', category: '生活', type: 'daily', points: 5 },
    { title: '收拾自己的玩具', icon: '🧸', category: '家务', type: 'daily', points: 10 },
    { title: '听绘本/亲子阅读', icon: '📖', category: '学习', type: 'daily', points: 10 },
    { title: '户外玩耍1小时', icon: '🌳', category: '运动', type: 'daily', points: 10 },
    { title: '和小朋友友好相处', icon: '🤝', category: '品德', type: 'daily', points: 5 },
    { title: '说请、谢谢、对不起', icon: '💗', category: '品德', type: 'daily', points: 5 },
  ],
  primary: [
    { title: '早睡早起', icon: '🌙', category: '生活', type: 'daily', points: 10 },
    { title: '自己刷牙', icon: '🪥', category: '生活', type: 'daily', points: 5 },
    { title: '好好吃饭不挑食', icon: '🍚', category: '生活', type: 'daily', points: 5 },
    { title: '自己整理书包/穿衣', icon: '🎒', category: '生活', type: 'daily', points: 5 },
    { title: '完成作业', icon: '✏️', category: '学习', type: 'daily', points: 15 },
    { title: '阅读20分钟', icon: '📖', category: '学习', type: 'daily', points: 10 },
    { title: '练琴/练字', icon: '🎹', category: '学习', type: 'daily', points: 15 },
    { title: '运动30分钟', icon: '⚽', category: '运动', type: 'daily', points: 10 },
    { title: '户外活动', icon: '🌳', category: '运动', type: 'daily', points: 5 },
    { title: '礼貌待人', icon: '🤝', category: '品德', type: 'daily', points: 5 },
    { title: '主动分享或帮助他人', icon: '💗', category: '品德', type: 'daily', points: 10 },
    { title: '整理房间', icon: '🧹', category: '家务', type: 'daily', points: 10 },
    { title: '帮忙做家务', icon: '🧺', category: '家务', type: 'daily', points: 10 },
  ],
  junior: [
    { title: '按计划完成作业', icon: '✏️', category: '学习', type: 'daily', points: 15 },
    { title: '预习明天的课程', icon: '📖', category: '学习', type: 'daily', points: 10 },
    { title: '整理错题本', icon: '📒', category: '学习', type: 'weekly', points: 15 },
    { title: '课外阅读30分钟', icon: '📚', category: '学习', type: 'daily', points: 10 },
    { title: '制定并执行学习计划', icon: '🗓️', category: '学习', type: 'weekly', points: 15 },
    { title: '运动30分钟', icon: '🏃', category: '运动', type: 'daily', points: 10 },
    { title: '11点前睡觉', icon: '🌙', category: '生活', type: 'daily', points: 10 },
    { title: '控制手机/游戏时间', icon: '📵', category: '生活', type: 'daily', points: 15 },
    { title: '主动分担家务', icon: '🧹', category: '家务', type: 'daily', points: 10 },
    { title: '和家人好好沟通', icon: '💬', category: '品德', type: 'daily', points: 5 },
  ],
  senior: [
    { title: '完成当日学习任务', icon: '✏️', category: '学习', type: 'daily', points: 15 },
    { title: '自主刷题/复习', icon: '📝', category: '学习', type: 'daily', points: 15 },
    { title: '整理错题与知识点', icon: '📒', category: '学习', type: 'weekly', points: 15 },
    { title: '周复盘与下周规划', icon: '🗓️', category: '学习', type: 'weekly', points: 20 },
    { title: '锻炼30分钟', icon: '🏃', category: '运动', type: 'daily', points: 10 },
    { title: '规律作息不熬夜', icon: '🌙', category: '生活', type: 'daily', points: 10 },
    { title: '自我管理电子设备', icon: '📵', category: '生活', type: 'daily', points: 10 },
    { title: '为家里做一件事', icon: '🏠', category: '家务', type: 'daily', points: 5 },
  ],
}

/** 向后兼容:未指定阶段时的默认(小学) */
export const DEFAULT_TASKS: TaskTemplate[] = DEFAULT_TASKS_BY_STAGE.primary

export const DEFAULT_REWARDS: Array<{ name: string; icon: string; costPoints: number }> = [
  { name: '睡前多讲一个故事', icon: '📚', costPoints: 40 },
  { name: '看30分钟动画片', icon: '📺', costPoints: 50 },
  { name: '多玩20分钟', icon: '🎮', costPoints: 60 },
  { name: '选今晚的一个小零食', icon: '🍪', costPoints: 60 },
  { name: '一次冰淇淋', icon: '🍦', costPoints: 80 },
  { name: '决定周末晚餐吃什么', icon: '🍜', costPoints: 120 },
  { name: '选一本新书', icon: '📖', costPoints: 150 },
  { name: '周末去公园/游乐场', icon: '🎡', costPoints: 250 },
  { name: '去电影院看一场电影', icon: '🎬', costPoints: 300 },
  { name: '一个心愿小礼物', icon: '🎁', costPoints: 500 },
]

export const DEFAULT_ACHIEVEMENTS: Array<Omit<Achievement, 'id'>> = [
  { code: 'first_checkin', name: '初来乍到', icon: '🐣', desc: '完成第一个任务', rule: { type: 'firstCheckin' } },
  { code: 'streak_7', name: '坚持之星', icon: '🔥', desc: '连续打卡7天', rule: { type: 'streak', days: 7 } },
  { code: 'streak_30', name: '毅力大师', icon: '🏆', desc: '连续打卡30天', rule: { type: 'streak', days: 30 } },
  { code: 'perfect_day', name: '完美一天', icon: '🌟', desc: '某天任务全部完成', rule: { type: 'perfectDay' } },
  { code: 'week_full', name: '全勤一周', icon: '📅', desc: '最近7天每天都有完成', rule: { type: 'weekFull' } },
  {
    code: 'study_30',
    name: '勤学小能手',
    icon: '📚',
    desc: '学习类累计完成30次',
    rule: { type: 'categoryCheckins', category: '学习', count: 30 },
  },
  {
    code: 'sport_30',
    name: '运动健将',
    icon: '🏃',
    desc: '运动类累计完成30次',
    rule: { type: 'categoryCheckins', category: '运动', count: 30 },
  },
  {
    code: 'chore_20',
    name: '家务小帮手',
    icon: '🧹',
    desc: '家务类累计完成20次',
    rule: { type: 'categoryCheckins', category: '家务', count: 20 },
  },
  { code: 'total_100', name: '百题达成', icon: '💯', desc: '累计完成100个任务', rule: { type: 'totalCheckins', count: 100 } },
  { code: 'first_redeem', name: '第一次兑换', icon: '🎁', desc: '首次兑换成功', rule: { type: 'firstRedeem' } },
  { code: 'first_growth', name: '成长开始', icon: '📏', desc: '首次记录身高体重', rule: { type: 'firstGrowth' } },
  { code: 'first_portfolio', name: '小小艺术家', icon: '🎨', desc: '首件作品入档', rule: { type: 'firstPortfolio' } },
  { code: 'level_5', name: '节节高升', icon: '⬆️', desc: '达到Lv5', rule: { type: 'level', level: 5 } },
  { code: 'level_10', name: '成长大师', icon: '👑', desc: '达到Lv10', rule: { type: 'level', level: 10 } },
]

/** 分龄里程碑预设:按孩子当前阶段展示对应清单(始终附加「自定义」) */
export const MILESTONE_PRESETS_BY_STAGE: Record<AgeStage, string[]> = {
  toddler: [
    '第一次翻身',
    '第一次坐',
    '第一次爬',
    '第一次走路',
    '长第一颗牙',
    '第一次叫爸爸/妈妈',
    '说第一句完整的话',
    '第一天上幼儿园',
    '第一次自己睡',
    '第一次登台表演',
  ],
  primary: [
    '第一天上小学',
    '第一次戴上红领巾',
    '掉第一颗乳牙',
    '第一次不用辅助轮骑车',
    '第一次游泳',
    '第一次独立完成作业',
    '第一次得奖/满分',
    '第一次登台表演',
    '第一次独自睡整晚',
    '第一次自己上下学',
  ],
  junior: [
    '小学毕业',
    '第一天上初中',
    '第一次住校',
    '第一次独自出行',
    '第一次大型考试',
    '第一次竞赛获奖',
    '身高超过妈妈/爸爸',
    '第一次做一顿完整的饭',
  ],
  senior: [
    '初中毕业/中考',
    '第一天上高中',
    '成人礼/18岁生日',
    '第一次模考',
    '确定目标院校/方向',
    '第一次独立旅行',
    '拿到第一个证书/驾照',
    '高考',
  ],
}

/** 向后兼容:未指定阶段时的完整清单 */
export const MILESTONE_PRESETS: string[] = [
  ...new Set(Object.values(MILESTONE_PRESETS_BY_STAGE).flat()),
]

export const DEFAULT_LEVEL_LADDER: LevelStep[] = [
  { level: 1, title: '🌱 萌芽', requiredXP: 0 },
  { level: 2, title: '🌿 嫩苗', requiredXP: 100 },
  { level: 3, title: '🌳 小树', requiredXP: 250 },
  { level: 4, title: '💪 茁壮', requiredXP: 500 },
  { level: 5, title: '🍃 繁叶', requiredXP: 900 },
  { level: 6, title: '🌸 开花', requiredXP: 1500 },
  { level: 7, title: '🍎 结果', requiredXP: 2200 },
  { level: 8, title: '🌲 大树', requiredXP: 3000 },
  { level: 9, title: '✨ 森林之星', requiredXP: 4000 },
  { level: 10, title: '⭐ 成长大师', requiredXP: 5200 },
]
