import Dexie, { type EntityTable } from 'dexie'
import type {
  Achievement,
  Child,
  CheckIn,
  DiaryEntry,
  GrowthRecord,
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

  constructor() {
    super('kids-growth-db')
    this.version(1).stores({
      children: 'id, name, createdAt',
      tasks: 'id, childId, category, type, active, createdAt',
      checkIns: 'id, taskId, childId, date, status, [childId+date]',
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
  }
}

export const db = new GrowthDB()
