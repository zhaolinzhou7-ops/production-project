import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  ensureRewards,
  listRewards,
  spendable,
  redeem,
  listRedemptions,
  type Reward,
  type Redemption,
} from '../../store/rewards'
import CorrectBurst from '../../components/CorrectBurst'
import { withGuard } from '../../components/Guard'
import './index.scss'

function Rewards() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [can, setCan] = useState(0)
  const [history, setHistory] = useState<Redemption[]>([])
  const [burst, setBurst] = useState(0)

  const refresh = () => {
    ensureRewards()
    setRewards(listRewards())
    setCan(spendable())
    setHistory(listRedemptions().slice(0, 8))
  }

  useDidShow(refresh)

  const tryRedeem = (r: Reward) => {
    if (can < r.cost) {
      Taro.showModal({
        title: '还差一点点',
        content: `「${r.name}」需要 ${r.cost} 分,你现在有 ${can} 分,再攒 ${r.cost - can} 分就可以啦。`,
        showCancel: false,
        confirmText: '继续加油',
      })
      return
    }
    Taro.showModal({
      title: `兑换「${r.name}」?`,
      content: `会用掉 ${r.cost} 分。兑换后请找爸爸妈妈确认。`,
      success: (res) => {
        if (!res.confirm) return
        const out = redeem(r.id)
        if (out === 'ok') {
          setBurst((b) => b + 1)
          Taro.showToast({ title: '兑换成功!', icon: 'success' })
          refresh()
        } else {
          Taro.showToast({ title: '兑换失败', icon: 'none' })
        }
      },
    })
  }

  return (
    <View className='rw'>
      {burst > 0 ? <CorrectBurst seed={burst} combo={0} /> : null}

      <View className='rw__hero'>
        <Text className='rw__n'>{can}</Text>
        <Text className='rw__l'>可以花的成长值</Text>
        <Text className='rw__h'>兑换不会让等级掉下去,等级只升不降 😊</Text>
      </View>

      {rewards.map((r) => {
        const enough = can >= r.cost
        return (
          <View key={r.id} className={enough ? 'rrow rrow--on' : 'rrow'} onClick={() => tryRedeem(r)}>
            <Text className='rrow__e'>{r.emoji}</Text>
            <View className='rrow__meta'>
              <Text className='rrow__t'>{r.name}</Text>
              {!enough ? <Text className='rrow__gap'>还差 {r.cost - can} 分</Text> : null}
            </View>
            <Text className={enough ? 'rrow__c rrow__c--on' : 'rrow__c'}>{r.cost} 分</Text>
          </View>
        )
      })}

      {history.length > 0 ? (
        <View className='hist'>
          <Text className='hist__t'>换过的</Text>
          {history.map((d) => (
            <View key={d.id} className='hist__row'>
              <Text className='hist__e'>{d.emoji}</Text>
              <Text className='hist__n'>{d.name}</Text>
              <Text className={d.granted ? 'hist__s hist__s--on' : 'hist__s'}>
                {d.granted ? '已兑现' : '待兑现'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text className='rw__note'>
        奖励清单由爸爸妈妈在「家长中心」设置,也可以自己加新的。
        换到之后记得找爸爸妈妈确认哦。
      </Text>
    </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(Rewards)
