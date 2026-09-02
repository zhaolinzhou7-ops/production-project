/**
 * 贴纸收藏册。
 *
 * ⚠️ v65 的一次结构性重做 —— 不是「多加几张」那么简单。
 *
 * 原来是 48 张互不相干的 emoji,随机掉落,唯一目标是集齐。
 * 问题在于:**孩子没法追求任何一张具体的贴纸**。
 * 「还差 12 张」是一个抽象数字,他不知道差的是哪 12 张,
 * 也就没有「就差一张了」的那种劲头 —— 而那股劲头正是收集类奖励
 * 全部的心理动力所在。集卡册之所以让人上瘾,靠的从来不是总数,
 * 是那一页上空着的最后一格。
 *
 * 所以现在分成 10 本主题册,每本 6 张:
 * · 目标变具体了 ——「太空册就差彗星了」
 * · 掉落会**偏向快集齐的那一册**(见 rollSticker),让册子真的能被集完
 * · 集齐一册给一枚专属徽章(见 core/achievements),是一个中等长度的目标 ——
 *   原来的成就要么三天就拿到,要么要几个月,中间是长长的空白
 *
 * 顺带补了 12 张新贴纸,把每一册凑成整 6 张。
 */

export interface StickerDef {
  key: string
  emoji: string
  name: string
}

export const STICKER_CATALOG: StickerDef[] = [
  { key: 'panda', emoji: '🐼', name: '熊猫滚滚' },
  { key: 'tiger', emoji: '🐯', name: '小老虎' },
  { key: 'rabbit', emoji: '🐰', name: '兔兔' },
  { key: 'fox', emoji: '🦊', name: '小狐狸' },
  { key: 'lion', emoji: '🦁', name: '狮子王' },
  { key: 'koala', emoji: '🐨', name: '考拉' },
  { key: 'penguin', emoji: '🐧', name: '企鹅' },
  { key: 'owl', emoji: '🦉', name: '猫头鹰博士' },
  { key: 'unicorn', emoji: '🦄', name: '独角兽' },
  { key: 'dragon', emoji: '🐉', name: '神龙' },
  { key: 'whale', emoji: '🐳', name: '喷水鲸' },
  { key: 'dolphin', emoji: '🐬', name: '海豚' },
  { key: 'octopus', emoji: '🐙', name: '章鱼哥' },
  { key: 'butterfly', emoji: '🦋', name: '蝴蝶' },
  { key: 'bee', emoji: '🐝', name: '勤劳小蜜蜂' },
  { key: 'ladybug', emoji: '🐞', name: '七星瓢虫' },
  { key: 'dino', emoji: '🦕', name: '小恐龙' },
  { key: 'trex', emoji: '🦖', name: '霸王龙' },
  { key: 'rocket', emoji: '🚀', name: '小火箭' },
  { key: 'ufo', emoji: '🛸', name: '飞碟' },
  { key: 'star', emoji: '🌟', name: '闪亮星' },
  { key: 'rainbow', emoji: '🌈', name: '彩虹' },
  { key: 'comet', emoji: '☄️', name: '彗星' },
  { key: 'planet', emoji: '🪐', name: '土星环' },
  { key: 'crown', emoji: '👑', name: '小皇冠' },
  { key: 'gem', emoji: '💎', name: '大钻石' },
  { key: 'medal', emoji: '🏅', name: '金牌' },
  { key: 'trophy', emoji: '🏆', name: '奖杯' },
  { key: 'cake', emoji: '🎂', name: '生日蛋糕' },
  { key: 'icecream', emoji: '🍦', name: '冰淇淋' },
  { key: 'donut', emoji: '🍩', name: '甜甜圈' },
  { key: 'candy', emoji: '🍭', name: '棒棒糖' },
  { key: 'pizza', emoji: '🍕', name: '披萨' },
  { key: 'sushi', emoji: '🍣', name: '寿司' },
  { key: 'robot', emoji: '🤖', name: '机器人' },
  { key: 'ghost', emoji: '👻', name: '小幽灵' },
  { key: 'alien', emoji: '👾', name: '像素怪' },
  { key: 'wizard', emoji: '🧙', name: '魔法师' },
  { key: 'mermaid', emoji: '🧜', name: '美人鱼' },
  { key: 'fairy', emoji: '🧚', name: '小精灵' },
  { key: 'guitar', emoji: '🎸', name: '电吉他' },
  { key: 'drum', emoji: '🥁', name: '架子鼓' },
  { key: 'soccer', emoji: '⚽', name: '足球' },
  { key: 'basketball', emoji: '🏀', name: '篮球' },
  { key: 'skateboard', emoji: '🛹', name: '滑板' },
  { key: 'kite', emoji: '🪁', name: '风筝' },
  { key: 'balloon', emoji: '🎈', name: '气球' },
  { key: 'gift', emoji: '🎁', name: '神秘礼物' },

  /*
    ---- v65 新增 12 张 ----
    加它们不是为了「多」,是为了把每一本主题册凑成整 6 张 ——
    一本册子差一格永远补不上,比没有这本册子更让人难受。
  */
  { key: 'shark', emoji: '🦈', name: '大鲨鱼' },
  { key: 'seal', emoji: '🦭', name: '小海豹' },
  { key: 'snail', emoji: '🐌', name: '慢吞吞蜗牛' },
  { key: 'ant', emoji: '🐜', name: '小蚂蚁' },
  { key: 'spider', emoji: '🕷️', name: '织网蜘蛛' },
  { key: 'lizard', emoji: '🦎', name: '变色蜥蜴' },
  { key: 'croc', emoji: '🐊', name: '大鳄鱼' },
  { key: 'fossil', emoji: '🦴', name: '恐龙化石' },
  { key: 'volcano', emoji: '🌋', name: '火山' },
  { key: 'key', emoji: '🗝️', name: '藏宝箱钥匙' },
  { key: 'snowflake', emoji: '❄️', name: '小雪花' },
  { key: 'cloud', emoji: '☁️', name: '棉花糖云' },
]

/** 一本主题册 */
export interface StickerBook {
  key: string
  emoji: string
  name: string
  /** 这一册里的贴纸 key;顺序就是册子里的排列顺序 */
  members: string[]
}

/**
 * 十本主题册,每本 6 张。
 *
 * 分册的依据是**孩子能一眼看懂的类别**(森林、海洋、恐龙……),
 * 不是按稀有度或难度分 —— 稀有度对 4 岁半没有意义,
 * 他认得出「这一格是恐龙,我还差一只」。
 */
export const STICKER_BOOKS: StickerBook[] = [
  {
    key: 'forest',
    emoji: '🌳',
    name: '森林伙伴',
    members: ['panda', 'tiger', 'rabbit', 'fox', 'lion', 'koala'],
  },
  {
    key: 'ocean',
    emoji: '🌊',
    name: '海洋世界',
    members: ['whale', 'dolphin', 'octopus', 'penguin', 'shark', 'seal'],
  },
  {
    key: 'garden',
    emoji: '🌼',
    name: '花园小虫',
    members: ['butterfly', 'bee', 'ladybug', 'snail', 'ant', 'spider'],
  },
  {
    key: 'dino',
    emoji: '🦖',
    name: '恐龙时代',
    members: ['dino', 'trex', 'lizard', 'croc', 'fossil', 'volcano'],
  },
  {
    key: 'space',
    emoji: '🚀',
    name: '太空探险',
    members: ['rocket', 'ufo', 'star', 'comet', 'planet', 'alien'],
  },
  {
    key: 'magic',
    emoji: '🧙',
    name: '魔法世界',
    members: ['unicorn', 'dragon', 'wizard', 'fairy', 'mermaid', 'ghost'],
  },
  {
    key: 'sweets',
    emoji: '🍰',
    name: '甜品屋',
    members: ['cake', 'icecream', 'donut', 'candy', 'pizza', 'sushi'],
  },
  {
    key: 'treasure',
    emoji: '👑',
    name: '宝藏箱',
    members: ['crown', 'gem', 'medal', 'trophy', 'gift', 'key'],
  },
  {
    key: 'playground',
    emoji: '🎪',
    name: '玩乐场',
    members: ['guitar', 'drum', 'soccer', 'basketball', 'skateboard', 'robot'],
  },
  {
    key: 'sky',
    emoji: '🌈',
    name: '天上飞的',
    members: ['rainbow', 'balloon', 'kite', 'owl', 'snowflake', 'cloud'],
  },
]

export function getBook(key: string): StickerBook | undefined {
  return STICKER_BOOKS.find((b) => b.key === key)
}

/** 这一册集到几张 / 一共几张 */
export function bookProgress(book: StickerBook, owned: string[]): { got: number; total: number } {
  const set = new Set(owned)
  return { got: book.members.filter((k) => set.has(k)).length, total: book.members.length }
}

/** 已经集齐的册子 */
export function completedBooks(owned: string[]): StickerBook[] {
  return STICKER_BOOKS.filter((b) => {
    const p = bookProgress(b, owned)
    return p.total > 0 && p.got === p.total
  })
}

export function getSticker(key: string): StickerDef | undefined {
  return STICKER_CATALOG.find((s) => s.key === key)
}

/** 这次练习够不够格掉一张贴纸 */
export function qualifiesForSticker(correct: number, total: number): boolean {
  return total >= 4 && correct / total >= 0.8
}

/**
 * 掉一张还没有的贴纸。
 *
 * **偏向快集齐的那一册。**
 *
 * 纯随机有个很实际的毛病:册子永远差最后一两张。
 * 60 张里随机抽,想补上「太空册最后那颗彗星」平均要等 30 多次 ——
 * 而集卡册全部的劲头就在那最后一格上,等太久那股劲就散了。
 *
 * 所以先看有没有「只差 1–2 张」的册子,有就从那里面抽;
 * 一本都没有才在全部缺的里面随机。
 * 这不是放水:掉落的门槛(正确率 ≥80%)一点没变,
 * 变的只是**掉哪一张** —— 同样的付出,给他一个够得着的目标。
 */
export function rollSticker(owned: string[]): StickerDef | undefined {
  const has = new Set(owned)
  const missing = STICKER_CATALOG.filter((s) => !has.has(s.key))
  if (missing.length === 0) return undefined

  /*
    只差 1–2 张的册子优先。
    差 3 张以上不算「快集齐」—— 那样几乎每本册子都会被算进来,
    偏向就失去意义了。
  */
  const NEARLY_DONE = 2
  const nearly: string[] = []
  for (const b of STICKER_BOOKS) {
    const p = bookProgress(b, owned)
    const left = p.total - p.got
    if (left > 0 && left <= NEARLY_DONE) {
      for (const k of b.members) if (!has.has(k)) nearly.push(k)
    }
  }
  const pool = nearly.length > 0 ? missing.filter((s) => nearly.includes(s.key)) : missing
  return pool[Math.floor(Math.random() * pool.length)]
}
