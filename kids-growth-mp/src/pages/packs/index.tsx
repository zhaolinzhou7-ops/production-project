import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { packsForStage } from '../../core/learningContent'
import {
  getCurrentChildId,
  getStage,
  setStage,
  addedPackKeys,
  ensureBuiltinDeck,
  removeBuiltinDeck,
} from '../../store/study'
import type { AgeStage } from '../../types'
import { useParentGate } from '../../components/ParentGate'
import { withGuard } from '../../components/Guard'
import './index.scss'

const STAGES: Array<[AgeStage, string]> = [
  ['toddler', '幼儿 3-6岁'],
  ['primary', '小学'],
  ['junior', '初中'],
]

interface Row {
  key: string
  name: string
  subject: string
  icon: string
  added: boolean
}

function Packs() {
  const { ask: askParent, gate: parentGate } = useParentGate()
  const [stage, setStageState] = useState<AgeStage>('primary')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')

  const refresh = (s?: AgeStage) => {
    const st = s ?? getStage()
    setStageState(st)
    const childId = getCurrentChildId()
    const added = addedPackKeys(childId)
    setRows(
      packsForStage(st).map((p) => ({
        key: p.key,
        name: p.name,
        subject: p.subject,
        icon: p.icon,
        added: added.has(p.key),
      })),
    )
  }

  useDidShow(() => refresh())

  const switchStage = (s: AgeStage) => {
    setStage(s)
    refresh(s)
  }

  const toggle = (row: Row) => {
    if (busy) return
    const childId = getCurrentChildId()
    if (row.added) {
      // 删卡组会连学习进度一起没 —— 孩子误点一下就没了,走家长闸门
      askParent(`移除「${row.name}」?`, '这个内容包的学习进度也会一起删掉,以后可以再加回来。', () => {
        try {
          removeBuiltinDeck(childId, row.key)
        } catch {
          /* 忽略 */
        }
        refresh()
      })
      return
    }
    setBusy(row.key)
    // 加包要写入几百张卡片,先让「添加中」渲染出来再干活,免得界面像卡住
    setTimeout(() => {
      try {
        ensureBuiltinDeck(childId, row.key)
        Taro.showToast({ title: '已添加', icon: 'success' })
      } catch (e) {
        Taro.showModal({
          title: '添加失败',
          content: e instanceof Error ? e.message : String(e),
          showCancel: false,
        })
      }
      setBusy('')
      refresh()
    }, 60)
  }

  return (
    <View className='packs'>
      {parentGate}
      <View className='tabs'>
        {STAGES.map(([s, label]) => (
          <View
            key={s}
            className={s === stage ? 'tab tab--on' : 'tab'}
            onClick={() => switchStage(s)}
          >
            <Text className='tab__t'>{label}</Text>
          </View>
        ))}
      </View>
      <Text className='packs__tip'>
        点一下加进首页,再点一下移除。加进来的内容会按遗忘曲线安排复习。
      </Text>

      {rows.map((row) => (
        <View key={row.key} className='prow' onClick={() => toggle(row)}>
          <Text className='prow__icon'>{row.icon}</Text>
          <View className='prow__meta'>
            <Text className='prow__name'>{row.name}</Text>
            <Text className='prow__sub'>{row.subject}</Text>
          </View>
          <Text className={row.added ? 'prow__btn prow__btn--on' : 'prow__btn'}>
            {busy === row.key ? '添加中…' : row.added ? '已添加' : '+ 添加'}
          </Text>
        </View>
      ))}
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Packs)
