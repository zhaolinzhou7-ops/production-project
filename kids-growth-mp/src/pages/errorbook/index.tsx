import { useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import {
  getCurrentChildId,
  addErrorCard,
  listErrorCards,
  deleteCard,
  getErrorDeckId,
} from '../../store/study'
import type { LearnCard } from '../../types'
import './index.scss'

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '其他']

export default function ErrorBook() {
  const [cards, setCards] = useState<LearnCard[]>([])
  const [deckId, setDeckId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [subject, setSubject] = useState('数学')

  const refresh = () => {
    const cid = getCurrentChildId()
    setCards(listErrorCards(cid))
    setDeckId(getErrorDeckId(cid) || '')
  }
  useLoad(refresh)
  useDidShow(refresh)

  const save = () => {
    if (!front.trim() || !back.trim()) return
    addErrorCard(getCurrentChildId(), { front, back, subject })
    setFront('')
    setBack('')
    setShowForm(false)
    refresh()
  }

  const del = (id: string) => {
    Taro.showModal({
      title: '删除这道错题?',
      content: '将从错题本中移除,不可撤销。',
      success: (r) => {
        if (r.confirm) {
          deleteCard(id)
          refresh()
        }
      },
    })
  }

  const review = () => {
    if (deckId) Taro.navigateTo({ url: `/pages/session/index?deckId=${deckId}&mode=review` })
  }

  return (
    <View className='eb'>
      <View className='eb__actions'>
        <View className='btn btn--primary' onClick={() => setShowForm((v) => !v)}><Text className='btn__t'>＋ 记一道错题</Text></View>
        {cards.length > 0 ? <View className='btn btn--mint' onClick={review}><Text className='btn__t'>▶ 重做</Text></View> : null}
      </View>

      {showForm ? (
        <View className='form'>
          <View className='subs'>
            {SUBJECTS.map((s) => (
              <View key={s} className={subject === s ? 'sub sub--on' : 'sub'} onClick={() => setSubject(s)}><Text className='sub__t'>{s}</Text></View>
            ))}
          </View>
          <Textarea className='ta' value={front} onInput={(e) => setFront(e.detail.value)} placeholder='题目(可只写关键词)' />
          <Textarea className='ta ta--sm' value={back} onInput={(e) => setBack(e.detail.value)} placeholder='正确答案 / 解析' />
          <View className='btn btn--primary' onClick={save}><Text className='btn__t'>保存</Text></View>
        </View>
      ) : null}

      {cards.length === 0 ? (
        <View className='empty'>
          <Text className='empty__e'>📕</Text>
          <Text className='empty__t'>还没有错题。把做错的题记进来,按遗忘曲线重做,才是提分关键。</Text>
        </View>
      ) : (
        cards.map((c) => (
          <View key={c.id} className='item'>
            <View className='item__main'>
              {(c.extra as { subject?: string } | undefined)?.subject ? (
                <Text className='item__tag'>{(c.extra as { subject?: string }).subject}</Text>
              ) : null}
              <Text className='item__q'>{c.front}</Text>
              <Text className='item__a'>答案:{c.back}</Text>
            </View>
            <Text className='item__del' onClick={() => del(c.id)}>🗑</Text>
          </View>
        ))
      )}

      <Text className='eb__note'>错题按间隔重复排期:重做答对则拉长间隔,答错则很快再现,直到真正掌握。</Text>
    </View>
  )
}
