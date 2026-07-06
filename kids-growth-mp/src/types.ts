// 学习模块所需类型子集(从 kids-growth/src/types.ts 精简移植)

/** 年龄阶段:幼儿园 3–6 / 小学 6–12 / 初中 12–15 / 高中 15+ */
export type AgeStage = 'toddler' | 'primary' | 'junior' | 'senior'

/** 卡片内容类型,决定支持哪些练习模式 */
export type CardItemType = 'word' | 'poem' | 'hanzi' | 'wrong'
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
