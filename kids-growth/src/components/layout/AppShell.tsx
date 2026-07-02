import { useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck, LogOut } from 'lucide-react'
import { db } from '../../db/db'
import { useAppStore } from '../../store/useAppStore'
import { ChildSwitcher } from './ChildSwitcher'

export function AppShell() {
  const childList = useLiveQuery(() => db.children.orderBy('createdAt').toArray(), []) ?? []
  const { currentChildId, setCurrentChildId, mode, lockParent } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()

  const currentChild = childList.find((c) => c.id === currentChildId) ?? childList[0] ?? null

  // Re-point the persisted selection when it goes stale (e.g. after a backup
  // import replaced all children, or the selected child was deleted).
  useEffect(() => {
    if (currentChild && currentChildId !== currentChild.id) {
      setCurrentChildId(currentChild.id)
    }
  }, [currentChild, currentChildId, setCurrentChildId])

  const onPinPage = location.pathname === '/parent/pin'

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-transparent">
      {!onPinPage && (
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 backdrop-blur bg-white/40">
          <ChildSwitcher
            childList={childList}
            currentChild={currentChild}
            onSelect={setCurrentChildId}
          />
          {mode === 'parent' ? (
            <button
              onClick={() => {
                lockParent()
                navigate('/')
              }}
              className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm active:scale-95 transition"
            >
              <LogOut size={14} />
              退出家长模式
            </button>
          ) : (
            <button
              onClick={() => navigate('/parent/pin')}
              className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm active:scale-95 transition"
            >
              <ShieldCheck size={14} />
              家长模式
            </button>
          )}
        </header>
      )}
      <main className="flex-1 px-4 pb-8">
        <Outlet />
      </main>
    </div>
  )
}
