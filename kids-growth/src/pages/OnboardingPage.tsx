import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ChildFormModal, type ChildFormValues } from '../components/children/ChildFormModal'
import { db } from '../db/db'
import { newId } from '../lib/id'
import { useAppStore } from '../store/useAppStore'

export function OnboardingPage() {
  const [formOpen, setFormOpen] = useState(true)
  const setCurrentChildId = useAppStore((s) => s.setCurrentChildId)

  const handleAdd = async (values: ChildFormValues) => {
    const id = newId()
    await db.children.add({
      id,
      name: values.name,
      nickname: values.nickname || undefined,
      gender: values.gender,
      birthdate: values.birthdate,
      avatar: values.avatar,
      enrollmentYear: values.enrollmentYear,
      createdAt: Date.now(),
    })
    setCurrentChildId(id)
    setFormOpen(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
      <div className="text-6xl mb-4">🌱</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">欢迎使用小朋友成长系统</h1>
      <p className="text-gray-500 mb-8 flex items-center gap-1">
        <Sparkles size={16} className="text-brand-500" />
        先添加一个孩子的档案开始吧
      </p>
      <ChildFormModal open={formOpen} onClose={() => {}} onSubmit={handleAdd} />
    </div>
  )
}
