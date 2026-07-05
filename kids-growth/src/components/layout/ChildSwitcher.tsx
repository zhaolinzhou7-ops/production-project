import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { Child } from '../../types'
import { Avatar } from '../common/Avatar'
import { formatAge } from '../../lib/age'
import { useNavigate } from 'react-router-dom'

interface ChildSwitcherProps {
  childList: Child[]
  currentChild: Child | null
  onSelect: (id: string) => void
}

export function ChildSwitcher({ childList, currentChild, onSelect }: ChildSwitcherProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  if (!currentChild) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-white/70 pl-1.5 pr-3 py-1.5 shadow-sm active:scale-95 transition"
      >
        <Avatar src={currentChild.avatar} gender={currentChild.gender} size={34} />
        <div className="text-left leading-tight">
          <div className="text-sm font-bold text-gray-800">
            {currentChild.nickname || currentChild.name}
          </div>
          <div className="text-[11px] text-gray-400">{formatAge(currentChild.birthdate)}</div>
        </div>
        <ChevronDown size={16} className="text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl bg-white shadow-xl p-2 z-40">
            {childList.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c.id)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 rounded-xl p-2 text-left transition ${
                  c.id === currentChild.id ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <Avatar src={c.avatar} gender={c.gender} size={32} />
                <div className="text-sm font-medium text-gray-700">{c.nickname || c.name}</div>
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false)
                navigate('/parent/children')
              }}
              className="w-full flex items-center gap-2 rounded-xl p-2 text-left text-brand-600 hover:bg-brand-50"
            >
              <Plus size={16} />
              <span className="text-sm font-medium">管理孩子</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
