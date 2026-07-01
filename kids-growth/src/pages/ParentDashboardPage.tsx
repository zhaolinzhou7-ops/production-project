import { useNavigate } from 'react-router-dom'
import { Users, Settings as SettingsIcon, ClipboardList } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'

export function ParentDashboardPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const currentChild = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )

  return (
    <div className="pt-4">
      <h1 className="text-xl font-bold text-gray-800 mb-1">家长中心</h1>
      <p className="text-sm text-gray-400 mb-6">
        {currentChild ? `正在查看：${currentChild.nickname || currentChild.name}` : '欢迎回来'}
      </p>

      <div className="space-y-3">
        <button
          onClick={() => navigate('/parent/children')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-brand-100 p-2.5 text-brand-500">
            <Users size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">管理孩子</div>
            <div className="text-xs text-gray-400">添加、编辑或删除孩子档案</div>
          </div>
        </button>

        <div className="w-full flex items-center gap-3 rounded-2xl bg-white/40 p-4 shadow-sm text-left opacity-60">
          <div className="rounded-xl bg-mint-400/30 p-2.5 text-mint-500">
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">任务与积分管理</div>
            <div className="text-xs text-gray-400">即将上线</div>
          </div>
        </div>

        <button
          onClick={() => navigate('/parent/settings')}
          className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
        >
          <div className="rounded-xl bg-sun-400/30 p-2.5 text-sun-500">
            <SettingsIcon size={20} />
          </div>
          <div>
            <div className="font-bold text-gray-800">家长设置</div>
            <div className="text-xs text-gray-400">PIN 码、数据备份与恢复</div>
          </div>
        </button>
      </div>
    </div>
  )
}
