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
  resetOnePet,
  resetPet,
  getChallenge,
  type PetState,
} from '../../store/fun'
import { askParent } from '../../lib/parentGate'
import { withGuard } from '../../components/Guard'
import './index.scss'

function Fun() {
  const [owned, setOwned] = useState<string[]>([])
  const [pet, setPet] = useState<PetState>({ line: '', fed: 0, fedByLine: {}, graduated: [] })
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
    if (key === pet.line) return
    const had = pet.fedByLine[key] ?? 0
    const cur = pet.line ? getLine(pet.line) : undefined
    Taro.showModal({
      title: had > 0 ? '换回这一只?' : '换成这一只?',
      content: cur
        ? `${cur.eggName}养到 ${pet.fed} 口的进度会留着,随时能换回来。${had > 0 ? `这一只上次养到 ${had} 口。` : ''}`
        : '开始养这一只。',
      success: (res) => {
        if (!res.confirm) return
        choosePet(key)
        refresh()
      },
    })
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

  /*
    重置分两档,而且必须在弹窗里说清楚各自要丢什么。

    「这一只从头养」是孩子真正会想要的那个 —— 只把眼前这只清零。
    「全部重置」会连别的蛋和养大过的一起抹掉,所以放小、放后面,
    并且把要丢的东西一条条列出来:进度是他一题一题喂出来的,
    不能让一次误触就没了。
  */
  const confirmReset = (what: 'one' | 'all' | 'stickers') => {
    const lines = Object.keys(pet.fedByLine).filter((k) => (pet.fedByLine[k] ?? 0) > 0).length
    const title = what === 'stickers' ? '清空贴纸册?' : what === 'one' ? '这一只从头养?' : '全部重置?'
    let content = '这个操作不能撤销。'
    if (what === 'one' && line) {
      content = `${line.eggName}会回到蛋的样子(现在已喂 ${pet.fed} 口)。别的蛋的进度、养大过的都留着。`
    } else if (what === 'all') {
      content = `会清掉:${lines} 只蛋的全部进度${
        pet.graduated.length > 0 ? `、养大过的 ${pet.graduated.length} 只` : ''
      }。这个操作不能撤销 —— 只想重新养眼前这只的话,用上面那个按钮。`
    }
    const apply = () => {
      if (what === 'one') resetOnePet()
      else if (what === 'all') resetPet()
      else resetStickers()
      refresh()
    }
    /*
      「这一只从头养」是可逆的(别的蛋都在),普通确认就够。
      而「全部重置」「清空贴纸册」清掉的是他一题一题攒出来的东西 ——
      对 4 岁半的孩子来说,「确定吗?」那个确定他照点不误,
      所以这两个走家长闸门(一道两位数加法,他答不上来)。
    */
    if (what === 'one') {
      Taro.showModal({ title, content, success: (res) => res.confirm && apply() })
    } else {
      askParent(title, content, apply)
    }
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
            {pet.fed > 0 ? (
              <Text className='pet__btn pet__btn--ghost' onClick={() => confirmReset('one')}>
                🔄 这一只从头养
              </Text>
            ) : null}
          </View>
        ) : null}

        {/*
          蛋的列表**始终显示**,随时可以换一只养。
          进度按只分开记(见 store/fun.ts 的 fedByLine)—— 换来换去都不丢,
          想回去接着养随时可以。原先换一下就把辛苦喂的 40 口清零,
          而孩子往往只是好奇「别的蛋会变成什么」,不该为这点好奇付这个代价。
        */}
        <Text className='sec__tip'>
          {pet.line ? '想换一只养?点下面任意一颗 —— 两边进度都留着。' : '挑一颗蛋开始养吧,每答对一题就喂它一口。'}
        </Text>
        <View className='eggs'>
          {PET_LINES.map((l) => {
            const mine = pet.fedByLine[l.key] ?? 0
            const isNow = pet.line === l.key
            const ln = getLine(l.key)
            return (
              <View
                key={l.key}
                className={isNow ? 'egg egg--on' : 'egg'}
                onClick={() => pick(l.key)}
              >
                <Text className='egg__e'>
                  {mine > 0 && ln ? ln.stages[stageOf(mine)].emoji : '🥚'}
                </Text>
                <Text className='egg__n'>{l.eggName}</Text>
                <Text className='egg__h'>
                  {isNow ? '正在养' : mine > 0 ? `养到 ${mine} 口` : `会变成 ${l.hint}`}
                </Text>
              </View>
            )
          })}
        </View>
        {pet.graduated.length > 0 ? (
          <Text className='sec__tip'>
            养大过:{pet.graduated.map((k) => getLine(k)?.stages.slice(-1)[0].emoji ?? '❓').join(' ')}
          </Text>
        ) : null}
        {pet.line || pet.graduated.length > 0 ? (
          <Text className='sec__danger' onClick={() => confirmReset('all')}>
            全部重置(所有蛋一起清零)
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
        <Text className='sec__danger' onClick={() => confirmReset('stickers')}>
          清空贴纸册
        </Text>
      </View>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Fun)
