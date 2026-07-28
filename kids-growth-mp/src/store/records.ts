import { readTable, writeTable, readObject, writeObject } from './db'
import { newId } from '../core/id'
import { getRecordModule } from '../core/recordModules'
import type {
  Anecdote,
  AnecdoteKind,
  ExamRecord,
  ExamScore,
  Gender,
  GrowthRecord,
  LogRecord,
  RecordFieldValue,
  RecordModule,
} from '../types'

/**
 * 成长记录的数据层。
 *
 * 学习那套(卡组/卡片/SRS)在 store/study.ts,这里是**记录类**:
 * 身高体重、通用记录(视力/牙齿/就医/…)、考试成绩、闪光事例。
 * 都是「按日期倒序的一串条目」,读写模式一样,所以放在一起。
 */
const K = {
  growth: 'growthRecords',
  records: 'logRecords',
  exams: 'exams',
  scores: 'examScores',
  anecdotes: 'anecdotes',
  profile: 'childProfile',
} as const

/** 孩子的基本档案:算生长百分位必须知道性别和生日 */
export interface ChildProfile {
  name: string
  gender: Gender
  /** ISO 日期,如 2019-05-20 */
  birthdate: string
}

const EMPTY_PROFILE: ChildProfile = { name: '', gender: 'male', birthdate: '' }

export function getProfile(): ChildProfile {
  const p = readObject<ChildProfile>(K.profile, EMPTY_PROFILE)
  return {
    name: p && typeof p.name === 'string' ? p.name : '',
    gender: p && p.gender === 'female' ? 'female' : 'male',
    birthdate: p && typeof p.birthdate === 'string' ? p.birthdate : '',
  }
}

export function saveProfile(p: ChildProfile): void {
  writeObject(K.profile, p)
}

/** 按日期倒序(同一天的按录入时间倒序),列表页统一用这个顺序 */
function byDateDesc<T extends { date: string; createdAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
}

// ---------------------------------------------------------------- 身体发育

export function listGrowth(childId: string): GrowthRecord[] {
  return byDateDesc(readTable<GrowthRecord>(K.growth).filter((r) => r && r.childId === childId))
}

export function addGrowth(
  childId: string,
  input: { date: string; heightCm?: number; weightKg?: number; headCm?: number; note?: string },
): GrowthRecord {
  const row: GrowthRecord = {
    id: newId(),
    childId,
    date: input.date,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    headCm: input.headCm,
    note: input.note,
    createdAt: Date.now(),
  }
  writeTable(K.growth, [...readTable<GrowthRecord>(K.growth), row])
  return row
}

export function removeGrowth(id: string): void {
  writeTable(
    K.growth,
    readTable<GrowthRecord>(K.growth).filter((r) => r.id !== id),
  )
}

// ---------------------------------------------------------------- 通用记录

export function listRecords(childId: string, module: RecordModule): LogRecord[] {
  return byDateDesc(
    readTable<LogRecord>(K.records).filter((r) => r && r.childId === childId && r.module === module),
  )
}

/** 各模块各有多少条 —— 档案首页要在每个入口上显示数量 */
export function countRecordsByModule(childId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of readTable<LogRecord>(K.records)) {
    if (!r || r.childId !== childId) continue
    out[r.module] = (out[r.module] || 0) + 1
  }
  return out
}

export function addRecord(
  childId: string,
  module: RecordModule,
  date: string,
  fields: Record<string, RecordFieldValue>,
  note?: string,
): LogRecord {
  const row: LogRecord = { id: newId(), childId, module, date, fields, note, createdAt: Date.now() }
  writeTable(K.records, [...readTable<LogRecord>(K.records), row])
  return row
}

export function removeRecord(id: string): void {
  writeTable(
    K.records,
    readTable<LogRecord>(K.records).filter((r) => r.id !== id),
  )
}

/**
 * 校验一条记录能不能存。
 * 返回空串表示通过,否则是给家长看的提示语。
 */
export function validateRecord(
  module: RecordModule,
  fields: Record<string, RecordFieldValue>,
): string {
  const def = getRecordModule(module)
  if (!def) return '这个记录类型不存在'
  for (const f of def.fields) {
    if (f.required && (fields[f.key] === undefined || fields[f.key] === '')) {
      return `请填写「${f.label}」`
    }
  }
  if (def.requireAtLeastOne) {
    const any = def.fields.some((f) => fields[f.key] !== undefined && fields[f.key] !== '')
    if (!any) return '至少填一项才能保存'
  }
  return ''
}

// ---------------------------------------------------------------- 考试成绩

export interface ExamWithScores {
  exam: ExamRecord
  scores: ExamScore[]
}

export function listExams(childId: string): ExamWithScores[] {
  const scores = readTable<ExamScore>(K.scores)
  return byDateDesc(readTable<ExamRecord>(K.exams).filter((e) => e && e.childId === childId)).map(
    (exam) => ({ exam, scores: scores.filter((s) => s && s.examId === exam.id) }),
  )
}

export function addExam(
  childId: string,
  input: { date: string; examType: ExamRecord['examType']; name?: string; note?: string },
  scores: Array<{ subject: string; score: number; fullScore?: number; classRank?: number }>,
): ExamRecord {
  const exam: ExamRecord = {
    id: newId(),
    childId,
    date: input.date,
    examType: input.examType,
    name: input.name,
    note: input.note,
    createdAt: Date.now(),
  }
  writeTable(K.exams, [...readTable<ExamRecord>(K.exams), exam])
  writeTable(K.scores, [
    ...readTable<ExamScore>(K.scores),
    ...scores.map((s) => ({ id: newId(), examId: exam.id, childId, ...s })),
  ])
  return exam
}

export function removeExam(id: string): void {
  writeTable(
    K.exams,
    readTable<ExamRecord>(K.exams).filter((e) => e.id !== id),
  )
  writeTable(
    K.scores,
    readTable<ExamScore>(K.scores).filter((s) => s.examId !== id),
  )
}

export interface SubjectTrend {
  subject: string
  /** 按时间正序的得分率(0–100),用来画趋势 */
  points: Array<{ date: string; rate: number; score: number; fullScore: number }>
  latest: number
  delta: number
}

/**
 * 按科目算得分率趋势。
 *
 * 为什么用得分率而不是原始分:满分不一定是 100(单元测常见 50 分制),
 * 直接拿分数比会得出「这次考 48 比上次 92 退步了」的荒谬结论。
 */
export function subjectTrends(childId: string): SubjectTrend[] {
  const list = listExams(childId).slice().reverse() // 转成时间正序
  const bySubject = new Map<string, SubjectTrend>()
  for (const { exam, scores } of list) {
    for (const s of scores) {
      const full = s.fullScore && s.fullScore > 0 ? s.fullScore : 100
      const rate = Math.round((s.score / full) * 1000) / 10
      let t = bySubject.get(s.subject)
      if (!t) {
        t = { subject: s.subject, points: [], latest: 0, delta: 0 }
        bySubject.set(s.subject, t)
      }
      t.points.push({ date: exam.date, rate, score: s.score, fullScore: full })
    }
  }
  const out: SubjectTrend[] = []
  for (const t of bySubject.values()) {
    t.latest = t.points.length > 0 ? t.points[t.points.length - 1].rate : 0
    t.delta = t.points.length >= 2 ? Math.round((t.latest - t.points[t.points.length - 2].rate) * 10) / 10 : 0
    out.push(t)
  }
  return out.sort((a, b) => b.points.length - a.points.length)
}

// ---------------------------------------------------------------- 闪光事例

export function listAnecdotes(childId: string): Anecdote[] {
  return byDateDesc(readTable<Anecdote>(K.anecdotes).filter((a) => a && a.childId === childId))
}

export function addAnecdote(
  childId: string,
  input: { date: string; kind: AnecdoteKind; content: string; traits: string[]; parentAction?: string },
): Anecdote {
  const row: Anecdote = {
    id: newId(),
    childId,
    date: input.date,
    kind: input.kind,
    content: input.content,
    traits: input.traits,
    parentAction: input.parentAction,
    createdAt: Date.now(),
  }
  writeTable(K.anecdotes, [...readTable<Anecdote>(K.anecdotes), row])
  return row
}

export function removeAnecdote(id: string): void {
  writeTable(
    K.anecdotes,
    readTable<Anecdote>(K.anecdotes).filter((a) => a.id !== id),
  )
}

/** 品格画像:把事例上的标签汇总成「这孩子身上我们看见过什么」 */
export function traitProfile(childId: string): Array<{ trait: string; count: number }> {
  const tally = new Map<string, number>()
  for (const a of listAnecdotes(childId)) {
    for (const t of a.traits || []) tally.set(t, (tally.get(t) || 0) + 1)
  }
  return [...tally.entries()]
    .map(([trait, count]) => ({ trait, count }))
    .sort((a, b) => b.count - a.count)
}

/** 清掉这个模块的所有脏数据(缺 id / 缺日期的历史遗留条目) */
export function sanitizeRecords(): void {
  const fix = <T extends { id?: string; date?: string }>(key: string): void => {
    const rows = readTable<T>(key)
    const good = rows.filter((r) => r && r.id && typeof r.date === 'string' && r.date.length > 0)
    if (good.length !== rows.length) writeTable(key, good)
  }
  fix<GrowthRecord>(K.growth)
  fix<LogRecord>(K.records)
  fix<ExamRecord>(K.exams)
  fix<Anecdote>(K.anecdotes)
  // 成绩没有 date 字段,单独处理:孤儿分数(考试已删)要清掉
  const examIds = new Set(readTable<ExamRecord>(K.exams).map((e) => e.id))
  const scores = readTable<ExamScore>(K.scores)
  const goodScores = scores.filter((s) => s && s.id && examIds.has(s.examId))
  if (goodScores.length !== scores.length) writeTable(K.scores, goodScores)
}

export const RECORD_KEYS = K

// ---------------------------------------------------------------- 备份/恢复

export interface ArchiveBackup {
  v: 1
  at: number
  profile: ChildProfile
  growth: GrowthRecord[]
  records: LogRecord[]
  exams: ExamRecord[]
  scores: ExamScore[]
  anecdotes: Anecdote[]
}

/**
 * 把档案导成一段文本。
 *
 * 只导**记不回来的东西** —— 学习卡片和 SRS 进度丢了还能重学,
 * 但「三岁那年量的身高」「他第一次主动让玩具」这种,丢了就真没了。
 * 所以备份里不含卡片,体积小到能塞进剪贴板。
 */
export function exportArchive(): string {
  const backup: ArchiveBackup = {
    v: 1,
    at: Date.now(),
    profile: getProfile(),
    growth: readTable<GrowthRecord>(K.growth),
    records: readTable<LogRecord>(K.records),
    exams: readTable<ExamRecord>(K.exams),
    scores: readTable<ExamScore>(K.scores),
    anecdotes: readTable<Anecdote>(K.anecdotes),
  }
  return JSON.stringify(backup)
}

export interface ImportResult {
  ok: boolean
  message: string
  added: number
}

/**
 * 从一段备份文本恢复。
 *
 * 用**合并**而不是覆盖:同一条记录(id 相同)不重复导入,
 * 本地已有但备份里没有的记录也不会被删掉。
 * 换手机、两台设备各记了一些,都不会丢东西。
 */
export function importArchive(text: string): ImportResult {
  let data: ArchiveBackup
  try {
    data = JSON.parse(text) as ArchiveBackup
  } catch {
    return { ok: false, message: '这段文字不是备份数据,检查一下有没有复制完整', added: 0 }
  }
  if (!data || data.v !== 1) {
    return { ok: false, message: '备份格式对不上,可能不是这个程序导出的', added: 0 }
  }

  let added = 0
  const merge = <T extends { id: string }>(key: string, incoming: T[] | undefined): void => {
    if (!Array.isArray(incoming)) return
    const cur = readTable<T>(key)
    const have = new Set(cur.map((r) => r.id))
    const fresh = incoming.filter((r) => r && r.id && !have.has(r.id))
    if (fresh.length === 0) return
    added += fresh.length
    writeTable(key, [...cur, ...fresh])
  }

  merge<GrowthRecord>(K.growth, data.growth)
  merge<LogRecord>(K.records, data.records)
  merge<ExamRecord>(K.exams, data.exams)
  merge<ExamScore>(K.scores, data.scores)
  merge<Anecdote>(K.anecdotes, data.anecdotes)

  // 本地还没填过资料才用备份里的,不覆盖已经填好的
  const cur = getProfile()
  if (!cur.birthdate && data.profile && data.profile.birthdate) saveProfile(data.profile)

  return {
    ok: true,
    message: added > 0 ? `恢复了 ${added} 条记录` : '备份里的记录本地都已经有了,没有重复导入',
    added,
  }
}
