import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import type { LevelStep } from '../../types'

interface LevelUpModalProps {
  level: LevelStep | null
  onClose: () => void
}

export function LevelUpModal({ level, onClose }: LevelUpModalProps) {
  useEffect(() => {
    if (!level) return
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } })
    const timer = setTimeout(onClose, 2400)
    return () => clearTimeout(timer)
  }, [level, onClose])

  return (
    <AnimatePresence>
      {level && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex flex-col items-center text-center px-8"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="text-7xl mb-4">{level.title.split(' ')[0]}</div>
            <div className="text-white/80 text-sm mb-1">升级啦</div>
            <div className="text-3xl font-bold text-white">
              Lv.{level.level} {level.title.split(' ').slice(1).join(' ')}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
