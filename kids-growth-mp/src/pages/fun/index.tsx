import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { STICKER_CATALOG } from '../../core/stickers'
import { PET_LINES, getLine, stageOf, toNextStage, isFullyGrown, FEED_THRESHOLDS } from '../../core/pets'
import {
  ownedStickers,
  resetStickers,
  getPet,
  choosePet,
  graduatePet,
  resetPet,
  getChallenge,
  type PetState,
} from '../../store/fun'
import './index.scss'

export default function Fun() {
  const [owned, setOwned] = useState<string[]>([])
  const [pet, setPet] = useState<PetState>({ line: '', fed: 0, graduated: [] })
  const [challenge, setChallenge] = useState({ done: 0, goal: 3 })

  const refresh = () => {
    setOwned(ownedStickers())
    setPet(getPet())
    setChallenge(getChallenge())
  }

  useDidShow(refresh)

  const line = pet.line ? getLine(pet.line) : undefined
  const stage = line ? stageOf(pet.fed) : 0
  const grown = !!line && isFullyGrown(pet.fed)
  const need = toNextStage(pet.fed)
  const maxFed = FEED_THRESHOLDS[FEED_THRESHOLDS.length - 1]

  const pick = (key: string) => {
    choosePet(key)
    refresh()
  }

  const graduate = () => {
    Taro.showModal({
      title: '让它出师?',
      content: '它会进到「养大过的」里,你可以重新挑一颗蛋再养一只。',
      success: (res) => {
        if (!res.confirm) return
        graduatePet()
        refresh()
      },
    })
  }

  const confirmReset = (what: 'pet' | 'stickers') => {
    Taro.showModal({
      title: what === 'pet' ? '重置宠物?' : '清空贴纸册?',
      content: '这个操作不能撤销。',
      success: (res) => {
        if (!res.confirm) return
        if (what === 'pet') resetPet()
        else resetStickers()
        refresh()
      },
    })
  }

  return (
    <View className='fun'>
      {/* 每日挑战 */}
      <View className='chal'>
        <Text className='chal__t'>今日挑战</Text>
        <Text className='chal__n'>
          {challenge.done}/{challenge.goal} 组
        </Text>
        <View className='chal__track'>
          <View
            className='chal__fill'
            style={{ width: `${Math.min(100, (challenge.done / challenge.goal) * 100)}%` }}
          />
        </View>
        <Text className='chal__hint'>
          {challenge.done >= challenge.goal ? '🏆 今天的挑战完成啦!' : '每做完一组练习算一次'}
        </Text>
      </View>

      {/* 宠物 */}
      <View className='sec'>
        <Text className='sec__t'>我的学习宠物</Text>
        {line ? (
          <View className='pet'>
            <Text className='pet__e'>{line.stages[stage].emoji}</Text>
            <Text className='pet__n'>{line.stages[stage].label}</Text>
            <View className='pet__track'>
              <View className='pet__fill' style={{ width: `${Math.min(100, (pet.fed / maxFed) * 100)}%` }} />
            </View>
            <Text className='pet__hint'>
              {grown ? '已经养到最终形态啦!' : `再答对 ${need} 题就会进化(已喂 ${pet.fed} 口)`}
            </Text>
            {grown ? (
              <Text className='pet__btn' onClick={graduate}>
                让它出师,再养一只
              </Text>
            ) : null}
            <Text className='pet__btn pet__btn--ghost' onClick={() => confirmReset('pet')}>
              重置
            </Text>
          </View>
        ) : (
          <View>
            <Text className='sec__tip'>挑一颗蛋开始养吧,每答对一题就喂它一口。</Text>
            <View className='eggs'>
              {PET_LINES.map((l) => (
                <View key={l.key} className='egg' onClick={() => pick(l.key)}>
                  <Text className='egg__e'>🥚</Text>
                  <Text className='egg__n'>{l.eggName}</Text>
                  <Text className='egg__h'>会变成 {l.hint}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {pet.graduated.length > 0 ? (
          <Text className='sec__tip'>
            养大过:{pet.graduated.map((k) => getLine(k)?.stages.slice(-1)[0].emoji ?? '❓').join(' ')}
          </Text>
        ) : null}
      </View>

      {/* 贴纸册 */}
      <View className='sec'>
        <Text className='sec__t'>
          贴纸册 {owned.length}/{STICKER_CATALOG.length}
        </Text>
        <Text className='sec__tip'>一次练习答对 8 成以上,就会掉一张新贴纸。</Text>
        <View className='stickers'>
          {STICKER_CATALOG.map((s) => {
            const has = owned.includes(s.key)
            return (
              <View key={s.key} className={has ? 'st st--on' : 'st'}>
                <Text className='st__e'>{has ? s.emoji : '❔'}</Text>
                <Text className='st__n'>{has ? s.name : '???'}</Text>
              </View>
            )
          })}
        </View>
        <Text className='pet__btn pet__btn--ghost' onClick={() => confirmReset('stickers')}>
          清空贴纸册
        </Text>
      </View>
    </View>
  )
}
