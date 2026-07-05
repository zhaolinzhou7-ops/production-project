import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
import type { LevelStep, UiTone } from '../../types'

interface LevelUpModalProps {
  level: LevelStep | null
  tone?: UiTone
  onClose: () => void
}

export function LevelUpModal({ level, tone = 'playful', onClose }: LevelUpModalProps) {
  useEffect(() => {
    if (!level) return
    // 成长模式(约12岁+)不放满屏彩带,保留克制的确认感
    if (tone === 'playful') {
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } })
    }
    const timer = setTimeout(onClose, tone === 'playful' ? 2400 : 1800)
    return () => clearTimeout(timer)
  }, [level, tone, onClose])

  return (
    <AnimatePresence>
      {level && (
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
              {level.title.split(' ')[0]}
            </div>
            <div className="text-white/80 text-sm mb-1">
              {tone === 'playful' ? '升级啦' : '达到新等级'}
            </div>
            <div
              className={`font-bold text-white ${tone === 'playful' ? 'text-3xl' : 'text-2xl'}`}
            >
              Lv.{level.level} {level.title.split(' ').slice(1).join(' ')}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
