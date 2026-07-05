import type { Gender } from '../../types'

const FALLBACK: Record<Gender, string> = {
  male: '👦',
  female: '👧',
}

interface AvatarProps {
  src?: string
  gender: Gender
  size?: number
  className?: string
}

export function Avatar({ src, gender, size = 48, className = '' }: AvatarProps) {
  const style = { width: size, height: size, fontSize: size * 0.5 }
  if (src) {
    return (
      <img
        src={src}
        alt="头像"
        style={style}
        className={`rounded-full object-cover border-2 border-white shadow ${className}`}
      />
    )
  }
  return (
    <div
      style={style}
      className={`rounded-full bg-brand-100 border-2 border-white shadow flex items-center justify-center ${className}`}
    >
      {FALLBACK[gender]}
    </div>
  )
}
