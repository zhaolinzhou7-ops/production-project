import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, ShieldCheck } from 'lucide-react'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'

const PIN_LENGTH = 4

export function ParentPinPage() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const navigate = useNavigate()
  const unlockParent = useAppStore((s) => s.unlockParent)

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      db.settings.get('singleton').then((settings) => {
        if (settings?.parentPin === pin) {
          unlockParent()
          navigate('/parent')
        } else {
          setError(true)
          setTimeout(() => {
            setPin('')
            setError(false)
          }, 500)
        }
      })
    }
  }, [pin, navigate, unlockParent])

  const press = (digit: string) => {
    if (pin.length < PIN_LENGTH) setPin((p) => p + digit)
  }
  const backspace = () => setPin((p) => p.slice(0, -1))

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
      <div className="rounded-full bg-brand-100 p-4 mb-4 text-brand-500">
        <ShieldCheck size={32} />
      </div>
      <h1 className="text-xl font-bold text-gray-800 mb-1">家长模式</h1>
      <p className="text-sm text-gray-400 mb-6">请输入 4 位 PIN 码</p>

      <div className={`flex gap-3 mb-8 ${error ? 'animate-pulse' : ''}`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < pin.length ? (error ? 'bg-red-400 border-red-400' : 'bg-brand-500 border-brand-500') : 'border-gray-300'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="rounded-2xl bg-white/70 py-4 text-xl font-medium text-gray-700 shadow-sm active:scale-95 transition"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          onClick={() => press('0')}
          className="rounded-2xl bg-white/70 py-4 text-xl font-medium text-gray-700 shadow-sm active:scale-95 transition"
        >
          0
        </button>
        <button
          onClick={backspace}
          className="rounded-2xl bg-white/40 py-4 flex items-center justify-center text-gray-500 active:scale-95 transition"
        >
          <Delete size={20} />
        </button>
      </div>

      <p className="mt-8 text-xs text-gray-400">默认 PIN 为 1234，可在家长设置中修改</p>
    </div>
  )
}
