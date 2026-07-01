import { Coins } from 'lucide-react'
import { computeLevelInfo } from '../../lib/points'
import type { LevelStep } from '../../types'

interface LevelProgressCardProps {
  xp: number
  balance: number
  ladder: LevelStep[]
}

export function LevelProgressCard({ xp, balance, ladder }: LevelProgressCardProps) {
  const { level, next, progress } = computeLevelInfo(xp, ladder)

  return (
    <div className="w-full rounded-3xl bg-white/70 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">当前等级</div>
          <div className="text-lg font-bold text-gray-800">
            Lv.{level.level} {level.title}
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-sun-400/20 px-3 py-1.5 text-sun-500 font-bold">
          <Coins size={16} />
          {balance}
        </div>
      </div>

      <div className="mt-3">
        <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-all duration-500"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-1 text-right text-[11px] text-gray-400">
          {next ? `距 Lv.${next.level} ${next.title} 还需 ${next.requiredXP - xp} XP` : '已达最高等级'}
        </div>
      </div>
    </div>
  )
}
