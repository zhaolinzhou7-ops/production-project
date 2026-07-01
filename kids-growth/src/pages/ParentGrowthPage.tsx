import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import { ageInMonths } from '../lib/age'
import { computeBmi } from '../lib/bmi'
import {
  GROWTH_DATA_SOURCE,
  METRIC_MONTH_RANGE,
  classifyBmi,
  getStandardSeries,
  interpolateStandard,
  percentileRankFor,
  zScoreFor,
  BMI_CATEGORY_LABEL,
} from '../lib/growthPercentile'
import { GrowthChart } from '../components/growth/GrowthChart'
import { GrowthRecordFormModal, type GrowthRecordFormValues } from '../components/growth/GrowthRecordFormModal'
import { MilestoneFormModal, type MilestoneFormValues } from '../components/growth/MilestoneFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { evaluateAchievements } from '../db/achievements'
import type { GrowthRecord, Milestone } from '../types'

export function ParentGrowthPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const child = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )
  const records = useLiveQuery(async (): Promise<GrowthRecord[]> => {
    if (!currentChildId) return []
    return db.growthRecords.where('childId').equals(currentChildId).reverse().sortBy('date')
  }, [currentChildId])
  const milestones = useLiveQuery(async (): Promise<Milestone[]> => {
    if (!currentChildId) return []
    return db.milestones.where('childId').equals(currentChildId).reverse().sortBy('date')
  }, [currentChildId])

  const [recordFormOpen, setRecordFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<GrowthRecord | undefined>(undefined)
  const [deleteRecordTarget, setDeleteRecordTarget] = useState<GrowthRecord | null>(null)

  const [milestoneFormOpen, setMilestoneFormOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>(undefined)
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<Milestone | null>(null)

  if (!currentChildId || !child || !records || !milestones) return null

  const openAddRecord = () => {
    setEditingRecord(undefined)
    setRecordFormOpen(true)
  }
  const openEditRecord = (r: GrowthRecord) => {
    setEditingRecord(r)
    setRecordFormOpen(true)
  }
  const handleRecordSubmit = async (values: GrowthRecordFormValues) => {
    if (editingRecord) {
      await db.growthRecords.update(editingRecord.id, values)
    } else {
      await db.growthRecords.add({ id: newId(), childId: currentChildId, createdAt: Date.now(), ...values })
      await evaluateAchievements(currentChildId)
    }
    setRecordFormOpen(false)
  }
  const handleRecordDelete = async () => {
    if (!deleteRecordTarget) return
    await db.growthRecords.delete(deleteRecordTarget.id)
    setDeleteRecordTarget(null)
  }

  const openAddMilestone = () => {
    setEditingMilestone(undefined)
    setMilestoneFormOpen(true)
  }
  const openEditMilestone = (m: Milestone) => {
    setEditingMilestone(m)
    setMilestoneFormOpen(true)
  }
  const handleMilestoneSubmit = async (values: MilestoneFormValues) => {
    if (editingMilestone) {
      await db.milestones.update(editingMilestone.id, values)
    } else {
      await db.milestones.add({ id: newId(), childId: currentChildId, createdAt: Date.now(), ...values })
    }
    setMilestoneFormOpen(false)
  }
  const handleMilestoneDelete = async () => {
    if (!deleteMilestoneTarget) return
    await db.milestones.delete(deleteMilestoneTarget.id)
    setDeleteMilestoneTarget(null)
  }

  const currentAgeMonths = ageInMonths(child.birthdate)
  const heightPoints = records
    .filter((r) => r.heightCm)
    .map((r) => ({ month: ageInMonths(child.birthdate, new Date(r.date)), value: r.heightCm!, date: r.date }))
    .sort((a, b) => a.month - b.month)
  const weightPoints = records
    .filter((r) => r.weightKg)
    .map((r) => ({ month: ageInMonths(child.birthdate, new Date(r.date)), value: r.weightKg!, date: r.date }))
    .sort((a, b) => a.month - b.month)

  const heightDomain: [number, number] = [
    0,
    Math.min(METRIC_MONTH_RANGE.height[1], Math.max(24, Math.round(currentAgeMonths * 1.15))),
  ]
  const weightDomain: [number, number] = [
    0,
    Math.min(METRIC_MONTH_RANGE.weight[1], Math.max(24, Math.round(currentAgeMonths * 1.15))),
  ]
  const weightChartAvailable = currentAgeMonths <= METRIC_MONTH_RANGE.weight[1]

  const latest = records[0]
  let bmiInfo: { bmi: number; percentile: number | null; category: string } | null = null
  if (latest?.heightCm && latest.weightKg) {
    const bmi = computeBmi(latest.heightCm, latest.weightKg)
    const ageAtRecord = ageInMonths(child.birthdate, new Date(latest.date))
    const std = interpolateStandard('bmi', child.gender, ageAtRecord)
    const percentile = percentileRankFor('bmi', child.gender, ageAtRecord, bmi)
    const z = std ? zScoreFor(std.l, std.m, std.s, bmi) : 0
    bmiInfo = { bmi, percentile, category: BMI_CATEGORY_LABEL[classifyBmi(z)] }
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">身体发育记录</h1>
      </div>

      {bmiInfo && (
        <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-400">最新 BMI（{latest.date}）</div>
              <div className="text-2xl font-bold text-gray-800">{bmiInfo.bmi.toFixed(1)}</div>
            </div>
            <span className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-bold text-brand-600">
              {bmiInfo.category}
            </span>
          </div>
          {bmiInfo.percentile != null && (
            <div className="text-xs text-gray-400 mt-2">超过同龄同性别约 {bmiInfo.percentile}% 的孩子</div>
          )}
          <p className="text-[11px] text-orange-500 mt-2">仅供参考，非医疗诊断；如有异常请咨询医生。</p>
        </div>
      )}

      <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
        <h2 className="font-bold text-gray-700 mb-2">身高曲线</h2>
        <GrowthChart
          standardSeries={getStandardSeries('height', child.gender)}
          childPoints={heightPoints}
          domain={heightDomain}
          unit="cm"
        />
      </div>

      <div className="rounded-3xl bg-white/70 p-4 shadow-sm mb-4">
        <h2 className="font-bold text-gray-700 mb-2">体重曲线</h2>
        {weightChartAvailable ? (
          <GrowthChart
            standardSeries={getStandardSeries('weight', child.gender)}
            childPoints={weightPoints}
            domain={weightDomain}
            unit="kg"
          />
        ) : (
          <p className="text-sm text-gray-400 py-6 text-center">
            WHO 体重标准仅覆盖 0–10 岁，10 岁以上体重个体差异大，暂不提供百分位参考。
          </p>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mb-4">数据来源：{GROWTH_DATA_SOURCE}</p>

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-gray-700">发育记录</h2>
      </div>
      {records.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-6 text-center text-gray-400 mb-3">还没有记录</div>
      ) : (
        <div className="space-y-2 mb-3">
          {records.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 shadow-sm">
              <div className="rounded-xl bg-brand-100 p-2 text-brand-500">
                <Ruler size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{r.date}</div>
                <div className="text-xs text-gray-400">
                  {r.heightCm ? `身高 ${r.heightCm}cm  ` : ''}
                  {r.weightKg ? `体重 ${r.weightKg}kg  ` : ''}
                  {r.headCm ? `头围 ${r.headCm}cm` : ''}
                </div>
              </div>
              <button onClick={() => openEditRecord(r)} className="p-1.5 text-gray-400">
                <Pencil size={16} />
              </button>
              <button onClick={() => setDeleteRecordTarget(r)} className="p-1.5 text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={openAddRecord}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition mb-8"
      >
        <Plus size={18} />
        新增发育记录
      </button>

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-gray-700">成长里程碑</h2>
      </div>
      {milestones.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-6 text-center text-gray-400 mb-3">还没有里程碑记录</div>
      ) : (
        <div className="space-y-2 mb-3">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 shadow-sm">
              {m.photo ? (
                <img src={m.photo} alt="" className="h-11 w-11 rounded-xl object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-xl bg-mint-400/20 flex items-center justify-center text-lg">
                  🏆
                </div>
              )}
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">{m.title}</div>
                <div className="text-xs text-gray-400">
                  {m.date}
                  {m.note ? ` · ${m.note}` : ''}
                </div>
              </div>
              <button onClick={() => openEditMilestone(m)} className="p-1.5 text-gray-400">
                <Pencil size={16} />
              </button>
              <button onClick={() => setDeleteMilestoneTarget(m)} className="p-1.5 text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={openAddMilestone}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mint-400 py-3 font-medium text-mint-500 active:scale-95 transition"
      >
        <Plus size={18} />
        新增里程碑
      </button>

      <GrowthRecordFormModal
        open={recordFormOpen}
        initial={editingRecord}
        onClose={() => setRecordFormOpen(false)}
        onSubmit={handleRecordSubmit}
      />
      <ConfirmDialog
        open={!!deleteRecordTarget}
        title="删除这条发育记录？"
        description={deleteRecordTarget ? `日期：${deleteRecordTarget.date}` : undefined}
        confirmLabel="删除"
        onConfirm={handleRecordDelete}
        onCancel={() => setDeleteRecordTarget(null)}
      />

      <MilestoneFormModal
        open={milestoneFormOpen}
        initial={editingMilestone}
        onClose={() => setMilestoneFormOpen(false)}
        onSubmit={handleMilestoneSubmit}
      />
      <ConfirmDialog
        open={!!deleteMilestoneTarget}
        title={`删除里程碑「${deleteMilestoneTarget?.title}」？`}
        confirmLabel="删除"
        onConfirm={handleMilestoneDelete}
        onCancel={() => setDeleteMilestoneTarget(null)}
      />
    </div>
  )
}
