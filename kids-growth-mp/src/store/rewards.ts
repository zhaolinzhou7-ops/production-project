import { readObject, writeObject, flushNow } from './db'
import { todayISO } from '../core/dateUtils'
import { getPoints } from './study'

/**
 * 奖励兑换:成长值终于有地方花。
 *
 * 为什么必须有:积分体系如果没有出口,几周之后数字就失去意义,孩子不再在乎。
 * 有了兑换,积分才和现实生活连起来。
 *
 * 默认奖励刻意以**体验与陪伴**为主,而不是玩具零食 —— 用物质奖励换学习,
 * 长期会削弱孩子本身的兴趣(过度理由效应);而「爸爸陪你玩一小时」这类,
 * 既是奖励也是亲子时间,不会有这个副作用。家长可以自行增删改价。
 *
 * 扣的是「可花的余额」,**不动等级成长值** —— 兑换不该让等级掉下去。
 */
export interface Reward {
  id: string
  name: string
  emoji: string
  cost: number
}

export interface Redemption {
  id: string
  rewardId: string
  name: string
  emoji: string
  cost: number
  date: string
  /** 家长是否已确认发放 */
  granted: boolean
}

const REWARDS_KEY = 'rewards'
const REDEEM_KEY = 'redemptions'
const BALANCE_KEY = 'spent'
const INIT_KEY = 'rewardsInited'

/*
  默认奖励清单。

  ⚠️ v65 补了一整档「小额」奖励,这是原来最要命的一个缺口。

  原来八项全在 60–300 分。一个 4 岁半每天挣十几分,
  意味着**最便宜的那项也要攒四五天** —— 于是积分对他来说永远是
  「在攒,还不能用」。而 4 岁半几乎没有延迟满足能力:
  一个四天后才能兑现的奖励,和没有奖励在心理上是一回事。

  所以补了 10–30 分这一档:今晚就能用掉。
  小额奖励的作用不是「更好的奖品」,是**让积分每天都真的花得出去** ——
  一个能立刻换到东西的分数,才是他愿意去挣的分数。

  另外整份清单刻意以**体验与陪伴**为主,而不是玩具零食:
  用物质奖励换学习,长期会削弱孩子本身的兴趣(过度理由效应);
  而「爸爸陪你玩一小时」这类既是奖励也是亲子时间,没有这个副作用。
  家长可以自行增删改价。
*/
export const DEFAULT_REWARDS: Reward[] = [
  // ---- 小额:今晚就能用掉(4 岁半真正需要的那一档)----
  { id: 'r-story', name: '睡前多讲一个故事', emoji: '📖', cost: 10 },
  { id: 'r-hug', name: '换一次「超级大抱抱」', emoji: '🤗', cost: 10 },
  { id: 'r-song', name: '点一首歌全家一起唱', emoji: '🎵', cost: 15 },
  { id: 'r-clothes', name: '自己挑明天穿什么', emoji: '👕', cost: 15 },
  { id: 'r-teacher', name: '当一次小老师,考考爸爸妈妈', emoji: '🧑‍🏫', cost: 20 },
  { id: 'r-fruit', name: '自己挑今天的水果', emoji: '🍓', cost: 20 },
  { id: 'r-piggyback', name: '骑一次马马(爸爸背)', emoji: '🐴', cost: 25 },
  { id: 'r-flashlight', name: '关灯玩十分钟手电筒', emoji: '🔦', cost: 25 },
  { id: 'r-callgrandma', name: '给爷爷奶奶打个视频', emoji: '📞', cost: 30 },
  { id: 'r-boss', name: '当一天「家庭小队长」', emoji: '🎖️', cost: 30 },

  // ---- 中额:攒两三天 ----
  { id: 'r-cartoon', name: '多看 30 分钟动画片', emoji: '📺', cost: 60 },
  { id: 'r-menu', name: '点一次晚餐菜单', emoji: '🍜', cost: 70 },
  { id: 'r-play', name: '爸爸妈妈陪玩一小时', emoji: '🤹', cost: 80 },
  { id: 'r-bake', name: '一起做一次点心', emoji: '🧁', cost: 85 },
  { id: 'r-latesleep', name: '周末晚睡 30 分钟', emoji: '🌙', cost: 90 },
  { id: 'r-tent', name: '在客厅搭一晚帐篷', emoji: '⛺', cost: 95 },
  { id: 'r-park', name: '周末去一次公园', emoji: '🌳', cost: 100 },

  // ---- 大额:一两周的目标 ----
  { id: 'r-book', name: '挑一本新绘本', emoji: '📚', cost: 120 },
  { id: 'r-movie', name: '家庭电影之夜(他选片)', emoji: '🍿', cost: 130 },
  { id: 'r-friend', name: '请小朋友来家里玩', emoji: '🧑‍🤝‍🧑', cost: 150 },
  { id: 'r-museum', name: '去一次博物馆/动物园', emoji: '🦕', cost: 200 },
  { id: 'r-trip', name: '一次短途出游', emoji: '🚗', cost: 300 },
]

export function ensureRewards(): Reward[] {
  const cur = readObject<Reward[]>(REWARDS_KEY, [])
  if (cur.length > 0 || readObject<boolean>(INIT_KEY, false)) return cur
  writeObject(REWARDS_KEY, DEFAULT_REWARDS)
  writeObject(INIT_KEY, true)
  return DEFAULT_REWARDS
}

export function listRewards(): Reward[] {
  return readObject<Reward[]>(REWARDS_KEY, [])
}

export function addReward(name: string, cost: number, emoji = '🎁'): void {
  const clean = name.trim()
  if (!clean) return
  writeObject(REWARDS_KEY, [
    ...listRewards(),
    { id: `r-${Date.now().toString(36)}`, name: clean, emoji, cost: Math.max(1, cost) },
  ])
}

export function removeReward(id: string): void {
  writeObject(
    REWARDS_KEY,
    listRewards().filter((r) => r.id !== id),
  )
}

export function setRewardCost(id: string, cost: number): void {
  writeObject(
    REWARDS_KEY,
    listRewards().map((r) => (r.id === id ? { ...r, cost: Math.max(1, cost) } : r)),
  )
}

// ---------------------------------------------------------------- 兑换

/** 已经花掉的分 */
function spent(): number {
  return readObject<number>(BALANCE_KEY, 0)
}

/** 还能花多少分 = 累计获得 − 已花掉 */
export function spendable(): number {
  return Math.max(0, getPoints().balance - spent())
}

export function listRedemptions(): Redemption[] {
  return readObject<Redemption[]>(REDEEM_KEY, [])
}

export type RedeemResult = 'ok' | 'notEnough' | 'missing'

export function redeem(rewardId: string): RedeemResult {
  const r = listRewards().find((x) => x.id === rewardId)
  if (!r) return 'missing'
  if (spendable() < r.cost) return 'notEnough'
  writeObject(BALANCE_KEY, spent() + r.cost)
  writeObject(REDEEM_KEY, [
    {
      id: `d-${Date.now().toString(36)}`,
      rewardId: r.id,
      name: r.name,
      emoji: r.emoji,
      cost: r.cost,
      date: todayISO(),
      granted: false,
    },
    ...listRedemptions(),
  ])
  // 兑换是「花掉真金白银」的操作,立刻落盘,不能因为退出丢掉
  flushNow()
  return 'ok'
}

/** 家长确认已经兑现 */
export function grantRedemption(id: string): void {
  writeObject(
    REDEEM_KEY,
    listRedemptions().map((d) => (d.id === id ? { ...d, granted: true } : d)),
  )
}

/** 撤销一次兑换(误点时用),把分退回去 */
export function cancelRedemption(id: string): void {
  const list = listRedemptions()
  const hit = list.find((d) => d.id === id)
  if (!hit || hit.granted) return
  writeObject(BALANCE_KEY, Math.max(0, spent() - hit.cost))
  writeObject(
    REDEEM_KEY,
    list.filter((d) => d.id !== id),
  )
}

export function pendingCount(): number {
  return listRedemptions().filter((d) => !d.granted).length
}
