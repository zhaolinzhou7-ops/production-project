/**
 * 成就徽章。
 *
 * 设计取向:
 * - 只奖励**过程**(坚持、尝试、专注),不奖励「比别人强」;
 * - 门槛分布要密,尤其前段 —— 长期看不到反馈,孩子会放弃;
 * - 每一条都能用一句话解释清楚,孩子知道下一步该做什么。
 */
export interface AchievementDef {
  code: string
  name: string
  emoji: string
  /** 怎么才能拿到(直接展示给孩子看) */
  how: string
}

export interface AchievementCtx {
  /** 累计完成的练习组数(含口算) */
  sessions: number
  /** 已掌握的卡片数 */
  mastered: number
  /** 连续学习天数 */
  streak: number
  /** 单组满分次数 */
  perfects: number
  /** 历史最高连对 */
  bestCombo: number
  /** 拥有的贴纸数 */
  stickers: number
  /** 养大过的宠物数 */
  petsGrown: number
  /** 累计口算题数 */
  mathDone: number
  /** 累计完成每日挑战的天数 */
  challengeDays: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first', name: '出发!', emoji: '🚀', how: '完成第一组练习' },
  { code: 'sessions10', name: '小小坚持', emoji: '🧗', how: '累计完成 10 组练习' },
  { code: 'sessions50', name: '很能坚持', emoji: '⛰️', how: '累计完成 50 组练习' },
  { code: 'sessions200', name: '习惯养成', emoji: '🗻', how: '累计完成 200 组练习' },
  { code: 'mastered20', name: '记住 20 个', emoji: '🧠', how: '掌握 20 张卡片' },
  { code: 'mastered100', name: '记住 100 个', emoji: '📚', how: '掌握 100 张卡片' },
  { code: 'mastered500', name: '记住 500 个', emoji: '🏛️', how: '掌握 500 张卡片' },
  { code: 'streak3', name: '连着三天', emoji: '🔥', how: '连续 3 天学习' },
  { code: 'streak7', name: '一整周', emoji: '📅', how: '连续 7 天学习' },
  { code: 'streak30', name: '一整月', emoji: '🗓️', how: '连续 30 天学习' },
  { code: 'perfect1', name: '全对!', emoji: '💯', how: '一组练习全部答对' },
  { code: 'perfect10', name: '稳稳的', emoji: '🎯', how: '累计 10 次全对' },
  { code: 'combo10', name: '十连击', emoji: '⚡', how: '一口气连对 10 题' },
  { code: 'stickers10', name: '收藏家', emoji: '🎴', how: '集到 10 张贴纸' },
  { code: 'stickersAll', name: '全图鉴', emoji: '👑', how: '集齐所有贴纸' },
  { code: 'pet1', name: '好饲养员', emoji: '🐾', how: '把一只宠物养到最终形态' },
  { code: 'math100', name: '心算小能手', emoji: '🧮', how: '累计做 100 道口算' },
  { code: 'challenge7', name: '天天挑战', emoji: '🏅', how: '累计 7 天完成每日挑战' },
]

/** 根据当前统计,算出「应该已经拿到」的成就 code 列表 */
export function earnedCodes(ctx: AchievementCtx, totalStickers: number): string[] {
  const out: string[] = []
  const add = (cond: boolean, code: string) => {
    if (cond) out.push(code)
  }
  add(ctx.sessions >= 1, 'first')
  add(ctx.sessions >= 10, 'sessions10')
  add(ctx.sessions >= 50, 'sessions50')
  add(ctx.sessions >= 200, 'sessions200')
  add(ctx.mastered >= 20, 'mastered20')
  add(ctx.mastered >= 100, 'mastered100')
  add(ctx.mastered >= 500, 'mastered500')
  add(ctx.streak >= 3, 'streak3')
  add(ctx.streak >= 7, 'streak7')
  add(ctx.streak >= 30, 'streak30')
  add(ctx.perfects >= 1, 'perfect1')
  add(ctx.perfects >= 10, 'perfect10')
  add(ctx.bestCombo >= 10, 'combo10')
  add(ctx.stickers >= 10, 'stickers10')
  add(totalStickers > 0 && ctx.stickers >= totalStickers, 'stickersAll')
  add(ctx.petsGrown >= 1, 'pet1')
  add(ctx.mathDone >= 100, 'math100')
  add(ctx.challengeDays >= 7, 'challenge7')
  return out
}

export function getAchievement(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code)
}
