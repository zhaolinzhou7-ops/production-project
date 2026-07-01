import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { checkInTask } from '../db/checkin'
import { useAppStore } from '../store/useAppStore'
import { Avatar } from '../components/common/Avatar'
import { LevelProgressCard } from '../components/points/LevelProgressCard'
import { LevelUpModal } from '../components/points/LevelUpModal'
import { TaskCheckCard } from '../components/tasks/TaskCheckCard'
import { formatAge } from '../lib/age'
import { todayISO } from '../lib/dateUtils'
import { isTaskScheduledOn } from '../lib/taskDue'
import { computeLevelInfo } from '../lib/points'
import type { CheckIn, LevelStep, PointLedger, Task, TaskCategory } from '../types'

const CATEGORY_ORDER: TaskCategory[] = ['生活', '学习', '运动', '品德', '家务', '其他']

export function ChildHomePage() {
  const currentChildId = useAppStore((s) => s.currentChildId)
  const today = todayISO()
  const [levelUp, setLevelUp] = useState<LevelStep | null>(null)

  const currentChild = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )
  const settings = useLiveQuery(() => db.settings.get('singleton'), [])
  const tasks = useLiveQuery(async (): Promise<Task[]> => {
    if (!currentChildId) return []
    return db.tasks
      .where('childId')
      .equals(currentChildId)
      .filter((t) => t.active)
      .toArray()
  }, [currentChildId])
  const todayCheckIns = useLiveQuery(async (): Promise<CheckIn[]> => {
    if (!currentChildId) return []
    return db.checkIns.where('[childId+date]').equals([currentChildId, today]).toArray()
  }, [currentChildId, today])
  const onceDoneTaskIds = useLiveQuery(async () => {
    if (!currentChildId) return new Set<string>()
    const done = await db.checkIns
      .where('childId')
      .equals(currentChildId)
      .and((c) => c.status === 'done')
      .toArray()
    return new Set(done.map((c) => c.taskId))
  }, [currentChildId])
  const ledgerEntries = useLiveQuery(async (): Promise<PointLedger[]> => {
    if (!currentChildId) return []
    return db.pointLedger.where('childId').equals(currentChildId).toArray()
  }, [currentChildId])

  if (!currentChild || !settings || !tasks || !todayCheckIns || !ledgerEntries || !onceDoneTaskIds) return null

  const doneTaskIds = new Set(
    todayCheckIns.filter((c) => c.status === 'done').map((c) => c.taskId),
  )

  const visibleTasks = tasks.filter((t) => {
    if (t.type === 'once') return !onceDoneTaskIds.has(t.id) || doneTaskIds.has(t.id)
    return isTaskScheduledOn(t, today)
  })

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: visibleTasks.filter((t) => t.category === category),
  })).filter((g) => g.items.length > 0)

  const balance = ledgerEntries.reduce((sum, e) => sum + e.delta, 0)
  const xp = ledgerEntries.reduce((sum, e) => (e.delta > 0 ? sum + e.delta : sum), 0)

  const handleCheckIn = async (task: Task) => {
    const before = computeLevelInfo(xp, settings.levelLadder).level
    const result = await checkInTask(task, today)
    if (result) {
      const after = computeLevelInfo(result.xp, settings.levelLadder).level
      if (after.level > before.level) {
        setLevelUp(after)
      }
    }
  }

  const completedCount = visibleTasks.filter((t) => doneTaskIds.has(t.id)).length

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-3 mb-4">
        <Avatar src={currentChild.avatar} gender={currentChild.gender} size={56} />
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            你好，{currentChild.nickname || currentChild.name}！
          </h1>
          <p className="text-xs text-gray-400">{formatAge(currentChild.birthdate)}</p>
        </div>
      </div>

      <LevelProgressCard xp={xp} balance={balance} ladder={settings.levelLadder} />

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="font-bold text-gray-700">今日任务</h2>
        <span className="text-xs text-gray-400">
          {completedCount}/{visibleTasks.length} 已完成
        </span>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="mt-8 rounded-3xl bg-white/60 p-8 text-center text-gray-400">
          <div className="text-4xl mb-2">🗓️</div>
          今天还没有任务，去家长模式添加一些吧
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.category}>
              <div className="mb-1.5 text-xs font-medium text-gray-400">{g.category}</div>
              <div className="space-y-2">
                {g.items.map((task) => (
                  <TaskCheckCard
                    key={task.id}
                    task={task}
                    done={doneTaskIds.has(task.id)}
                    onCheckIn={handleCheckIn}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <LevelUpModal level={levelUp} onClose={() => setLevelUp(null)} />
    </div>
  )
}
