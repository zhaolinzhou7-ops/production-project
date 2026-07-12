import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** 连续学习满 20 分钟提醒休息(仅统计学习页面停留时间) */
const REST_AFTER_SEC = 20 * 60
/** 离开学习页超过 3 分钟视为已休息,计时清零 */
const AWAY_RESET_SEC = 3 * 60

// 模块级累计,跨路由切换保留(学习页之间来回跳不清零)
let accumSec = 0
let lastLearnAt = 0

export function EyeRestReminder() {
  const { pathname } = useLocation()
  const [show, setShow] = useState(false)
  const onLearn = pathname.startsWith('/learn')

  useEffect(() => {
    if (!onLearn) return
    const tick = () => {
      if (document.hidden) return
      const now = Date.now()
      if (lastLearnAt && now - lastLearnAt > AWAY_RESET_SEC * 1000) accumSec = 0
      lastLearnAt = now
      accumSec += 10
      if (accumSec >= REST_AFTER_SEC) setShow(true)
    }
    const t = setInterval(tick, 10_000)
    return () => clearInterval(t)
  }, [onLearn])

  if (!show) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="mb-2 text-5xl">👀</div>
        <h2 className="text-lg font-bold text-gray-800">休息一下眼睛吧</h2>
        <p className="mt-1 text-sm text-gray-500">
          已经连续学习 20 分钟啦,看看窗外的远处,喝口水,活动活动再回来~
        </p>
        <button
          onClick={() => {
            accumSec = 0
            setShow(false)
          }}
          className="mt-5 rounded-2xl bg-brand-500 px-8 py-3 font-bold text-white active:scale-95 transition"
        >
          休息好啦
        </button>
      </div>
    </div>
  )
}
