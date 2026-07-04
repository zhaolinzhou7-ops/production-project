import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { formatAge } from '../lib/age'
import { Avatar } from '../components/common/Avatar'
import { ChildFormModal, type ChildFormValues } from '../components/children/ChildFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import type { Child } from '../types'
import { useAppStore } from '../store/useAppStore'

export function ParentChildrenPage() {
  const navigate = useNavigate()
  const children = useLiveQuery(() => db.children.orderBy('createdAt').toArray(), []) ?? []
  const [editing, setEditing] = useState<Child | undefined>(undefined)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Child | null>(null)
  const { currentChildId, setCurrentChildId } = useAppStore()

  const openAdd = () => {
    setEditing(undefined)
    setFormOpen(true)
  }
  const openEdit = (child: Child) => {
    setEditing(child)
    setFormOpen(true)
  }

  const handleSubmit = async (values: ChildFormValues) => {
    if (editing) {
      await db.children.update(editing.id, {
        name: values.name,
        nickname: values.nickname || undefined,
        gender: values.gender,
        birthdate: values.birthdate,
        avatar: values.avatar,
        enrollmentYear: values.enrollmentYear,
      })
    } else {
      const id = newId()
      await db.children.add({
        id,
        name: values.name,
        nickname: values.nickname || undefined,
        gender: values.gender,
        birthdate: values.birthdate,
        avatar: values.avatar,
        enrollmentYear: values.enrollmentYear,
        createdAt: Date.now(),
      })
      setCurrentChildId(id)
    }
    setFormOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    await db.transaction(
      'rw',
      [db.children, db.tasks, db.checkIns, db.pointLedger, db.unlocks, db.rewards, db.redemptions, db.growthRecords, db.milestones, db.portfolios, db.diaryEntries, db.records, db.exams, db.examScores, db.anecdotes, db.interests],
      async () => {
        await db.children.delete(id)
        await db.tasks.where('childId').equals(id).delete()
        await db.checkIns.where('childId').equals(id).delete()
        await db.pointLedger.where('childId').equals(id).delete()
        await db.unlocks.where('childId').equals(id).delete()
        await db.rewards.where('childId').equals(id).delete()
        await db.redemptions.where('childId').equals(id).delete()
        await db.growthRecords.where('childId').equals(id).delete()
        await db.milestones.where('childId').equals(id).delete()
        await db.portfolios.where('childId').equals(id).delete()
        await db.diaryEntries.where('childId').equals(id).delete()
        await db.records.where('childId').equals(id).delete()
        await db.exams.where('childId').equals(id).delete()
        await db.examScores.where('childId').equals(id).delete()
        await db.anecdotes.where('childId').equals(id).delete()
        await db.interests.where('childId').equals(id).delete()
      },
    )
    if (currentChildId === id) {
      const remaining = await db.children.orderBy('createdAt').toArray()
      setCurrentChildId(remaining[0]?.id ?? null)
    }
    setDeleteTarget(null)
  }

  return (
    <div className="pt-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">管理孩子</h1>
      </div>

      <div className="space-y-3">
        {children.map((child) => (
          <div
            key={child.id}
            className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 shadow-sm"
          >
            <Avatar src={child.avatar} gender={child.gender} size={48} />
            <div className="flex-1">
              <div className="font-bold text-gray-800">{child.name}</div>
              <div className="text-xs text-gray-400">
                {child.nickname ? `${child.nickname} · ` : ''}
                {formatAge(child.birthdate)}
              </div>
            </div>
            <button
              onClick={() => openEdit(child)}
              className="p-2 text-gray-400 active:scale-95 transition"
            >
              <Pencil size={18} />
            </button>
            <button
              onClick={() => setDeleteTarget(child)}
              className="p-2 text-red-400 active:scale-95 transition"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={openAdd}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition"
      >
        <Plus size={18} />
        添加孩子
      </button>

      {formOpen && (
        <ChildFormModal
          key={editing?.id ?? 'new'}
          open={formOpen}
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除「${deleteTarget?.name}」？`}
        description="这将永久删除该孩子的所有任务、积分、成长记录与档案，且无法恢复。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
