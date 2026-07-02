import type { Mood } from '../types'

export const MOOD_OPTIONS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'happy', emoji: '😄', label: '开心' },
  { value: 'proud', emoji: '🥰', label: '骄傲' },
  { value: 'calm', emoji: '😌', label: '平静' },
  { value: 'tired', emoji: '😪', label: '疲惫' },
  { value: 'sad', emoji: '😢', label: '难过' },
]
