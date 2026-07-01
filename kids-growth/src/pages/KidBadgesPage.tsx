import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import type { Achievement, Unlock } from '../types'

export function KidBadgesPage() {
  const navigate = useNavigate()
  const currentChildId = useAppStore((s) => s.currentChildId)

  const achievements = useLiveQuery((): Promise<Achievement[]> => db.achievements.toArray(), [])
  const unlocks = useLiveQuery(async (): Promise<Unlock[]> => {
    if (!currentChildId) return []
    return db.unlocks.where('childId').equals(currentChildId).toArray()
  }, [currentChildId])

  if (!achievements || !unlocks) return null

  const unlockedByCode = new Map(unlocks.map((u) => [u.achievementCode, u]))

  return (
    <div className="pt-4 pb-10">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/')} className="p-1 text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-gray-800">徽章墙</h1>
        <span className="ml-auto text-xs text-gray-400">
          {unlocks.length}/{achievements.length} 已解锁
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {achievements.map((a) => {
          const unlock = unlockedByCode.get(a.code)
          return (
            <div
              key={a.id}
              className={`flex flex-col items-center rounded-2xl p-3 text-center shadow-sm ${
                unlock ? 'bg-white/80' : 'bg-white/30'
              }`}
            >
              <div className={`text-3xl mb-1 ${unlock ? '' : 'grayscale opacity-40'}`}>
                {unlock ? a.icon : <Lock size={28} className="text-gray-300" />}
              </div>
              <div className={`text-xs font-bold ${unlock ? 'text-gray-800' : 'text-gray-400'}`}>
                {a.name}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{a.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
