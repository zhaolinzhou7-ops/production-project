import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { packsForStage } from '../../core/learningContent'
import {
  getCurrentChildId,
  ensureBuiltinDeck,
  listChildDecks,
  countDue,
  getPoints,
} from '../../store/study'
import type { LearnDeck } from '../../types'
import './index.scss'

interface DeckRow {
  deck: LearnDeck
  due: number
}

export default function Index() {
  const [rows, setRows] = useState<DeckRow[]>([])
  const [xp, setXp] = useState(0)

  const refresh = () => {
    const childId = getCurrentChildId()
    // 小学学段默认分配:英语高频词 + 唐诗启蒙 + 常用识字
    for (const p of packsForStage('primary')) {
      ensureBuiltinDeck(childId, p.key)
    }
    const decks = listChildDecks(childId)
    setRows(decks.map((deck) => ({ deck, due: countDue(childId, deck.id) })))
    setXp(getPoints().xp)
  }

  useLoad(refresh)
  useDidShow(refresh)

  const go = (deckId: string, mode: string) => {
    Taro.navigateTo({ url: `/pages/session/index?deckId=${deckId}&mode=${mode}` })
  }

  return (
    <View className='home'>
      <View className='home__hero'>
        <Text className='home__title'>成长学习 🌱</Text>
        <Text className='home__xp'>成长值 {xp}</Text>
      </View>

      {rows.map(({ deck, due }) => (
        <View key={deck.id} className='deck'>
          <View className='deck__head'>
            <Text className='deck__icon'>{deck.icon}</Text>
            <View className='deck__meta'>
              <Text className='deck__name'>{deck.name}</Text>
              <Text className='deck__sub'>{deck.subject}</Text>
            </View>
            {due > 0 ? (
              <Text className='deck__badge'>待学 {due}</Text>
            ) : (
              <Text className='deck__badge deck__badge--done'>已清空</Text>
            )}
          </View>
          <View className='deck__modes'>
            <View className='mode' onClick={() => go(deck.id, 'recognize')}>
              <Text className='mode__icon'>👀</Text>
              <Text className='mode__label'>{deck.itemType === 'hanzi' ? '认字' : '认词'}</Text>
            </View>
            {deck.itemType === 'word' && (
              <>
                <View className='mode' onClick={() => go(deck.id, 'listenChoose')}>
                  <Text className='mode__icon'>👂</Text>
                  <Text className='mode__label'>听音选义</Text>
                </View>
                <View className='mode' onClick={() => go(deck.id, 'spell')}>
                  <Text className='mode__icon'>⌨️</Text>
                  <Text className='mode__label'>拼写</Text>
                </View>
                <View className='mode' onClick={() => go(deck.id, 'dictation')}>
                  <Text className='mode__icon'>✍️</Text>
                  <Text className='mode__label'>听写</Text>
                </View>
                <View className='mode' onClick={() => go(deck.id, 'speak')}>
                  <Text className='mode__icon'>🎤</Text>
                  <Text className='mode__label'>跟读</Text>
                </View>
              </>
            )}
          </View>
        </View>
      ))}

      <Text className='home__note'>
        单词发音为网络真人音源(需联网);开发者工具里请勾选「不校验合法域名」或在后台配置 dict.youdao.com。
      </Text>
    </View>
  )
}
