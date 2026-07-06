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
  getStudyStreak,
  getTodayStudyMinutes,
} from '../../store/study'
import { isCloudConfigured, pushToCloud, pullFromCloud } from '../../cloud/sync'
import type { LearnDeck } from '../../types'
import './index.scss'

interface DeckRow {
  deck: LearnDeck
  due: number
}

/** 每日建议学习时长上限(分钟),超过给护眼提醒 */
const DAILY_LIMIT_MIN = 30

export default function Index() {
  const [rows, setRows] = useState<DeckRow[]>([])
  const [xp, setXp] = useState(0)
  const [streak, setStreak] = useState(0)
  const [minutes, setMinutes] = useState(0)

  const refresh = () => {
    const childId = getCurrentChildId()
    for (const p of packsForStage('primary')) {
      ensureBuiltinDeck(childId, p.key)
    }
    const decks = listChildDecks(childId).filter(
      (d) => !(d.source === 'wrong' && d.itemType === 'wrong'),
    )
    setRows(decks.map((deck) => ({ deck, due: countDue(childId, deck.id) })))
    setXp(getPoints().xp)
    setStreak(getStudyStreak())
    setMinutes(getTodayStudyMinutes())
  }

  useLoad(refresh)
  useDidShow(refresh)

  const go = (deckId: string, mode: string) => {
    Taro.navigateTo({ url: `/pages/session/index?deckId=${deckId}&mode=${mode}` })
  }

  const sync = async () => {
    Taro.showLoading({ title: '同步中…' })
    const up = await pushToCloud()
    const down = await pullFromCloud()
    Taro.hideLoading()
    if (up === 'nocloud' || down === 'nocloud') {
      Taro.showModal({
        title: '未开启云同步',
        content: '请先在云开发控制台创建环境,并把环境 ID 填入 src/cloud/config.ts 的 CLOUD_ENV。',
        showCancel: false,
      })
      return
    }
    refresh()
    Taro.showToast({ title: up === 'ok' ? '已同步' : '同步完成', icon: 'success' })
  }

  const wordModes: Array<[string, string, string]> = [
    ['recognize', '👀', '认词'],
    ['listenChoose', '👂', '听音选义'],
    ['spell', '⌨️', '拼写'],
    ['dictation', '✍️', '听写'],
    ['speak', '🎤', '跟读'],
  ]

  return (
    <View className='home'>
      <View className='home__hero'>
        <Text className='home__title'>成长学习 🌱</Text>
        <View className='home__stat'>
          <Text className='home__xp'>成长值 {xp}</Text>
          {streak > 0 ? <Text className='home__streak'>🔥 {streak} 天</Text> : null}
          <Text className='home__sync' onClick={() => void sync()}>
            {isCloudConfigured() ? '☁️ 同步' : '☁️'}
          </Text>
        </View>
      </View>

      {minutes >= DAILY_LIMIT_MIN ? (
        <View className='rest'>
          <Text className='rest__t'>今天已经学了 {minutes} 分钟啦,起来活动一下、看看远处,保护小眼睛 👀</Text>
        </View>
      ) : null}

      <View className='entries'>
        <View className='entry entry--math' onClick={() => Taro.navigateTo({ url: '/pages/math/index' })}>
          <Text className='entry__icon'>🧮</Text>
          <Text className='entry__t'>口算练习</Text>
        </View>
        <View className='entry entry--eb' onClick={() => Taro.navigateTo({ url: '/pages/errorbook/index' })}>
          <Text className='entry__icon'>📕</Text>
          <Text className='entry__t'>错题本</Text>
        </View>
      </View>

      {rows.map(({ deck, due }) => {
        const modes: Array<[string, string, string]> =
          deck.itemType === 'word'
            ? wordModes
            : deck.itemType === 'poem'
              ? [
                  ['recite', '📖', '朗读背诵'],
                  ['fillBlank', '✏️', '补全诗句'],
                ]
              : [
                  ['recognize', '👀', '认字'],
                  ['listenChoose', '👂', '听音选字'],
                ]
        return (
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
              {modes.map(([m, icon, label]) => (
                <View key={m} className='mode' onClick={() => go(deck.id, m)}>
                  <Text className='mode__icon'>{icon}</Text>
                  <Text className='mode__label'>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )
      })}

      <Text className='home__note'>
        单词发音为网络真人音源(需联网);古诗/识字用系统语音朗读。跟读的录音只在本地处理、不上传。
      </Text>
    </View>
  )
}
