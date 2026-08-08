/**
 * 每日评分卡。
 *
 * 打分这件事对 4 岁半的孩子风险很高,所以先把原则写死:
 *
 * 1. **主要看「做了没有」,不主要看「对了多少」。**
 *    这个年纪正确率低,绝大多数时候说明题出难了 —— 那是系统的问题,
 *    不是孩子的问题。拿正确率当主分,等于因为我出题不当而扣他的分。
 * 2. **和昨天的自己比,不和满分比。** 分数的用处是让他看见「我在往前走」,
 *    不是给他一个够不着的标准。
 * 3. **没有不及格。** 最低一档叫「今天开了个头」,不叫「差」。
 *    一个 4 岁半的孩子如果从这套系统里学会的第一件事是「我不行」,
 *    那前面做的所有内容都白搭。
 *
 * 家长看到的是另一层:分项完成度 + 一句实话实说的点评,
 * 用来判断该调整什么,而不是用来评判孩子。
 */

export interface AreaInput {
  key: string
  label: string
  emoji: string
  /** 今天做了多少(题数 / 条数) */
  done: number
  /** 今天的目标 */
  target: number
  /** 答对多少(没有就传 undefined,比如习惯打卡) */
  correct?: number
}

export interface AreaScore extends AreaInput {
  /** 完成度 0–100(可以超过 100,说明超额完成) */
  pct: number
  /** 正确率 0–100;没有作答概念时为 -1 */
  rate: number
}

export interface DailyCard {
  areas: AreaScore[]
  /** 综合分 0–100 */
  score: number
  /** 星级 1–5(至少 1 颗 —— 打开了就有一颗) */
  stars: number
  /** 给孩子看的一句话 */
  cheer: string
  /** 给家长看的一句话:实话实说,包括「这组题可能出难了」 */
  note: string
  /** 和昨天比:1 进步 / 0 持平 / -1 退了一点 */
  trend: number
}

/** 完成度占大头,正确率只占小头 —— 理由见文件头 */
const W_DONE = 0.75
const W_RATE = 0.25

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function scoreAreas(inputs: AreaInput[]): AreaScore[] {
  return inputs.map((a) => ({
    ...a,
    pct: a.target > 0 ? Math.round((a.done / a.target) * 100) : a.done > 0 ? 100 : 0,
    rate: typeof a.correct === 'number' && a.done > 0 ? Math.round((a.correct / a.done) * 100) : -1,
  }))
}

export function buildDailyCard(inputs: AreaInput[], yesterdayScore = -1): DailyCard {
  const areas = scoreAreas(inputs)
  const active = areas.filter((a) => a.target > 0)

  // 完成度:各板块的完成度取平均,单项封顶 100(超额不该把没做的板块盖过去)
  const doneAvg =
    active.length > 0
      ? active.reduce((n, a) => n + clamp(a.pct, 0, 100), 0) / active.length
      : 0

  // 正确率:只统计真的有作答的板块
  const rated = areas.filter((a) => a.rate >= 0 && a.done > 0)
  const rateAvg = rated.length > 0 ? rated.reduce((n, a) => n + a.rate, 0) / rated.length : 100

  const anythingDone = areas.some((a) => a.done > 0)
  const score = anythingDone ? Math.round(doneAvg * W_DONE + rateAvg * W_RATE) : 0

  // 至少一颗星 —— 只要今天打开过、做过一点
  const stars = !anythingDone ? 0 : clamp(Math.ceil(score / 20), 1, 5)

  const trend = yesterdayScore < 0 ? 0 : score > yesterdayScore + 4 ? 1 : score < yesterdayScore - 4 ? -1 : 0

  return {
    areas,
    score,
    stars,
    cheer: cheerFor(stars, trend, anythingDone),
    note: noteFor(areas, rateAvg, anythingDone),
    trend,
  }
}

/** 给孩子的话:只说做到的,不说没做到的 */
function cheerFor(stars: number, trend: number, anythingDone: boolean): string {
  if (!anythingDone) return '今天还没开始,来做一点吧'
  if (trend > 0) return '比昨天更棒了!'
  if (stars >= 5) return '今天全部做完啦,厉害!'
  if (stars >= 4) return '今天做得很好!'
  if (stars >= 3) return '今天做得不错!'
  if (stars >= 2) return '今天有认真做,很好'
  return '今天开了个头,已经很好啦'
}

/**
 * 给家长的话。
 * 这里可以说实话,包括承认「题可能出难了」—— 家长需要的是能据此调整的信息,
 * 不是一句好听的评价。
 */
function noteFor(areas: AreaScore[], rateAvg: number, anythingDone: boolean): string {
  if (!anythingDone) return '今天还没有学习记录。'
  const missed = areas.filter((a) => a.target > 0 && a.done === 0)
  const low = areas.filter((a) => a.rate >= 0 && a.rate < 55 && a.done >= 4)
  const parts: string[] = []
  if (low.length > 0) {
    parts.push(
      `${low.map((a) => a.label).join('、')}正确率偏低(${low
        .map((a) => a.rate)
        .join('/')}%)——这个年纪多半是题出难了,可以在口算里把难度调低一档`,
    )
  }
  if (missed.length > 0) parts.push(`今天没碰${missed.map((a) => a.label).join('、')}`)
  if (parts.length === 0) {
    parts.push(rateAvg >= 85 ? '完成得很稳,可以考虑加一点点难度' : '节奏正常,保持就好')
  }
  return parts.join(';') + '。'
}

/** 一组练习做完时的星级与评语(和每日卡分开 —— 那个是一天的,这个是一组的) */
export function rateSession(correct: number, total: number): { stars: number; msg: string } {
  if (total <= 0) return { stars: 0, msg: '' }
  const pct = (correct / total) * 100
  if (pct >= 95) return { stars: 3, msg: '几乎全对,太厉害了!' }
  if (pct >= 80) return { stars: 3, msg: '做得很好!' }
  if (pct >= 60) return { stars: 2, msg: '不错,错的那几个下次就记住了' }
  if (pct >= 35) return { stars: 1, msg: '这组有点难,已经很努力了' }
  return { stars: 1, msg: '这组太难啦,不是你的问题 —— 我们换简单一点的' }
}
