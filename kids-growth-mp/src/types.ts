// 学习模块所需类型子集(从 kids-growth/src/types.ts 精简移植)

/** 年龄阶段:幼儿园 3–6 / 小学 6–12 / 初中 12–15 / 高中 15+ */
export type AgeStage = 'toddler' | 'primary' | 'junior' | 'senior'

/** 卡片内容类型,决定支持哪些练习模式 */
export type CardItemType = 'word' | 'poem' | 'hanzi' | 'wrong' | 'pic' | 'fact'
export type DeckSource = 'builtin' | 'custom' | 'wrong'

/** 练习模式 */
export type PracticeMode =
  | 'recognize'
  | 'listenChoose'
  | 'spell'
  | 'dictation'
  | 'speak'
  | 'fillBlank'
  | 'recite'
  | 'review'
  // 看图启蒙(pic)
  | 'picChoose'
  | 'listenPic'
  | 'picChooseEn'
  | 'listenPicEn'
  | 'earTrain'
  | 'pinyin'
  // 常识问答(fact)
  | 'quiz'

/** SRS 记忆状态机 */
export type SrsStatus = 'new' | 'learning' | 'review' | 'mastered'
/** 孩子对一张卡的评分(简化版) */
export type ReviewGrade = 'again' | 'good' | 'easy'

export interface LearnDeck {
  id: string
  childId?: string
  subject: string
  name: string
  icon: string
  source: DeckSource
  builtinKey?: string
  itemType: CardItemType
  createdAt: number
  /** 装上时内容包的版本;低于当前版本会自动补齐 */
  contentRev?: number
}

export interface LearnCard {
  id: string
  deckId: string
  front: string
  back: string
  phonetic?: string
  audioText?: string
  extra?: Record<string, unknown>
  order: number
}

export interface StudyState {
  id: string
  childId: string
  cardId: string
  deckId: string
  due: string
  interval: number
  ease: number
  reps: number
  lapses: number
  status: SrsStatus
  lastReviewed?: number
}

export interface StudySession {
  id: string
  childId: string
  deckId: string
  mode: PracticeMode
  date: string
  total: number
  correct: number
  durationSec: number
  pointsAwarded: number
  createdAt: number
}

export interface DrillResult {
  id: string
  childId: string
  kind: string
  date: string
  total: number
  correct: number
  durationSec: number
  createdAt: number
}

// ============ 成长记录(从网页版搬过来) ============

export type Gender = 'male' | 'female'

/** 身体发育记录:身高/体重/头围,用来画生长曲线 */
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

/** 通用记录引擎支持的模块 */
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

export type RecordFieldValue = string | number

/** 一条通用记录。字段 schema 由 core/recordModules.ts 的配置定义 */
export interface LogRecord {
  id: string
  childId: string
  module: RecordModule
  date: string
  fields: Record<string, RecordFieldValue>
  note?: string
  createdAt: number
}

export type ExamType = '单元测' | '月考' | '期中' | '期末' | '模考' | '其他'

export interface ExamRecord {
  id: string
  childId: string
  date: string
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
}

/** shine=闪光时刻(表扬具体行为) growth=成长时刻(挫折与引导) */
export type AnecdoteKind = 'shine' | 'growth'

export interface Anecdote {
  id: string
  childId: string
  date: string
  kind: AnecdoteKind
  /** 具体发生了什么(记录行为,不贴标签) */
  content: string
  /** 品格维度标签 */
  traits: string[]
  /** 家长当时如何引导(沉淀教养方法,可选) */
  parentAction?: string
  createdAt: number
}
