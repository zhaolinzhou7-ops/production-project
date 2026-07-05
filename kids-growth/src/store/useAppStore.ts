import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppMode = 'child' | 'parent'

interface AppState {
  currentChildId: string | null
  mode: AppMode
  isParentUnlocked: boolean
  setCurrentChildId: (id: string | null) => void
  unlockParent: () => void
  lockParent: () => void
  setMode: (mode: AppMode) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentChildId: null,
      mode: 'child',
      isParentUnlocked: false,
      setCurrentChildId: (id) => set({ currentChildId: id }),
      unlockParent: () => set({ isParentUnlocked: true, mode: 'parent' }),
      lockParent: () => set({ isParentUnlocked: false, mode: 'child' }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'kids-growth-app-state',
      partialize: (state) => ({ currentChildId: state.currentChildId }),
    },
  ),
)
