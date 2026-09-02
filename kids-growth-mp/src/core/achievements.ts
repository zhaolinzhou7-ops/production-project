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
  /** 集齐了几本贴纸主题册(见 core/stickers) */
  books?: number
  /**
   * 每个内容包的掌握率 0–1(见 store/study 的 packProgress)。
   *
   * ⚠️ v65 新增,补的是这套成就里最大的一个洞:
   * 原来 18 枚徽章**全是累计数** —— 练了多少组、记住多少张、连对多少题。
   * 孩子拿到「记住 100 个」和他今天学会 goat 之间没有任何联系,
   * 徽章因此只是计数器的皮肤,不指向他真正学的东西。
   *
   * 现在按内容给徽章:动物包练熟了就是「动物专家」。
   * 这一枚他看得懂 —— 他知道自己是**因为把动物学会了**才拿到的。
   */
  packMastery?: Record<string, number>
}

/**
 * 内容徽章:这一包练熟到什么程度算「专家」。
 *
 * 0.8 而不是 1.0 —— 一个包三四十张卡,要求全部进入长期记忆,
 * 意味着这枚徽章几乎永远拿不到。够得着的目标才是目标。
 */
export const PACK_BADGE_THRESHOLD = 0.8

/** 哪几个内容包配徽章 —— 只给幼儿每天真的在练的那几包,不是每包都发 */
export const PACK_BADGES: Array<{ code: string; packKey: string; name: string; emoji: string }> = [
  { code: 'packAnimals', packKey: 'enlight-animals', name: '动物专家', emoji: '🐾' },
  { code: 'packFood', packKey: 'enlight-food', name: '美食家', emoji: '🍎' },
  { code: 'packColors', packKey: 'enlight-colors', name: '颜色大师', emoji: '🎨' },
  { code: 'packNumbers', packKey: 'enlight-numbers', name: '数字通', emoji: '🔢' },
  { code: 'packBody', packKey: 'enlight-body', name: '身体小博士', emoji: '🙋' },
  { code: 'packFamily', packKey: 'enlight-family', name: '家人都会说', emoji: '👨‍👩‍👦' },
  { code: 'packActions', packKey: 'enlight-actions', name: '动词小能手', emoji: '🏃' },
  { code: 'packAbc', packKey: 'enlight-abc', name: '字母全会了', emoji: '🔤' },
  { code: 'packPhonics', packKey: 'phonics-cvc', name: '会自己拼了', emoji: '🧩' },
]

/*
  ---- v65:把中段的空白填上 ----

  原来 18 枚徽章的门槛是 10 → 50 → 200 组、20 → 100 → 500 张。
  对一个每天 15 分钟、一天大概两三组的孩子来说,
  从 50 到 200 组要走三四个月 —— **中间几个月一枚都拿不到**。
  而这个年纪需要的恰恰是密集的、够得着的反馈。

  所以在每一档中间补上一级。补的是密度,不是难度:
  最高档没有变,只是去那里的路上不再一片空白。
*/
export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first', name: '出发!', emoji: '🚀', how: '完成第一组练习' },
  /*
    第 1 组之后紧接着给两级。

    自测的密度关卡抓到过这里:原来 1 → 10 组中间隔了四五天,
    而**第一周恰恰是他决定这件事好不好玩的那一周** ——
    前几天没有任何反馈,后面所有的长期目标都无从谈起。
  */
  { code: 'sessions3', name: '开了个头', emoji: '👣', how: '累计完成 3 组练习' },
  { code: 'sessions5', name: '第五组啦', emoji: '🥾', how: '累计完成 5 组练习' },
  { code: 'sessions10', name: '小小坚持', emoji: '🧗', how: '累计完成 10 组练习' },
  { code: 'sessions25', name: '越来越熟', emoji: '🚶', how: '累计完成 25 组练习' },
  { code: 'sessions50', name: '很能坚持', emoji: '⛰️', how: '累计完成 50 组练习' },
  { code: 'sessions100', name: '一百组啦', emoji: '🏔️', how: '累计完成 100 组练习' },
  { code: 'sessions200', name: '习惯养成', emoji: '🗻', how: '累计完成 200 组练习' },
  { code: 'mastered20', name: '记住 20 个', emoji: '🧠', how: '掌握 20 张卡片' },
  { code: 'mastered50', name: '记住 50 个', emoji: '💡', how: '掌握 50 张卡片' },
  { code: 'mastered100', name: '记住 100 个', emoji: '📚', how: '掌握 100 张卡片' },
  { code: 'mastered250', name: '记住 250 个', emoji: '📖', how: '掌握 250 张卡片' },
  { code: 'mastered500', name: '记住 500 个', emoji: '🏛️', how: '掌握 500 张卡片' },
  { code: 'streak3', name: '连着三天', emoji: '🔥', how: '连续 3 天学习' },
  { code: 'streak7', name: '一整周', emoji: '📅', how: '连续 7 天学习' },
  { code: 'streak14', name: '两周不断', emoji: '📆', how: '连续 14 天学习' },
  { code: 'streak30', name: '一整月', emoji: '🗓️', how: '连续 30 天学习' },
  { code: 'streak100', name: '一百天', emoji: '💎', how: '连续 100 天学习' },
  { code: 'perfect1', name: '全对!', emoji: '💯', how: '一组练习全部答对' },
  { code: 'perfect3', name: '又全对了', emoji: '✨', how: '累计 3 次全对' },
  { code: 'perfect10', name: '稳稳的', emoji: '🎯', how: '累计 10 次全对' },
  { code: 'perfect25', name: '很少出错', emoji: '🎖️', how: '累计 25 次全对' },
  { code: 'combo5', name: '五连击', emoji: '🌟', how: '一口气连对 5 题' },
  { code: 'combo10', name: '十连击', emoji: '⚡', how: '一口气连对 10 题' },
  { code: 'combo20', name: '二十连击', emoji: '🔆', how: '一口气连对 20 题' },
  { code: 'stickers10', name: '收藏家', emoji: '🎴', how: '集到 10 张贴纸' },
  { code: 'stickers30', name: '大收藏家', emoji: '🗂️', how: '集到 30 张贴纸' },
  { code: 'stickersAll', name: '全图鉴', emoji: '👑', how: '集齐所有贴纸' },
  { code: 'pet1', name: '好饲养员', emoji: '🐾', how: '把一只宠物养到最终形态' },
  { code: 'pet3', name: '动物园园长', emoji: '🏞️', how: '养大 3 只宠物' },
  { code: 'math100', name: '心算小能手', emoji: '🧮', how: '累计做 100 道口算' },
  { code: 'math500', name: '心算高手', emoji: '➗', how: '累计做 500 道口算' },
  { code: 'challenge3', name: '挑战三天', emoji: '🎲', how: '累计 3 天完成每日挑战' },
  { code: 'challenge7', name: '天天挑战', emoji: '🏅', how: '累计 7 天完成每日挑战' },
  { code: 'challenge30', name: '挑战一个月', emoji: '🎗️', how: '累计 30 天完成每日挑战' },

  /*
    ---- 集齐一本贴纸册 ----
    这是一个**中等长度**的目标:一本 6 张,大概一两周能集完。
    原来的成就要么三天就拿到(第一组、第一次全对),
    要么要几个月(200 组、500 张),中间正好缺这一档。
  */
  { code: 'book1', name: '集完一本', emoji: '📗', how: '集齐一本主题贴纸册' },
  { code: 'book3', name: '集完三本', emoji: '📙', how: '集齐 3 本主题贴纸册' },
  { code: 'bookAll', name: '全套集齐', emoji: '📚', how: '集齐全部主题贴纸册' },

  /*
    ---- 内容徽章 ----
    补的是这套成就最大的一个洞:原来全是累计数,一枚都不指向他学的东西。
    「动物专家」他看得懂 —— 他知道自己是因为把动物学会了才拿到的。
  */
  ...PACK_BADGES.map((b) => ({
    code: b.code,
    name: b.name,
    emoji: b.emoji,
    how: `把「${b.name.replace(/专家|大师|小博士|小能手|家$/, '')}」那一包练熟(${Math.round(
      PACK_BADGE_THRESHOLD * 100,
    )}%)`,
  })),
]

/** 根据当前统计,算出「应该已经拿到」的成就 code 列表 */
export function earnedCodes(
  ctx: AchievementCtx,
  totalStickers: number,
  totalBooks = 0,
): string[] {
  const out: string[] = []
  const add = (cond: boolean, code: string) => {
    if (cond) out.push(code)
  }
  add(ctx.sessions >= 1, 'first')
  add(ctx.sessions >= 3, 'sessions3')
  add(ctx.sessions >= 5, 'sessions5')
  add(ctx.sessions >= 10, 'sessions10')
  add(ctx.sessions >= 25, 'sessions25')
  add(ctx.sessions >= 50, 'sessions50')
  add(ctx.sessions >= 100, 'sessions100')
  add(ctx.sessions >= 200, 'sessions200')
  add(ctx.mastered >= 20, 'mastered20')
  add(ctx.mastered >= 50, 'mastered50')
  add(ctx.mastered >= 100, 'mastered100')
  add(ctx.mastered >= 250, 'mastered250')
  add(ctx.mastered >= 500, 'mastered500')
  add(ctx.streak >= 3, 'streak3')
  add(ctx.streak >= 7, 'streak7')
  add(ctx.streak >= 14, 'streak14')
  add(ctx.streak >= 30, 'streak30')
  add(ctx.streak >= 100, 'streak100')
  add(ctx.perfects >= 1, 'perfect1')
  add(ctx.perfects >= 3, 'perfect3')
  add(ctx.perfects >= 10, 'perfect10')
  add(ctx.perfects >= 25, 'perfect25')
  add(ctx.bestCombo >= 5, 'combo5')
  add(ctx.bestCombo >= 10, 'combo10')
  add(ctx.bestCombo >= 20, 'combo20')
  add(ctx.stickers >= 10, 'stickers10')
  add(ctx.stickers >= 30, 'stickers30')
  add(totalStickers > 0 && ctx.stickers >= totalStickers, 'stickersAll')
  add(ctx.petsGrown >= 1, 'pet1')
  add(ctx.petsGrown >= 3, 'pet3')
  add(ctx.mathDone >= 100, 'math100')
  add(ctx.mathDone >= 500, 'math500')
  add(ctx.challengeDays >= 3, 'challenge3')
  add(ctx.challengeDays >= 7, 'challenge7')
  add(ctx.challengeDays >= 30, 'challenge30')

  const books = ctx.books ?? 0
  add(books >= 1, 'book1')
  add(books >= 3, 'book3')
  add(totalBooks > 0 && books >= totalBooks, 'bookAll')

  // 内容徽章:这一包练熟了才给
  const pm = ctx.packMastery ?? {}
  for (const b of PACK_BADGES) {
    add((pm[b.packKey] ?? 0) >= PACK_BADGE_THRESHOLD, b.code)
  }
  return out
}

export function getAchievement(code: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.code === code)
}
