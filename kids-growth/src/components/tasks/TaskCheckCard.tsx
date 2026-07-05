import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check } from 'lucide-react'
import type { Task } from '../../types'

interface TaskCheckCardProps {
  task: Task
  done: boolean
  onCheckIn: (task: Task) => void
}

export function TaskCheckCard({ task, done, onCheckIn }: TaskCheckCardProps) {
  const [flyKey, setFlyKey] = useState(0)

  const handleTap = () => {
    if (done) return
    setFlyKey((k) => k + 1)
    onCheckIn(task)
  }

  return (
    <button
      onClick={handleTap}
      disabled={done}
      className={`relative w-full flex items-center gap-3 rounded-2xl p-3.5 shadow-sm transition active:scale-95 ${
        done ? 'bg-brand-50' : 'bg-white/80'
      }`}
    >
      <div className="text-2xl">{task.icon}</div>
      <div className="flex-1 text-left">
        <div className={`font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {task.title}
        </div>
        <div className="text-xs text-gray-400">+{task.points} 积分</div>
      </div>
      {done ? (
        <div className="rounded-full bg-brand-400 p-1.5 text-white">
          <Check size={16} />
        </div>
      ) : (
        <div className="h-7 w-7 rounded-full border-2 border-gray-200" />
      )}

      <AnimatePresence>
        {flyKey > 0 && (
          <motion.div
            key={flyKey}
            className="pointer-events-none absolute right-6 top-2 text-sun-500 font-bold"
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -36, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
            onAnimationComplete={() => setFlyKey(0)}
          >
            +{task.points}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  )
}
