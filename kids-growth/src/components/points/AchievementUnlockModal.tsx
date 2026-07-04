import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import type { Achievement, UiTone } from '../../types'

interface AchievementUnlockModalProps {
  achievement: Achievement | null
  tone?: UiTone
  onClose: () => void
}

export function AchievementUnlockModal({
  achievement,
  tone = 'playful',
  onClose,
}: AchievementUnlockModalProps) {
  useEffect(() => {
    if (!achievement) return
    // 成长模式(约12岁+)不放满屏彩带
    if (tone === 'playful') {
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF8FA3', '#FFD166', '#6EE7C8'],
      })
    }
    const timer = setTimeout(onClose, tone === 'playful' ? 2200 : 1800)
    return () => clearTimeout(timer)
  }, [achievement, tone, onClose])

  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          className={`fixed inset-0 z-[60] flex items-center justify-center ${
            tone === 'playful' ? 'bg-black/50' : 'bg-black/35'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex flex-col items-center text-center px-8"
            initial={{ scale: tone === 'playful' ? 0.6 : 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className={tone === 'playful' ? 'text-7xl mb-4' : 'text-5xl mb-3'}>
              {achievement.icon}
            </div>
            <div className="text-white/80 text-sm mb-1">
              {tone === 'playful' ? '解锁新徽章' : '达成新成就'}
            </div>
            <div className="text-2xl font-bold text-white">{achievement.name}</div>
            <div className="text-white/70 text-sm mt-2">{achievement.desc}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
