/**
 * 学习足迹。
 *
 * 现在能看到「掌握了 23 个词」,但看不到**他是什么时候会的**。
 * 三年后回头看,这条时间轴比任何分数都珍贵 —— 而数据其实早就在了,
 * 只是从来没有画出来过。
 *
 * 只记「第一次」和「整数关口」两类事件。全都记等于没记 ——
 * 一屏流水账,家长翻两次就不看了。
 */

export interface Milestone {
  date: string
  emoji: string
  title: string
  /** 排序用:同一天里数值大的排后面 */
  rank: number
}

export interface TimelineInput {
  /** 每天的学习记录:做了多少题、对了多少 */
  days: Array<{ date: string; answered: number; correct: number }>
  /** 掌握数量随时间的快照:{date, mastered} —— 按日期升序 */
  masteredByDate: Array<{ date: string; mastered: number }>
  /** 连续学习天数达到过的最大值,以及达成日期 */
  streaks: Array<{ date: string; days: number }>
}

/** 值得记一笔的词汇量关口 */
const WORD_MARKS = [1, 10, 25, 50, 100, 200, 300, 500, 800, 1000, 1500, 2000]
/** 值得记一笔的坚持天数 */
const STREAK_MARKS = [3, 7, 14, 30, 60, 100, 200, 365]

export function buildTimeline(input: TimelineInput): Milestone[] {
  const out: Milestone[] = []

  // 第一次学习
  const firstDay = [...input.days].sort((a, b) => a.date.localeCompare(b.date))[0]
  if (firstDay) {
    out.push({ date: firstDay.date, emoji: '🌱', title: '第一次打开,开始学习', rank: 0 })
  }

  // 词汇量关口:只在**第一次越过**那天记一笔
  let passed = 0
  for (const snap of [...input.masteredByDate].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const m of WORD_MARKS) {
      if (m > passed && snap.mastered >= m) {
        passed = m
        out.push({
          date: snap.date,
          emoji: m >= 500 ? '🏆' : m >= 100 ? '🎖️' : '⭐',
          title: m === 1 ? '掌握了第一个内容' : `掌握量达到 ${m}`,
          rank: m,
        })
      }
    }
  }

  // 坚持天数
  let bestStreak = 0
  for (const s of [...input.streaks].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const m of STREAK_MARKS) {
      if (m > bestStreak && s.days >= m) {
        bestStreak = m
        out.push({ date: s.date, emoji: '🔥', title: `连续学习 ${m} 天`, rank: m })
      }
    }
  }

  // 第一次全对(一天里做了 5 题以上且全对)
  const perfect = [...input.days]
    .filter((d) => d.answered >= 5 && d.answered === d.correct)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (perfect) {
    out.push({ date: perfect.date, emoji: '💯', title: '第一次一整天一道没错', rank: 1 })
  }

  out.sort((a, b) => (a.date === b.date ? a.rank - b.rank : a.date.localeCompare(b.date)))
  return out
}
