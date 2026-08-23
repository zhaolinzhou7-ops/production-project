import type { AgeStage } from '../types'

/**
 * 每天能拿到的成长值上限。
 *
 * 为什么必须有:现在每答对一题都给分,而「再练一遍」可以无限次重来 ——
 * 也就是说,只要一直点同一组题,分数可以刷到任意高。
 *
 * 这件事的坏处不是「作弊」,是**把整套激励系统废掉**:
 * 等级、贴纸、宠物、奖励兑换全部挂在成长值上。一旦孩子发现分可以刷,
 * 「练一组题得 20 分」这件事就不再有分量,而后面所有的鼓励也就一起失效了。
 * 到那时再想修,他已经是 Lv.12 了,没有回头路。
 *
 * 上限按学段给:定得比「认真学一天」高一截,正常用**永远碰不到**;
 * 只有反复刷同一组题才会撞上。撞上之后不扣分、不报错,
 * 只是当天不再加分 —— 惩罚孩子从来不是目的。
 */
export function dailyPointCap(stage: AgeStage): number {
  if (stage === 'toddler') return 120
  if (stage === 'primary') return 240
  return 360
}

/**
 * 这一次实际能加多少分。
 *
 * 扣分(delta < 0)不受限制 —— 取消打卡要能扣回去,否则反复勾选照样能刷分。
 */
export function allowedAward(delta: number, earnedToday: number, cap: number): number {
  if (delta <= 0) return delta
  const room = Math.max(0, cap - Math.max(0, earnedToday))
  return Math.min(delta, room)
}
