import { useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import {
  getCurrentChildId,
  addErrorCard,
  listErrorCards,
  deleteCard,
  getErrorDeckId,
  graduateErrorCards,
  errorDueToday,
} from '../../store/study'
import type { LearnCard } from '../../types'
import { withGuard } from '../../components/Guard'
import './index.scss'

const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '其他']

function ErrorBook() {
  const [cards, setCards] = useState<LearnCard[]>([])
  const [deckId, setDeckId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [subject, setSubject] = useState('数学')

  const [due, setDue] = useState(0)
  const [graduated, setGraduated] = useState(0)

  const refresh = () => {
    const cid = getCurrentChildId()
    /*
      每次进来先让「已经连对两次」的错题毕业。
      放在进页面时做而不是答对时做,是因为答对的那一刻孩子还在做题 ——
      让他看到题目从列表里消失是家长的事,不该打断他。
    */
    // 老数据里可能还留着「连对两次」那一版没结算掉的,顺手清一次
    const out = graduateErrorCards(cid)
    if (out > 0) setGraduated(out)
    setCards(listErrorCards(cid))
    setDeckId(getErrorDeckId(cid) || '')
    setDue(errorDueToday(cid))
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
        {cards.length > 0 ? (
          <View className='btn btn--mint' onClick={review}>
            <Text className='btn__t'>{due > 0 ? `▶ 重做 ${due} 道` : '▶ 重做'}</Text>
          </View>
        ) : null}
      </View>
      {/*
        毕业提示。错题本能长期用下去的前提是它**会变短** ——
        家长要看得见「消化掉了几道」,否则只看到越攒越多,很快就不点了。
      */}
      {graduated > 0 ? (
        <Text className='eb__grad'>🎓 有 {graduated} 道已经连着做对两次,移出错题本了</Text>
      ) : null}
      {cards.length > 0 ? (
        <Text className='eb__grad'>
          错题本里还有 {cards.length} 道{due > 0 ? `,今天到期 ${due} 道` : ',今天没有到期的'}
        </Text>
      ) : null}

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

      <Text className='eb__note'>
        重做的形式和当初做错时一样:选择题还是选择题(A、B、C、D、E),
        算错的算术题还是让他算一遍,点一下都能读出声。
        **做对一道就从这里消失**;做错的留下来,过几天再出现,直到真正掌握。
      </Text>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(ErrorBook)
