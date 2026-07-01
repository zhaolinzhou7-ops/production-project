import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import type { Achievement } from '../../types'

interface AchievementUnlockModalProps {
  achievement: Achievement | null
  onClose: () => void
}

export function AchievementUnlockModal({ achievement, onClose }: AchievementUnlockModalProps) {
  useEffect(() => {
    if (!achievement) return
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 }, colors: ['#FF8FA3', '#FFD166', '#6EE7C8'] })
    const timer = setTimeout(onClose, 2200)
    return () => clearTimeout(timer)
  }, [achievement, onClose])

  return (
    <AnimatePresence>
      {achievement && (
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
            <div className="text-7xl mb-4">{achievement.icon}</div>
            <div className="text-white/80 text-sm mb-1">解锁新徽章</div>
            <div className="text-2xl font-bold text-white">{achievement.name}</div>
            <div className="text-white/70 text-sm mt-2">{achievement.desc}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
