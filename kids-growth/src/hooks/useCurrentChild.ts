import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../store/useAppStore'
import { getAgeStage, getStageMeta, getUiTone, type AgeStageMeta } from '../lib/ageStage'
import type { AgeStage, Child, UiTone } from '../types'

export interface CurrentChildInfo {
  child: Child | undefined
  /** undefined = 尚在加载 */
  loading: boolean
  stage: AgeStage
  stageMeta: AgeStageMeta
  tone: UiTone
}

/** 当前选中孩子 + 其年龄阶段与界面语气,供全局分龄逻辑读取。 */
export function useCurrentChild(): CurrentChildInfo {
  const currentChildId = useAppStore((s) => s.currentChildId)
  const child = useLiveQuery(
    () => (currentChildId ? db.children.get(currentChildId) : undefined),
    [currentChildId],
  )
  const stage = child ? getAgeStage(child.birthdate) : 'primary'
  return {
    child,
    loading: child === undefined,
    stage,
    stageMeta: getStageMeta(stage),
    tone: child ? getUiTone(child.birthdate) : 'playful',
  }
}
