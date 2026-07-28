import { useMemo, useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { getCurrentChildId } from '../../store/study'
import { listAnecdotes, addAnecdote, removeAnecdote, traitProfile } from '../../store/records'
import { TRAIT_PRESETS } from '../../core/recordModules'
import { todayISO } from '../../core/dateUtils'
import { withGuard } from '../../components/Guard'
import type { Anecdote, AnecdoteKind } from '../../types'
import './index.scss'

/**
 * 闪光事例与品格画像。
 *
 * 教育里有条被反复验证的原则:**表扬具体行为,不表扬笼统品质**。
 * 「你真棒」孩子学不到东西;「你今天主动把玩具让给妹妹了」他才知道
 * 什么行为值得再做一次。所以这个页面强制填「发生了什么」,
 * 品格标签只是给这件事归个类,不是给孩子下定义。
 */
function Anecdotes() {
  const [childId, setChildId] = useState('')
  const [rows, setRows] = useState<Anecdote[]>([])
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<AnecdoteKind>('shine')
  const [content, setContent] = useState('')
  const [traits, setTraits] = useState<string[]>([])
  const [action, setAction] = useState('')

  const refresh = () => {
    const cid = getCurrentChildId()
    setChildId(cid)
    setRows(listAnecdotes(cid))
  }

  useDidShow(refresh)

  const profile = useMemo(() => (childId ? traitProfile(childId) : []), [childId, rows])
  const maxCount = profile.length > 0 ? profile[0].count : 1

  const toggleTrait = (t: string) => {
    setTraits(traits.indexOf(t) >= 0 ? traits.filter((x) => x !== t) : [...traits, t])
  }

  const save = () => {
    const text = content.trim()
    if (text.length === 0) {
      Taro.showToast({ title: '先写下发生了什么', icon: 'none' })
      return
    }
    addAnecdote(childId, {
      date: todayISO(),
      kind,
      content: text,
      traits,
      parentAction: action.trim() || undefined,
    })
    setContent('')
    setTraits([])
    setAction('')
    setAdding(false)
    refresh()
    Taro.showToast({ title: '记下了', icon: 'success' })
  }

  const del = (a: Anecdote) => {
    Taro.showModal({
      title: '删掉这条事例?',
      content: a.content.slice(0, 40),
      success: (res) => {
        if (!res.confirm) return
        removeAnecdote(a.id)
        refresh()
      },
    })
  }

  return (
    <View className='an'>
      <View className='an__hero'>
        <Text className='an__title'>闪光事例</Text>
        <Text className='an__sub'>记下具体做了什么,别急着给孩子贴标签</Text>
      </View>

      {profile.length > 0 ? (
        <View className='card'>
          <Text className='card__hd'>品格画像</Text>
          <Text className='hint' style={{ marginTop: '0', marginBottom: '16px' }}>
            这不是评分,只是「我们在他身上看见过哪些时刻」的统计。
          </Text>
          {profile.map((t) => (
            <View className='tr' key={t.trait}>
              <Text className='tr__n'>{t.trait}</Text>
              <View className='tr__track'>
                <View className='tr__fill' style={{ width: `${Math.round((t.count / maxCount) * 100)}%` }} />
              </View>
              <Text className='tr__c'>{t.count}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {adding ? (
        <View className='card'>
          <Text className='card__hd'>记一件事</Text>
          <Text className='fl'>是哪一类</Text>
          <View className='segs'>
            <View className={kind === 'shine' ? 'seg seg--on' : 'seg'} onClick={() => setKind('shine')}>
              <Text className='seg__t'>✨ 闪光时刻</Text>
            </View>
            <View className={kind === 'growth' ? 'seg seg--on' : 'seg'} onClick={() => setKind('growth')}>
              <Text className='seg__t'>🌱 成长时刻</Text>
            </View>
          </View>
          <Text className='hint' style={{ marginTop: '10px' }}>
            {kind === 'shine'
              ? '值得被看见的具体行为,以后翻出来读给他听。'
              : '犯了错、遇到挫折也值得记 —— 记的是他怎么面对的,以及我们怎么陪他过去的。'}
          </Text>

          <Text className='fl'>发生了什么 *</Text>
          <Textarea
            className='ta'
            value={content}
            maxlength={300}
            placeholder='写具体一点。比如「妹妹摔倒了,他主动跑过去扶起来,还问疼不疼」'
            onInput={(e) => setContent(e.detail.value)}
          />

          <Text className='fl'>体现了什么(可多选,也可不选)</Text>
          <View className='tags'>
            {TRAIT_PRESETS.map((t) => (
              <View
                key={t}
                className={traits.indexOf(t) >= 0 ? 'tag tag--on' : 'tag'}
                onClick={() => toggleTrait(t)}
              >
                <Text className='tag__t'>{t}</Text>
              </View>
            ))}
          </View>

          <Text className='fl'>我当时怎么做的(可不填)</Text>
          <Textarea
            className='ta'
            value={action}
            maxlength={200}
            placeholder='记下自己的引导方式。过几年回头看,这些才是最有用的部分'
            onInput={(e) => setAction(e.detail.value)}
          />

          <View className='save' onClick={save}>
            <Text className='save__t'>保存</Text>
          </View>
          <View className='save save--ghost' onClick={() => setAdding(false)}>
            <Text className='save__t'>取消</Text>
          </View>
        </View>
      ) : (
        <View className='save' onClick={() => setAdding(true)}>
          <Text className='save__t'>+ 记一件事</Text>
        </View>
      )}

      <View className='card'>
        <Text className='card__hd'>全部事例({rows.length})</Text>
        {rows.length === 0 ? (
          <Text className='empty'>还没有记录。今天孩子做了什么让你心里一动的事?记下来。</Text>
        ) : null}
        {rows.map((a) => (
          <View className='row' key={a.id}>
            <View className='row__m'>
              <Text className='row__d'>
                {a.date} · {a.kind === 'shine' ? '✨ 闪光时刻' : '🌱 成长时刻'}
              </Text>
              <Text className='row__t'>{a.content}</Text>
              {a.traits.length > 0 ? <Text className='row__x'>体现:{a.traits.join(' · ')}</Text> : null}
              {a.parentAction ? <Text className='row__x'>我的引导:{a.parentAction}</Text> : null}
            </View>
            <Text className='row__del' onClick={() => del(a)}>
              删除
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export default withGuard(Anecdotes)
