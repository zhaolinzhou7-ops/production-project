// 贴纸收藏册(从网页版原样移植的图鉴)。
// 规则:一次练习正确率 ≥80% 掉落一张随机的「还没有的」贴纸,集齐为长期目标。

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
]

export function getSticker(key: string): StickerDef | undefined {
  return STICKER_CATALOG.find((s) => s.key === key)
}

/** 这次练习够不够格掉一张贴纸 */
export function qualifiesForSticker(correct: number, total: number): boolean {
  return total >= 4 && correct / total >= 0.8
}

/** 从「还没有的」里随机挑一张;都集齐了返回 undefined */
export function rollSticker(owned: string[]): StickerDef | undefined {
  const pool = STICKER_CATALOG.filter((s) => !owned.includes(s.key))
  if (pool.length === 0) return undefined
  return pool[Math.floor(Math.random() * pool.length)]
}
