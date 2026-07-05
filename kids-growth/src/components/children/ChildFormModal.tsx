import { useState } from 'react'
import { X, Camera } from 'lucide-react'
import type { Child, Gender } from '../../types'
import { compressImageFile } from '../../lib/image'
import { Avatar } from '../common/Avatar'

export interface ChildFormValues {
  name: string
  nickname: string
  gender: Gender
  birthdate: string
  avatar?: string
  enrollmentYear?: number
}

interface ChildFormModalProps {
  open: boolean
  initial?: Child
  onClose: () => void
  onSubmit: (values: ChildFormValues) => void
}

export function ChildFormModal({ open, initial, onClose, onSubmit }: ChildFormModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [nickname, setNickname] = useState(initial?.nickname ?? '')
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'male')
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '')
  const [avatar, setAvatar] = useState<string | undefined>(initial?.avatar)
  const [enrollmentYear, setEnrollmentYear] = useState(
    initial?.enrollmentYear ? String(initial.enrollmentYear) : '',
  )
  const [error, setError] = useState('')

  if (!open) return null

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImageFile(file, 400, 0.85)
    setAvatar(compressed)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('请输入姓名')
      return
    }
    if (!birthdate) {
      setError('请选择出生日期')
      return
    }
    const year = Number(enrollmentYear)
    if (enrollmentYear && (!Number.isInteger(year) || year < 1990 || year > 2100)) {
      setError('入学年份格式不正确')
      return
    }
    onSubmit({
      name: name.trim(),
      nickname: nickname.trim(),
      gender,
      birthdate,
      avatar,
      enrollmentYear: enrollmentYear ? year : undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            {initial ? '编辑孩子资料' : '添加孩子'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="flex justify-center mb-4">
          <label className="relative cursor-pointer">
            <Avatar src={avatar} gender={gender} size={88} />
            <span className="absolute bottom-0 right-0 bg-brand-500 text-white rounded-full p-1.5 shadow">
              <Camera size={14} />
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">姓名 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：朵朵"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">昵称</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="家人对孩子的称呼"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">性别</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex-1 rounded-xl py-2.5 font-medium transition ${
                  gender === 'male' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                👦 男孩
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex-1 rounded-xl py-2.5 font-medium transition ${
                  gender === 'female' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                👧 女孩
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500">出生日期 *</label>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">小学入学年份（可选，用于推算年级）</label>
            <input
              type="number"
              value={enrollmentYear}
              onChange={(e) => setEnrollmentYear(e.target.value)}
              placeholder="例如 2021；未上小学可不填"
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 outline-none focus:border-brand-400"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-2xl bg-brand-500 py-3 font-bold text-white active:scale-95 transition"
        >
          {initial ? '保存' : '添加'}
        </button>
      </form>
    </div>
  )
}
