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
  // 说给我听:他说,家长判 —— 补上「产出」这一环
  | 'sayIt'
  // 英语·跟我读:听范读 → 他读出来 → 家长判(这是「读单词」那一环)
  | 'speakEn'
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

/**
 * 错题「怎么重做」。
 *
 * 原先错题重做只有一种形式:看题干 → 回想 → 自己点「会 / 不会」。
 * 那对一个 4 岁半、不识字的孩子等于没有 —— 他既读不了题干,
 * 也不可能诚实地评判自己。**自评是成年人才做得到的事。**
 *
 * 所以错题要以**它当初被答错的那种形式**回来:
 * - 选择题错的 → 还是选择题(A–E 五个选项)
 * - 算术算错的 → 还是让他算,输入答案
 * 这样「重做」才真的是重做,而不是看一眼答案。
 */
export type RedoSpec =
  | {
      type: 'choice'
      /** 选项文本,2–5 个;第一个不一定是答案,存的时候已经打乱 */
      options: string[]
      /** 正确选项的文本(比存下标稳:选项顺序将来变了也不会错位) */
      answer: string
      /**
       * 选项是**图**还是**文字**。
       *
       * 这一条是「不要换类型」的关键:听音选图错了,重做还得是点图;
       * 看图选单词错了,重做还得是选单词。
       * 少了它,界面只能一律按文字排,图片题就被悄悄变成了单词题。
       */
      optionKind?: 'text' | 'emoji'
      /** 题面上要显示的大图(emoji),没有就不显示 */
      emoji?: string
      /** 点「再听一遍」时读什么 */
      audio?: string
      /** 读的是中文还是英文 */
      lang?: 'zh' | 'en'
    }
  | {
      type: 'input'
      answer: number
      /** 数形结合图示(口算错题带过来的) */
      visual?: MathVisual
    }
  | {
      /** 拼写/听写错的 → 还是让他拼一遍 */
      type: 'spell'
      answer: string
      emoji?: string
      audio?: string
    }
  | {
      /** 跟我读错的 → 还是听范读、读出来、家长判 */
      type: 'speak'
      answer: string
      emoji?: string
      audio?: string
    }

/** 数形结合图示(与 core/mathDrill 的同名类型一致,放这里避免类型层反向依赖) */
export interface MathVisual {
  groups: Array<{ emoji: string; n: number }>
  ops: string[]
  strike?: number
}

