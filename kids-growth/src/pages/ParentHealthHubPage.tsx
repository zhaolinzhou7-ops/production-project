import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { getModulesByGroup } from '../lib/recordModules'

/** 健康档案入口:列出所有 health 组的通用记录模块及其最近一条记录。 */
export function ParentHealthHubPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)
  const modules = getModulesByGroup('health')

  const latestByModule = useLiveQuery(async () => {
    if (!currentChildId) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const m of modules) {
      const rows = await db.records
        .where('[childId+module]')
        .equals([currentChildId, m.module])
        .toArray()
      if (rows.length > 0) {
        const latest = rows.reduce((a, b) => (a.date > b.date ? a : b))
        map.set(m.module, `${latest.date} · ${m.summarize(latest.fields)}`)
      }
    }
    return map
  }, [currentChildId])

  if (!currentChildId || !latestByModule) return null

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/parent')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">健康档案</h1>
      </div>

      <div className="space-y-3">
        {modules.map((m) => (
          <button
            key={m.module}
            onClick={() => navigate(`/parent/records/${m.module}`)}
            className="w-full flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-sm active:scale-95 transition text-left"
          >
            <div className="text-2xl">{m.icon}</div>
            <div className="flex-1">
              <div className="font-bold text-gray-800">{m.label}</div>
              <div className="text-xs text-gray-400">
                {latestByModule.get(m.module) ?? '还没有记录'}
              </div>
            </div>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-gray-400">
        健康记录仅供家庭参考，非医疗诊断；如有异常请咨询医生。
      </p>
    </div>
  )
}
