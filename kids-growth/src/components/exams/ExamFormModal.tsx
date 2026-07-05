import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { ExamRecord, ExamScore, ExamType } from '../../types'
import { todayISO } from '../../lib/dateUtils'
import { SUBJECT_PRESETS } from '../../lib/traits'

const EXAM_TYPES: ExamType[] = ['单元测', '月考', '期中', '期末', '模考', '其他']

export interface ExamScoreDraft {
  subject: string
  score: string
  fullScore: string
  classRank: string
  gradeRank: string
  classAvg: string
}

export interface ExamFormValues {
  date: string
  examType: ExamType
  name?: string
  note?: string
  scores: Array<{
    subject: string
    score: number
    fullScore?: number
    classRank?: number
    gradeRank?: number
    classAvg?: number
  }>
}

interface ExamFormModalProps {
  open: boolean
  initial?: { exam: ExamRecord; scores: ExamScore[] }
  onClose: () => void
  onSubmit: (values: ExamFormValues) => void
}

const emptyRow = (subject = ''): ExamScoreDraft => ({
  subject,
  score: '',
  fullScore: '',
  classRank: '',
  gradeRank: '',
  classAvg: '',
})

export function ExamFormModal({ open, initial, onClose, onSubmit }: ExamFormModalProps) {
  const [date, setDate] = useState(initial?.exam.date ?? todayISO())
  const [examType, setExamType] = useState<ExamType>(initial?.exam.examType ?? '单元测')
  const [name, setName] = useState(initial?.exam.name ?? '')
  const [note, setNote] = useState(initial?.exam.note ?? '')
  const [rows, setRows] = useState<ExamScoreDraft[]>(() => {
    if (initial && initial.scores.length > 0) {
      return initial.scores.map((s) => ({
        subject: s.subject,
        score: String(s.score),
        fullScore: s.fullScore != null ? String(s.fullScore) : '',
        classRank: s.classRank != null ? String(s.classRank) : '',
        gradeRank: s.gradeRank != null ? String(s.gradeRank) : '',
        classAvg: s.classAvg != null ? String(s.classAvg) : '',
      }))
    }
    return [emptyRow('语文'), emptyRow('数学'), emptyRow('英语')]
  })
  const [error, setError] = useState('')

  if (!open) return null

  const setRow = (index: number, patch: Partial<ExamScoreDraft>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scores: ExamFormValues['scores'] = []
    for (const row of rows) {
      const subject = row.subject.trim()
      if (!subject && !row.score) continue // 整行留空跳过
      if (!subject) {
        setError('有分数的行需要填写科目')
        return
      }
      if (row.score === '') continue // 没填分数的科目跳过
      const num = (s: string) => (s === '' ? undefined : Number(s))
      scores.push({
        subject,
        score: Number(row.score),
        fullScore: num(row.fullScore),
        classRank: num(row.classRank),
        gradeRank: num(row.gradeRank),
        classAvg: num(row.classAvg),
      })
    }
    if (scores.length === 0) {
      setError('请至少填写一科分数')
      return
    }
    onSubmit({
      date,
      examType,
      name: name.trim() || undefined,
      note: note.trim() || undefined,
      scores,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{initial ? '编辑考试' : '记录一次考试'}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-500">日期</label>
              <input
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-brand-400"
              />
            </div>
            <div className="w-32">
              <label className="text-sm text-gray-500">类型</label>
              <select
                value={examType}
                onChange={(e) => setExamType(e.target.value as ExamType)}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 outline-none focus:border-brand-400 bg-white"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">考试名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="可选，如「第三单元数学测验」"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">各科成绩（除分数外均可留空）</label>
            <div className="space-y-3">
              {rows.map((row, i) => (
                <div key={i} className="rounded-2xl bg-gray-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      list="subject-presets"
                      value={row.subject}
                      onChange={(e) => setRow(i, { subject: e.target.value })}
                      placeholder="科目"
                      className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={row.score}
                      onChange={(e) => setRow(i, { score: e.target.value })}
                      placeholder="分数"
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                    <span className="text-gray-300 text-sm">/</span>
                    <input
                      type="number"
                      value={row.fullScore}
                      onChange={(e) => setRow(i, { fullScore: e.target.value })}
                      placeholder="满分"
                      className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-red-300"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={row.classRank}
                      onChange={(e) => setRow(i, { classRank: e.target.value })}
                      placeholder="班排名"
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                    <input
                      type="number"
                      value={row.gradeRank}
                      onChange={(e) => setRow(i, { gradeRank: e.target.value })}
                      placeholder="年级排名"
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={row.classAvg}
                      onChange={(e) => setRow(i, { classAvg: e.target.value })}
                      placeholder="班均分"
                      className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
            <datalist id="subject-presets">
              {SUBJECT_PRESETS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="mt-2 flex items-center gap-1 text-sm font-medium text-brand-500"
            >
              <Plus size={15} />
              添加科目
            </button>
          </div>

          <div>
            <label className="text-sm text-gray-500">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可选"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95 transition"
        >
          {initial ? '保存' : '记录'}
        </button>
      </form>
    </div>
  )
}
