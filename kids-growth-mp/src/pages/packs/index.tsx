import { useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { packsForStage, BUILTIN_PACKS } from '../../core/learningContent'
import { adviseSyllabus } from '../../core/syllabus'
import {
  getCurrentChildId,
  getStage,
  addedPackKeys,
  packProgress,
  ensureBuiltinDeck,
  removeBuiltinDeck,
} from '../../store/study'
import type { AgeStage } from '../../types'
import { useParentGate } from '../../components/ParentGate'
import { withGuard } from '../../components/Guard'
import './index.scss'

/**
 * 内容库的分组标签。
 *
 * 「全部」是有意加的:孩子的实际水平常常跨着学段 —— 他 4 岁半,
 * 20 以内加减法已经做得不错,该给他小学档的算术;而英语还在启蒙。
 * 只按学段过滤会让家长看不到那些他其实用得上的包。
 */
type Browse = AgeStage | 'all'

const STAGES: Array<[Browse, string]> = [
  ['toddler', '幼儿 3-6岁'],
  ['primary', '小学'],
  ['junior', '初中'],
  ['all', '全部'],
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
  /*
    这里存的是**正在浏览哪一档**,和孩子自己的学段是两回事。

    原先切标签会顺手把孩子的学段也改掉 —— 家长只是想看看小学档有什么内容,
    结果整个 App 的推荐、题量、难度参数全跟着变了,而他完全不知道
    是刚才那一下点的。浏览就只是浏览。
  */
  const [stage, setStageState] = useState<Browse>(() => getStage())
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')

  const refresh = (s?: Browse) => {
    const st = s ?? stage
    setStageState(st)
    const childId = getCurrentChildId()
    const added = addedPackKeys(childId)
    const list = st === 'all' ? BUILTIN_PACKS : packsForStage(st)
    setRows(
      list.map((p) => ({
        key: p.key,
        name: p.name,
        subject: p.subject,
        icon: p.icon,
        added: added.has(p.key),
      })),
    )
  }

  // 第一次进来落在孩子当前的学段上,之后由家长自己切
  useDidShow(() => refresh(stage))

  /** 现在该练哪几包、什么时候开下一包(见 core/syllabus) */
  const advice = useMemo(
    () => adviseSyllabus(packProgress(getCurrentChildId())),
    // rows 变了说明装/卸过包,要重算
    [rows],
  )
  const nameOf = (key: string) => BUILTIN_PACKS.find((p) => p.key === key)?.name ?? key

  const switchStage = (s: Browse) => {
    // 只换看的,不动孩子的学段
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
      {/*
        推荐顺序。

        现在的难度递增只发生在**练法**上,内容是平摊的 —— 装了十个包,
        六百个词从第一天起一起轮,结果每样都碰一点、每样都不熟。
        先把最高频的一小批练到自动化,再开下一批,比同时铺开有效得多。
      */}
      {advice ? (
        <View className='syl'>
          <Text className='syl__t'>📚 学习顺序</Text>
          <Text className='syl__n'>{advice.note}</Text>
          {advice.nextKey ? (
            <View
              className='syl__next'
              onClick={() => {
                const row = rows.find((r) => r.key === advice.nextKey)
                if (row) void toggle(row)
              }}
            >
              <Text className='syl__nextt'>
                下一包建议:{nameOf(advice.nextKey)} —— {advice.nextWhy}
              </Text>
              <Text className='syl__nextb'>+ 加进来</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text className='packs__tip'>
        点一下加进首页,再点一下移除。加进来的内容会按遗忘曲线安排复习。
        切换上面的标签只是换着看,不会改变孩子的学段设置 ——
        孩子在某一科超前时,直接从更高的档里挑就行。
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
