import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { importDefaultTasks } from '../db/seedActions'
import { checkInTask, undoCheckIn } from '../db/checkin'
import { evaluateAchievements } from '../db/achievements'
import { todayISO } from '../lib/dateUtils'
import { isTaskScheduledOn } from '../lib/taskDue'
import { TaskFormModal, type TaskFormValues } from '../components/tasks/TaskFormModal'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useAppStore } from '../store/useAppStore'
import type { CheckIn, Task, TaskCategory } from '../types'

const CATEGORY_ORDER: TaskCategory[] = ['生活', '学习', '运动', '品德', '家务', '其他']
const TYPE_LABEL: Record<Task['type'], string> = { daily: '每日', weekly: '每周', once: '一次性' }

export function ParentTasksPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const [checkinDate, setCheckinDate] = useState(todayISO())

  const tasks = useLiveQuery(async (): Promise<Task[]> => {
    if (!currentChildId) return []
    return db.tasks.where('childId').equals(currentChildId).toArray()
  }, [currentChildId])
  const dateCheckIns = useLiveQuery(async (): Promise<CheckIn[]> => {
    if (!currentChildId) return []
    return db.checkIns.where('[childId+date]').equals([currentChildId, checkinDate]).toArray()
  }, [currentChildId, checkinDate])

  if (!currentChildId || !tasks) return null

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: tasks.filter((t) => t.category === category),
  })).filter((g) => g.items.length > 0)

  const openAdd = () => {
    setEditing(undefined)
    setFormOpen(true)
  }
  const openEdit = (task: Task) => {
    setEditing(task)
    setFormOpen(true)
  }

  const handleSubmit = async (values: TaskFormValues) => {
    if (editing) {
      await db.tasks.update(editing.id, values as Partial<Task>)
    } else {
      await db.tasks.add({
        id: newId(),
        childId: currentChildId,
        title: values.title,
        icon: values.icon,
        category: values.category,
        type: values.type,
        weeklyDays: values.weeklyDays,
        points: values.points,
        active: values.active,
        createdAt: Date.now(),
      })
    }
    setFormOpen(false)
  }

  const toggleActive = async (task: Task) => {
    await db.tasks.update(task.id, { active: !task.active })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await db.transaction('rw', db.tasks, db.checkIns, async () => {
      await db.tasks.delete(deleteTarget.id)
      await db.checkIns.where('taskId').equals(deleteTarget.id).delete()
    })
    setDeleteTarget(null)
  }

  const handleImportDefaults = async () => {
    const count = await importDefaultTasks(currentChildId)
    setImportMsg(count > 0 ? `已导入 ${count} 个默认任务` : '默认任务已全部存在')
    setTimeout(() => setImportMsg(''), 2500)
  }

  const dueTasksForDate = tasks.filter((t) => t.active && isTaskScheduledOn(t, checkinDate))
  const doneMap = new Map(
    (dateCheckIns ?? []).filter((c) => c.status === 'done').map((c) => [c.taskId, c]),
  )

  const toggleCheckIn = async (task: Task) => {
    if (doneMap.has(task.id)) {
      await undoCheckIn(task, checkinDate)
    } else {
      await checkInTask(task, checkinDate)
      await evaluateAchievements(task.childId)
    }
  }

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">任务与积分管理</h1>
      </div>

      <button
        onClick={handleImportDefaults}
        className="mb-4 w-full flex items-center justify-center gap-1.5 rounded-2xl bg-mint-400/20 py-2.5 text-sm font-medium text-mint-500 active:scale-95 transition"
      >
        <Sparkles size={16} />
        {importMsg || '一键导入默认任务'}
      </button>

      {tasks.length === 0 ? (
        <div className="rounded-3xl bg-white/60 p-8 text-center text-gray-400 mb-4">
          还没有任务，先导入默认任务或手动添加吧
        </div>
      ) : (
        <div className="space-y-4 mb-4">
          {grouped.map((g) => (
            <div key={g.category}>
              <div className="mb-1.5 text-xs font-medium text-gray-400">{g.category}</div>
              <div className="space-y-2">
                {g.items.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 rounded-2xl p-3 shadow-sm ${
                      task.active ? 'bg-white/70' : 'bg-white/40 opacity-60'
                    }`}
                  >
                    <div className="text-xl">{task.icon}</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-800">{task.title}</div>
                      <div className="text-xs text-gray-400">
                        {TYPE_LABEL[task.type]} · +{task.points} 积分
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(task)}
                      className={`flex h-6 w-10 items-center rounded-full p-0.5 transition ${
                        task.active ? 'bg-brand-500' : 'bg-gray-200'
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          task.active ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <button onClick={() => openEdit(task)} className="p-1.5 text-gray-400">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setDeleteTarget(task)} className="p-1.5 text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openAdd}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 py-3 font-medium text-brand-500 active:scale-95 transition mb-8"
      >
        <Plus size={18} />
        新增任务
      </button>

      <div className="rounded-3xl bg-white/70 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-700">打卡补登 / 撤销</h2>
          <input
            type="date"
            value={checkinDate}
            max={todayISO()}
            onChange={(e) => setCheckinDate(e.target.value)}
            className="rounded-xl border border-gray-200 px-2 py-1 text-sm outline-none focus:border-brand-400"
          />
        </div>
        {dueTasksForDate.length === 0 ? (
          <p className="text-sm text-gray-400">这一天没有需要打卡的任务</p>
        ) : (
          <div className="space-y-2">
            {dueTasksForDate.map((task) => {
              const isDone = doneMap.has(task.id)
              return (
                <button
                  key={task.id}
                  onClick={() => toggleCheckIn(task)}
                  className={`w-full flex items-center gap-3 rounded-xl p-2.5 text-left transition active:scale-95 ${
                    isDone ? 'bg-brand-50' : 'bg-gray-50'
                  }`}
                >
                  <div className="text-lg">{task.icon}</div>
                  <div className="flex-1 text-sm font-medium text-gray-700">{task.title}</div>
                  <span className={`text-xs font-medium ${isDone ? 'text-brand-500' : 'text-gray-400'}`}>
                    {isDone ? '已完成，点击撤销' : '标记为已完成'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <TaskFormModal
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`删除任务「${deleteTarget?.title}」？`}
        description="相关的打卡记录也会被删除，已获得的积分不会被扣回。"
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
