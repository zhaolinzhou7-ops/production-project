import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'

export function RequireParent({ children }: { children: ReactNode }) {
  const isParentUnlocked = useAppStore((s) => s.isParentUnlocked)
  if (!isParentUnlocked) {
    // Redirect to the kid home rather than the PIN page: if this route is
    // mid-unmount after an explicit "exit parent mode" action, both the
    // in-flight navigation and this guard now agree on the same destination,
    // avoiding a redirect race. Visiting a /parent/* URL directly still ends
    // up somewhere safe; use the "家长模式" button to reach the PIN page.
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
