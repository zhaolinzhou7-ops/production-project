import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { useCurrentChild } from '../hooks/useCurrentChild'
import { getTermForDate } from '../lib/ageStage'
import { evaluateAchievements } from '../db/achievements'
import { TrendChart, type TrendPoint } from '../components/common/TrendChart'
import { ExamFormModal, type ExamFormValues } from '../components/exams/ExamFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { ExamRecord, ExamScore } from '../types'

const SERIES_COLORS = ['#f9497a', '#34c9a3', '#3987e5', '#eda100', '#9085e9', '#e34948', '#d55181', '#0ca30c']

export function ParentExamsPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const { child } = useCurrentChild()

  const exams = useLiveQuery(async (): Promise<ExamRecord[]> => {
    if (!currentChildId) return []
    const rows = await db.exams.where('childId').equals(currentChildId).toArray()
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [currentChildId])
  const scores = useLiveQuery(async (): Promise<ExamScore[]> => {
    if (!currentChildId) return []
    return db.examScores.where('childId').equals(currentChildId).toArray()
  }, [currentChildId])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<{ exam: ExamRecord; scores: ExamScore[] } | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<ExamRecord | null>(null)

  if (!currentChildId || !child || !exams || !scores) return null

  const scoresByExam = new Map<string, ExamScore[]>()
  for (const s of scores) {
    if (!scoresByExam.has(s.examId)) scoresByExam.set(s.examId, [])
    scoresByExam.get(s.examId)!.push(s)
  }

  const handleSubmit = async (values: ExamFormValues) => {
    await db.transaction('rw', db.exams, db.examScores, async () => {
      let examId: string
      if (editing) {
        examId = editing.exam.id
        await db.exams.update(examId, {
          date: values.date,
          examType: values.examType,
          name: values.name,
          note: values.note,
        })
        await db.examScores.where('examId').equals(examId).delete()
      } else {
        examId = newId()
        await db.exams.add({
          id: examId,
          childId: currentChildId,
          date: values.date,
          examType: values.examType,
          name: values.name,
          note: values.note,
          createdAt: Date.now(),
        })
      }
      await db.examScores.bulkAdd(
        values.scores.map((s) => ({
          id: newId(),
          examId,
          childId: currentChildId,
          subject: s.subject,
          score: s.score,
          fullScore: s.fullScore,
          classRank: s.classRank,
          gradeRank: s.gradeRank,
          classAvg: s.classAvg,
        })),
      )
    })
    if (!editing) await evaluateAchievements(currentChildId)
    setFormOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await db.transaction('rw', db.exams, db.examScores, async () => {
      await db.exams.delete(deleteTarget.id)
      await db.examScores.where('examId').equals(deleteTarget.id).delete()
    })
    setDeleteTarget(null)
  }

  // ---- 趋势:按科目的得分率(score/fullScore,缺满分按100) ----
  const examsAsc = [...exams].sort((a, b) => a.date.localeCompare(b.date))
  const subjects = [...new Set(scores.map((s) => s.subject))]
  const subjectSeries = subjects
    .map((subject, i) => ({ key: subject, label: subject, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    .filter((s) => scores.filter((sc) => sc.subject === s.key).length >= 2)
  const rateData: TrendPoint[] = examsAsc
    .map((exam) => {
      const point: TrendPoint = { x: exam.date.slice(2) }
      for (const s of scoresByExam.get(exam.id) ?? []) {
        if (subjectSeries.some((ss) => ss.key === s.subject)) {
          point[s.subject] = Math.round((s.score / (s.fullScore ?? 100)) * 1000) / 10
        }
      }
      return point
    })
    .filter((p) => subjectSeries.some((ss) => p[ss.key] != null))
  const showRateTrend = subjectSeries.length > 0 && rateData.length >= 2

  // 排名趋势(班级排名,数值越小越好 → 反转Y轴)
  const rankSeries = subjects
    .map((subject, i) => ({ key: subject, label: subject, color: SERIES_COLORS[i % SERIES_COLORS.length] }))
    .filter((s) => scores.filter((sc) => sc.subject === s.key && sc.classRank != null).length >= 2)
  const rankData: TrendPoint[] = examsAsc
    .map((exam) => {
      const point: TrendPoint = { x: exam.date.slice(2) }
      for (const s of scoresByExam.get(exam.id) ?? []) {
        if (s.classRank != null && rankSeries.some((rs) => rs.key === s.subject)) {
          point[s.subject] = s.classRank
        }
      }
      return point
    })
    .filter((p) => rankSeries.some((rs) => p[rs.key] != null))
  const showRankTrend = rankSeries.length > 0 && rankData.length >= 2

  const termOf = (date: string) => getTermForDate(child.birthdate, child.enrollmentYear, date)

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">学业成绩</h1>
      </div>

      {showRateTrend && (
        <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
          <h2 className="font-bold text-gray-700 mb-1">得分率趋势</h2>
          <p className="text-[11px] text-gray-400 mb-2">得分 ÷ 满分（未填满分按 100 计），跨考试可比</p>
          <TrendChart data={rateData} series={subjectSeries} unit="%" />
        </div>
      )}

      {showRankTrend && (
        <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
          <h2 className="font-bold text-gray-700 mb-1">班级排名趋势</h2>
          <p className="text-[11px] text-gray-400 mb-2">越靠上代表排名越靠前</p>
          <TrendChart data={rankData} series={rankSeries} invertY />
        </div>
      )}

      {exams.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-3">
          <div className="text-4xl mb-2">📝</div>
          还没有成绩记录，记录第一次考试吧
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {exams.map((exam) => {
            const examScores = scoresByExam.get(exam.id) ?? []
            const term = termOf(exam.date)
            return (
              <div key={exam.id} className="rounded-2xl bg-white/70 p-3.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-600">
                    {exam.examType}
                  </span>
                  <span className="text-sm font-bold text-gray-800">
                    {exam.name || `${exam.examType}考试`}
                  </span>
                  <span className="ml-auto text-[11px] text-gray-400">
                    {term ? `${term} · ` : ''}
                    {exam.date}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {examScores.map((s) => (
                    <span
                      key={s.id}
                      className="rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600"
                    >
                      {s.subject}{' '}
                      <b className="text-gray-800">
                        {s.score}
                        {s.fullScore ? `/${s.fullScore}` : ''}
                      </b>
                      {s.classRank != null && <span className="text-gray-400"> 班{s.classRank}名</span>}
                      {s.classAvg != null && <span className="text-gray-400"> 均{s.classAvg}</span>}
                    </span>
                  ))}
                </div>
                {exam.note && <div className="mt-1.5 text-xs text-gray-400">{exam.note}</div>}
                <div className="mt-1.5 flex justify-end gap-1">
                  <button
                    onClick={() => {
                      setEditing({ exam, scores: examScores })
                      setFormOpen(true)
                    }}
                    className="p-1 text-gray-400"
                  >
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => setDeleteTarget(exam)} className="p-1 text-red-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => {
          setEditing(undefined)
          setFormOpen(true)
        }}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
      >
        <Plus size={18} />
        记录一次考试
      </button>

      {formOpen && (
        <ExamFormModal
          key={editing?.exam.id ?? 'new'}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这次考试记录？"
        description={deleteTarget ? `${deleteTarget.date} ${deleteTarget.name ?? deleteTarget.examType}，各科分数将一并删除。` : undefined}
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
