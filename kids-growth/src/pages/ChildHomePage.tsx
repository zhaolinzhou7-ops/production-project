import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { Avatar } from '../components/common/Avatar'
import { formatAge } from '../lib/age'

export function ChildHomePage() {
  const currentChildId = useAppStore((s) => s.currentChildId)
  const currentChild = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )

  if (!currentChild) return null

  return (
    <div className="pt-6 flex flex-col items-center text-center">
      <Avatar src={currentChild.avatar} gender={currentChild.gender} size={96} />
      <h1 className="mt-4 text-2xl font-bold text-gray-800">
        你好，{currentChild.nickname || currentChild.name}！
      </h1>
      <p className="text-sm text-gray-400 mt-1">{formatAge(currentChild.birthdate)}</p>

      <div className="mt-8 w-full rounded-3xl bg-white/70 p-6 shadow-sm">
        <div className="text-4xl mb-2">🌟</div>
        <p className="text-gray-500">今天的任务和积分打卡马上就来～</p>
      </div>
    </div>
  )
}
