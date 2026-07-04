export type Gender = 'male' | 'female'

/** 年龄阶段:幼儿园 3–6 / 小学 6–12 / 初中 12–15 / 高中 15+ */
export type AgeStage = 'toddler' | 'primary' | 'junior' | 'senior'
/** 界面语气:低龄童趣 / 大童(约12岁+)克制的「成长模式」 */
export type UiTone = 'playful' | 'mature'

export type TaskCategory = '生活' | '学习' | '运动' | '品德' | '家务' | '其他'
export type TaskType = 'daily' | 'weekly' | 'once'
export type CheckInStatus = 'done' | 'undo'
export type LedgerReason = 'checkin' | 'redeem' | 'achievement' | 'manual'
export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled'
export type PortfolioType = '画作' | '手工' | '作业' | '证书' | '奖状' | '照片' | '其他'
export type Mood = 'happy' | 'proud' | 'calm' | 'tired' | 'sad'

export interface Child {
  id: string
  name: string
  nickname?: string
  gender: Gender
  birthdate: string // ISO date
  avatar?: string // base64 data URL
  /** 小学入学年份(如 2021),用于推导年级/学期;缺省时按年龄回退 */
  enrollmentYear?: number
  createdAt: number
}

export interface Task {
  id: string
  childId: string
  title: string
  icon: string
  category: TaskCategory
  type: TaskType
  weeklyDays?: number[] // 0=周日..6=周六, for weekly type
  points: number
  active: boolean
  createdAt: number
}

export interface CheckIn {
  id: string
  taskId: string
  childId: string
  date: string // ISO date (day granularity)
  status: CheckInStatus
  pointsAwarded: number
  note?: string
  createdAt: number
}

export interface PointLedger {
  id: string
  childId: string
  delta: number
  reason: LedgerReason
  refType?: 'checkin' | 'redeem' | 'achievement' | 'manual'
  refId?: string
  balanceAfter: number
  timestamp: number
}

export interface LevelStep {
  level: number
  title: string
  requiredXP: number
}

export interface AchievementRule {
  type:
    | 'firstCheckin'
    | 'streak'
    | 'perfectDay'
    | 'weekFull'
    | 'totalCheckins'
    | 'categoryCheckins'
    | 'firstRedeem'
    | 'firstGrowth'
    | 'firstPortfolio'
    | 'level'
  days?: number
  count?: number
  category?: TaskCategory
  level?: number
}

export interface Achievement {
  id: string
  code: string
  name: string
  desc: string
  icon: string
  rule: AchievementRule
}

export interface Unlock {
  id: string
  childId: string
  achievementCode: string
  unlockedAt: number
}

export interface Reward {
  id: string
  childId?: string // undefined = shared across children
  name: string
  icon: string
  costPoints: number
  stock?: number
  active: boolean
}

export interface Redemption {
  id: string
  childId: string
  rewardId: string
  costPoints: number
  status: RedemptionStatus
  requestedAt: number
  decidedAt?: number
}

export interface GrowthRecord {
  id: string
  childId: string
  date: string
  heightCm?: number
  weightKg?: number
  headCm?: number
  note?: string
  createdAt: number
}

export interface Milestone {
  id: string
  childId: string
  date: string
  type: string
  title: string
  note?: string
  photo?: string
  createdAt: number
}

export interface Portfolio {
  id: string
  childId: string
  date: string
  type: PortfolioType
  title: string
  desc?: string
  photos: string[]
  tags: string[]
  createdAt: number
}

export interface DiaryEntry {
  id: string
  childId: string
  date: string
  title?: string
  content: string
  photos: string[]
  mood?: Mood
  createdAt: number
}

export interface Settings {
  id: 'singleton'
  parentPin: string
  theme: 'default'
  enablePenalty: boolean
  levelLadder: LevelStep[]
  lastBackupAt?: number
}

// ============ 通用记录引擎 ============

/** 通用记录模块标识;新增记录类型只需在 RECORD_MODULES 加配置 */
export type RecordModule =
  | 'vision' // 视力
  | 'dental' // 牙齿
  | 'medical' // 就医
  | 'checkup' // 体检
  | 'vaccine' // 疫苗
  | 'grading' // 考级
  | 'award' // 比赛获奖
  | 'emotion' // 情绪
  | 'reading' // 阅读

export type RecordFieldValue = string | number | boolean

export interface LogRecord {
  id: string
  childId: string
  module: RecordModule
  date: string // ISO date
  /** 字段值,schema 由 RECORD_MODULES 配置定义 */
  fields: Record<string, RecordFieldValue>
  /** 可选关联(如考级/获奖关联某个兴趣的 id) */
  refId?: string
  note?: string
  photos: string[]
  createdAt: number
}

// ============ 学业成绩 ============

export type ExamType = '单元测' | '月考' | '期中' | '期末' | '模考' | '其他'

export interface ExamRecord {
  id: string
  childId: string
  date: string
  /** 学期,如「三年级上」;缺省由入学年份推导 */
  term?: string
  examType: ExamType
  /** 考试名称,如「第三单元数学测验」 */
  name?: string
  note?: string
  createdAt: number
}

export interface ExamScore {
  id: string
  examId: string
  childId: string
  subject: string
  score: number
  fullScore?: number
  classRank?: number
  gradeRank?: number
  classAvg?: number
}

// ============ 事例记录 ============

/** shine=闪光时刻(表扬具体行为) growth=成长时刻(挫折/错误与引导) */
export type AnecdoteKind = 'shine' | 'growth'

export interface Anecdote {
  id: string
  childId: string
  date: string
  kind: AnecdoteKind
  /** 具体发生了什么(记录行为,不贴标签) */
  content: string
  /** 品格维度标签:诚实/责任/勇气/同理心/坚持/自律/分享/专注… */
  traits: string[]
  /** 家长当时如何引导(沉淀教养方法,可选) */
  parentAction?: string
  photos: string[]
  createdAt: number
}

// ============ 兴趣特长 ============

export interface Interest {
  id: string
  childId: string
  name: string // 钢琴/画画/篮球/编程…
  icon: string
  category?: string // 艺术/体育/学科/科技…
  active: boolean
  startedAt?: string // ISO date
  note?: string
  createdAt: number
}
