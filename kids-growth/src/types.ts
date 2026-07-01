export type Gender = 'male' | 'female'

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
