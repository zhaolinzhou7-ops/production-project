import type { AgeStage } from '../types'

/**
 * 屏幕时间。
 *
 * 原先是所有年龄一刀切 30 分钟,而且只有一档提醒。两个问题:
 *
 * 1. **4 岁半和 10 岁不该是同一个数。** 学龄前儿童的持续专注力大约
 *    10–15 分钟,国内近视防控指引也建议学龄前单次视屏不超过 15 分钟。
 *    30 分钟对一个 4 岁半的孩子已经太久了 —— 而这套系统是他每天都要用的。
 * 2. **只有一档等于没有。** 一句「学了 30 分钟啦」他看不懂,家长也容易忽略。
 *    分成两档:先温和提醒(抬头看看远处),再明确建议今天到此为止。
 *
 * 这里只给建议、**不强制断掉** —— 家长比程序更清楚现在该不该停;
 * 一个会突然锁死的学习工具,家长下次就不敢在他面前打开了。
 */

export type ScreenLevel = 'ok' | 'soft' | 'hard'

export interface ScreenAdvice {
  level: ScreenLevel
  /** 给家长和孩子看的一句话;level 为 'ok' 时是空串 */
  msg: string
  /** 这一档的分钟门槛,界面上可以显示「还剩几分钟」 */
  softAt: number
  hardAt: number
}

interface Limits {
  soft: number
  hard: number
}

/**
 * 分龄门槛(分钟)。
 * 幼儿档定得比常见的「30 分钟」低不少 —— 那个数字来自娱乐视频的建议,
 * 而近距离盯着小屏幕做题对眼睛的负担更大。
 */
function limitsFor(stage: AgeStage): Limits {
  if (stage === 'toddler') return { soft: 15, hard: 25 }
  if (stage === 'primary') return { soft: 25, hard: 40 }
  return { soft: 40, hard: 60 }
}

/**
 * `hardOverride` 是**家长在家长中心里设过的每日分钟上限**。
 *
 * 设过就以他的为准 —— 程序不该悄悄推翻家长明确设过的值,
 * 那会让「我明明设了 40 分钟」变成一个查不出原因的怪现象。
 * 温和提醒那一档按它的六成算,保证两档之间总有间隔。
 */
export function screenAdvice(minutes: number, stage: AgeStage, hardOverride?: number): ScreenAdvice {
  const base = limitsFor(stage)
  const hard =
    typeof hardOverride === 'number' && hardOverride > 0 ? Math.round(hardOverride) : base.hard
  const soft = Math.max(5, Math.min(base.soft, Math.round(hard * 0.6)))
  const m = Math.max(0, Math.floor(minutes))
  if (m >= hard) {
    return {
      level: 'hard',
      msg: `今天已经学了 ${m} 分钟,够啦 —— 剩下的明天再来,眼睛要紧 🌙`,
      softAt: soft,
      hardAt: hard,
    }
  }
  if (m >= soft) {
    return {
      level: 'soft',
      msg: `学了 ${m} 分钟啦,抬头看看窗外、远处的东西,休息一下再继续 👀`,
      softAt: soft,
      hardAt: hard,
    }
  }
  return { level: 'ok', msg: '', softAt: soft, hardAt: hard }
}
