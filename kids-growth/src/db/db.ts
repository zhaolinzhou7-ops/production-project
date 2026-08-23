import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  Achievement,
  Anecdote,
  Child,
  CheckIn,
  DiaryEntry,
  DrillResult,
  ExamRecord,
  ExamScore,
  GrowthRecord,
  Interest,
  LearnCard,
  LearnDeck,
  LogRecord,
  Milestone,
  PointLedger,
  Portfolio,
  Redemption,
  Reward,
  Settings,
  StudySession,
  StudyState,
  Task,
  Unlock,
  VoiceClip,
} from '../types'

export class GrowthDB extends Dexie {
  children!: EntityTable<Child, 'id'>
  tasks!: EntityTable<Task, 'id'>
  checkIns!: EntityTable<CheckIn, 'id'>
  pointLedger!: EntityTable<PointLedger, 'id'>
  achievements!: EntityTable<Achievement, 'id'>
  unlocks!: EntityTable<Unlock, 'id'>
  rewards!: EntityTable<Reward, 'id'>
  redemptions!: EntityTable<Redemption, 'id'>
  growthRecords!: EntityTable<GrowthRecord, 'id'>
  milestones!: EntityTable<Milestone, 'id'>
  portfolios!: EntityTable<Portfolio, 'id'>
  diaryEntries!: EntityTable<DiaryEntry, 'id'>
  settings!: EntityTable<Settings, 'id'>
  records!: EntityTable<LogRecord, 'id'>
  exams!: EntityTable<ExamRecord, 'id'>
  examScores!: EntityTable<ExamScore, 'id'>
  anecdotes!: EntityTable<Anecdote, 'id'>
  interests!: EntityTable<Interest, 'id'>
  decks!: EntityTable<LearnDeck, 'id'>
  cards!: EntityTable<LearnCard, 'id'>
  studyStates!: EntityTable<StudyState, 'id'>
  studySessions!: EntityTable<StudySession, 'id'>
  drillResults!: EntityTable<DrillResult, 'id'>
  voices!: Table<VoiceClip, [string, string]>

  constructor() {
    super('kids-growth-db')
    this.version(1).stores({
      children: 'id, name, createdAt',
      tasks: 'id, childId, category, type, active, createdAt',
      checkIns: 'id, taskId, childId, date, status, [childId+date], [taskId+date]',
      pointLedger: 'id, childId, timestamp',
      achievements: 'id, code',
      unlocks: 'id, childId, achievementCode, [childId+achievementCode]',
      rewards: 'id, childId, active',
      redemptions: 'id, childId, rewardId, status, requestedAt',
      growthRecords: 'id, childId, date',
      milestones: 'id, childId, date',
      portfolios: 'id, childId, date',
      diaryEntries: 'id, childId, date',
      settings: 'id',
    })
    // v2:全龄化扩展 — 通用记录引擎 + 学业成绩 + 事例 + 兴趣(纯新增表,旧数据无需迁移)
    this.version(2).stores({
      records: 'id, childId, module, date, [childId+module]',
      exams: 'id, childId, date',
      examScores: 'id, examId, childId, subject, [childId+subject]',
      anecdotes: 'id, childId, date, kind',
      interests: 'id, childId, active',
    })
    // v3:学习引擎 — 卡组/卡片/SRS 状态/会话/口算结果(纯新增表)
    this.version(3).stores({
      decks: 'id, childId, subject, source, builtinKey',
      cards: 'id, deckId',
      studyStates:
        'id, childId, cardId, deckId, due, status, [childId+due], [childId+deckId], [childId+cardId]',
      studySessions: 'id, childId, deckId, date, [childId+date]',
      drillResults: 'id, childId, date',
    })
    /*
      v4:本机录音(纯新增表)。

      主键写成复合的 [owner+key],而不是自增 id —— 这样「同一个人重录同一句」
      天然就是覆盖,不需要先查再删;而家长和孩子录同一句是两条,互不干扰。
      录音只存本机,不上传。
    */
    this.version(4).stores({
      voices: '[owner+key], owner, at',
    })
  }
}

export const db = new GrowthDB()
