import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  mathKindsForTier,
  mathGroupsForTier,
  defaultTierFor,
  tierOfKind,
  MATH_TIERS,
  type MathKind,
  type MathTier,
} from '../../core/mathDrill'
import { getStage } from '../../store/study'
import { readObject, writeObject } from '../../store/db'
import { withGuard } from '../../components/Guard'
import './index.scss'

const COUNTS = [10, 20, 30]

function MathPage() {
  /*
    难度档:优先用上次选的,没有才按学段猜。

    这里踩过一个真实的坑 —— 学段存在本地存储里,清一次数据就退回默认的「小学」,
    于是孩子第二天打开,口算从「10 以内加法」变成了两位数乘除。他不会去想
    「是不是哪个设置被重置了」,只会觉得「我不会做了」。所以难度必须
    ①页面上看得见 ②自己记得住 ③随手能换。
  */
  const [tier, setTierState] = useState<MathTier>(
    () => readObject<MathTier>('mathTier', '' as MathTier) || defaultTierFor(getStage()),
  )
  const [kind, setKind] = useState<MathKind>(() => {
    const saved = readObject<MathKind>('mathKind', '' as MathKind)
    const t = readObject<MathTier>('mathTier', '' as MathTier) || defaultTierFor(getStage())
    if (saved && tierOfKind(saved) === t) return saved
    return mathKindsForTier(t)[0].kind
  })

  const chooseTier = (t: MathTier) => {
    setTierState(t)
    writeObject('mathTier', t)
    const first = mathKindsForTier(t)[0].kind
    setKind(first)
    writeObject('mathKind', first)
    // 换了难度档,原来选的那一组不一定还在,清掉免得出到别档的题
    setGroupKinds([])
    setOpenGroup('')
  }

  const chooseKind = (k: MathKind) => {
    setKind(k)
    writeObject('mathKind', k)
  }

  /** 展开的是哪一组(空串=都收着)—— 默认全收起,屏幕上先只剩五六行 */
  const [openGroup, setOpenGroup] = useState('')
  /**
   * 选了「整组随便来」时,这里放这一组的全部题型;
   * 选单个题型时清空。两者互斥,免得家长弄不清现在到底会出什么题。
   */
  const [groupKinds, setGroupKinds] = useState<MathKind[]>([])
  const [count, setCount] = useState(20)

  /**
   * 开始做题 —— 跳到**单独的做题页**。
   *
   * 拆成两页是为了让微信顶部那个系统返回箭头行为正确:
   * 它一定是 navigateBack,页面内部拦不住。做题单独一页之后,
   * 返回天然退回这一页(选题),而不是一步跳回首页。
   */
  const start = () => {
    /*
      范围要按**选中的难度档**算,不能按学段算。

      这里原先传的是 getStage() —— 于是家长明明切到了「小学档」,
      加法题却还是 10 以内(因为孩子的学段是幼儿园)。选了更难的一档
      却拿到同样简单的题,那个开关等于是假的。
    */
    const rangeStage = tier === 'toddler' ? 'toddler' : 'primary'
    const list = groupKinds.length > 0 ? groupKinds : [kind]
    Taro.navigateTo({
      url: `/pages/math/run/index?kinds=${list.join(',')}&count=${count}&stage=${rangeStage}`,
    })
  }

  return (
      <View className='math'>
        {/* 选题页是口算的「家」,所以这里给一个明确的回首页出口 */}
        <Text className='math__back' onClick={() => Taro.navigateBack()}>‹ 返回首页</Text>
        <Text className='math__h'>难度</Text>
        <View className='tiers'>
          {MATH_TIERS.map((t) => (
            <View
              key={t.tier}
              className={tier === t.tier ? 'tier tier--on' : 'tier'}
              onClick={() => chooseTier(t.tier)}
            >
              <Text className='tier__lab'>{t.label}</Text>
              <Text className='tier__desc'>{t.desc}</Text>
            </View>
          ))}
        </View>
        {/*
          题型**按组收起来**。

          光幼儿档就有 20 个题型,平铺出来是一面「题型墙」。家长每天晚上要在
          这面墙里挑一个 —— 挑不动,最后固定点同一个,后面十几个等于不存在。
          现在默认只看到五六个组,点开才展开;而且每组有「随便来」——
          他不必先想「今天练 10 以内加法还是凑十」,那个念头正是最容易卡住的地方。
        */}
        <Text className='math__h'>练什么</Text>
        {mathGroupsForTier(tier).map((g) => {
          const open = openGroup === g.def.group
          const picked = g.kinds.some((k) => k.kind === kind)
          return (
            <View key={g.def.group} className={picked ? 'grp grp--on' : 'grp'}>
              <View className='grp__hd' onClick={() => setOpenGroup(open ? '' : g.def.group)}>
                <Text className='grp__icon'>{g.def.icon}</Text>
                <View className='grp__meta'>
                  <Text className='grp__lab'>{g.def.label}</Text>
                  <Text className='grp__desc'>{g.def.desc}</Text>
                </View>
                <Text className='grp__arrow'>{open ? '▾' : '▸'}</Text>
              </View>
              <View
                className='grp__all'
                onClick={() => {
                  setGroupKinds(g.kinds.map((k) => k.kind))
                  setKind(g.kinds[0].kind)
                }}
              >
                <Text className='grp__allt'>
                  {groupKinds.length > 0 && groupKinds[0] === g.kinds[0].kind ? '✓ 整组随便来' : '整组随便来'}
                </Text>
              </View>
              {open ? (
                <View className='kinds'>
                  {g.kinds.map((k) => (
                    <View
                      key={k.kind}
                      className={kind === k.kind && groupKinds.length === 0 ? 'kind kind--on' : 'kind'}
                      onClick={() => {
                        setGroupKinds([])
                        chooseKind(k.kind)
                      }}
                    >
                      <Text className='kind__icon'>{k.icon}</Text>
                      <Text className='kind__lab'>{k.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
        <Text className='math__h'>题目数量</Text>
        <View className='counts'>
          {COUNTS.map((c) => (
            <View key={c} className={count === c ? 'cnt cnt--on' : 'cnt'} onClick={() => setCount(c)}>
              <Text className='cnt__t'>{c} 题</Text>
            </View>
          ))}
        </View>
        <View className='btn btn--primary btn--wide' onClick={start}>
          <Text className='btn__t'>▶ 开始练习</Text>
        </View>
      </View>
  )
}

// 包一层错误边界:页面万一崩了,屏幕上给出原因而不是一片空白
export default withGuard(MathPage)
