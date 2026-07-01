import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'

export function RequireParent({ children }: { children: ReactNode }) {
  const isParentUnlocked = useAppStore((s) => s.isParentUnlocked)
  if (!isParentUnlocked) {
    return <Navigate to="/parent/pin" replace />
  }
  return <>{children}</>
}
