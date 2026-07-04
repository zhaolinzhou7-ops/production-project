import Dexie, { type EntityTable } from 'dexie'
import type {
  Achievement,
  Anecdote,
  Child,
  CheckIn,
  DiaryEntry,
  ExamRecord,
  ExamScore,
  GrowthRecord,
  Interest,
  LogRecord,
  Milestone,
  PointLedger,
  Portfolio,
  Redemption,
  Reward,
  Settings,
  Task,
  Unlock,
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
  }
}

export const db = new GrowthDB()
