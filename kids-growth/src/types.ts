export type Gender = 'male' | 'female'

/** 年龄阶段:幼儿园 3–6 / 小学 6–12 / 初中 12–15 / 高中 15+ */
export type AgeStage = 'toddler' | 'primary' | 'junior' | 'senior'
/** 界面语气:低龄童趣 / 大童(约12岁+)克制的「成长模式」 */
export type UiTone = 'playful' | 'mature'

export type TaskCategory = '生活' | '学习' | '运动' | '品德' | '家务' | '其他'
export type TaskType = 'daily' | 'weekly' | 'once'
export type CheckInStatus = 'done' | 'undo'
export type LedgerReason = 'checkin' | 'redeem' | 'achievement' | 'manual' | 'study'
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
    | 'firstExam'
    | 'firstAnecdote'
    | 'firstStudy'
    | 'wordsMastered'
    | 'studyStreak'
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
  /** 每个孩子的每日学习目标(练习卡次),按 childId 索引 */
  learnGoals?: Record<string, number>
  /** 每个孩子已收集的贴纸 key 列表,按 childId 索引 */
  stickers?: Record<string, string[]>
  /** 每个孩子的学习宠物(养成),按 childId 索引 */
  pets?: Record<string, { line: string; fed: number }>
  /** 每个孩子毕业(养到最终形态)的宠物系 key 列表,按 childId 索引 */
  petTrophies?: Record<string, string[]>
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

// ============ 学习引擎 ============

/** 卡片内容类型,决定支持哪些练习模式 */
export type CardItemType = 'word' | 'poem' | 'hanzi' | 'wrong' | 'pic' | 'fact'
export type DeckSource = 'builtin' | 'custom' | 'wrong'
/** 练习模式 */
export type PracticeMode =
  | 'recognize' // 认词/认字:看正面想背面
  | 'listenChoose' // 听音选义
  | 'spell' // 拼写
  | 'dictation' // 听写(批次1)
  | 'speak' // 跟读(语音识别比对)
  | 'fillBlank' // 古诗挖空(批次2)
  | 'recite' // 朗读对照(批次2)
  | 'review' // 错题:看题回想→自评
  | 'picChoose' // 幼儿:看图选名字
  | 'listenPic' // 幼儿:听音选图
  | 'picChooseEn' // 幼儿英语:看图选英语单词
  | 'listenPicEn' // 幼儿英语:听英语选图
  | 'earTrain' // 幼儿英语:磨耳朵(中英自动连播)
  | 'quiz' // 问答:看题四选一(科学/安全/成语/地理等)

/** SRS 记忆状态机 */
export type SrsStatus = 'new' | 'learning' | 'review' | 'mastered'
/** 孩子对一张卡的评分(简化版) */
export type ReviewGrade = 'again' | 'good' | 'easy'

export interface LearnDeck {
  id: string
  /** builtin 卡组 childId 为空(共享);custom/wrong 归属某孩子 */
  childId?: string
  subject: string // 英语/语文/数学…
  name: string
  icon: string
  source: DeckSource
  builtinKey?: string // 内置内容包 key,如 'words-primary'
  itemType: CardItemType
  /** 已同步到的内容包版本(内容包修订后自动刷新卡片) */
  contentRev?: number
  createdAt: number
}

export interface LearnCard {
  id: string
  deckId: string
  front: string // 正面(单词/字/题干)
  back: string // 背面(释义/答案)
  phonetic?: string // 音标
  audioText?: string // 用于发音的文本(缺省用 front)
  extra?: Record<string, unknown> // pos/例句/拼音/诗句…
  order: number
}

export interface StudyState {
  id: string
  childId: string
  cardId: string
  deckId: string
  due: string // ISO date,到期应复习
  interval: number // 天
  ease: number // 难度系数(SM-2)
  reps: number // 连续答对次数
  lapses: number // 遗忘次数
  status: SrsStatus
  lastReviewed?: number
}

export interface StudySession {
  id: string
  childId: string
  deckId: string
  mode: PracticeMode
  date: string // ISO date
  total: number
  correct: number
  durationSec: number
  pointsAwarded: number
  createdAt: number
}

export interface DrillResult {
  id: string
  childId: string
  kind: string // add/sub/mul/div/mulTable/mixed
  date: string
  total: number
  correct: number
  durationSec: number
  createdAt: number
}
