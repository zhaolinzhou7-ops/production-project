import type { AgeStage, CardItemType } from '../types'

export interface BuiltinWordCard {
  w: string
  ph?: string
  tr: string
  pos?: string
}
export interface BuiltinPoemCard {
  title: string
  author: string
  dynasty: string
  lines: string[]
}
export interface BuiltinHanziCard {
  c: string
  py: string
  w?: string
}
/** 看图启蒙:一张卡 = 一个 emoji 大图 + 中文 + 英文 */
export interface BuiltinPicCard {
  front: string
  en: string
  emoji: string
  say?: string
}
/** 常识问答:一问一答 */
export interface BuiltinFactCard {
  q: string
  a: string
}
export type BuiltinCard =
  | BuiltinWordCard
  | BuiltinPoemCard
  | BuiltinHanziCard
  | BuiltinPicCard
  | BuiltinFactCard

export interface BuiltinPackData {
  key: string
  name: string
  subject: string
  itemType: CardItemType
  source: string
  count: number
  cards: BuiltinCard[]
}

export interface BuiltinPackMeta {
  key: string
  name: string
  subject: string
  icon: string
  itemType: CardItemType
  stages: AgeStage[]
  /** 是否为该学段的默认包(首次进入自动加上;其余的到「内容库」自助添加) */
  default?: boolean
  /**
   * 内容版本。改过内容包就 +1 —— 已经装在孩子设备上的卡组会自动补齐差异,
   * 而不是要求他删掉重装(那样学习进度就没了)。
   */
  rev?: number
  /**
   * 内容包静态内置。这里用 require 而不是顶部 import,是为了**用到才解析**:
   * 全部 JSON 加起来 380KB,启动时一次性 parse 会让首屏明显变慢。
   */
  load: () => BuiltinPackData
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (m: any): BuiltinPackData => (m && m.default ? m.default : m) as BuiltinPackData

export const BUILTIN_PACKS: BuiltinPackMeta[] = [
  // ---------------- 幼儿启蒙:看图认词(中文 + 英语 + emoji 大图) ----------------
  {
    key: 'enlight-animals',
    name: '认识动物',
    subject: '启蒙',
    icon: '🐶',
    itemType: 'pic',
    stages: ['toddler'],
    default: true,
    load: () => json(require('../data/decks/enlight-animals.json')),
  },
  {
    key: 'enlight-food',
    name: '水果食物',
    subject: '启蒙',
    icon: '🍎',
    itemType: 'pic',
    stages: ['toddler'],
    default: true,
    load: () => json(require('../data/decks/enlight-food.json')),
  },
  {
    key: 'enlight-colors',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '认识颜色',
    subject: '启蒙',
    icon: '🎨',
    itemType: 'pic',
    stages: ['toddler'],
    default: true,
    load: () => json(require('../data/decks/enlight-colors.json')),
  },
  {
    key: 'enlight-shapes',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '认识形状',
    subject: '启蒙',
    icon: '🔷',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-shapes.json')),
  },
  {
    key: 'enlight-numbers',
    /*
      v36 扩充词量 → rev 2。
      v66 改成**真正的数字** → rev 4。

      用户的原话:「他只会对应动物和图片,比如金牌、银牌等,
      并不知道代表什么意思。」这一条说到了根上。

      在英语练法里孩子**只看得到 emoji**(front 那个数字不显示),
      所以这份卡他实际看到的是:
        🍎 → one      👟👟 → two      🍓🍓🍓 → three
        🥇 → first    🧦🧦 → a pair
      三个问题叠在一起:
      ① **直接撞车**:🍎 在食物包里是 apple,👟 在衣物包里是 shoes。
         同一张图两个答案,他学到的是「这个东西的对错没有道理」。
      ② **每个数字换一种东西**,于是「数量」这个共同点被淹没了 ——
         他能记住的只有「苹果那张是 one」,而不是「一个东西叫 one」。
      ③ **序数根本没画出来**:🥇 是「第一」的象征物,不是「第一」本身。
         他看着金牌学会的是 gold medal。

      现在 0–10 一律用数字本身(0️⃣…🔟)。这正是全世界的数字卡片
      都这么做的原因:数字符号是**唯一**不和别的词撞车的画法。

      那「数量」怎么办?交给口算 —— 数一数、分与合、看图列式
      本来就是拿真东西数的地方,而且那里能一直出新题。
      一张卡上又摆数字又摆点数,反而会变成「这题问的是哪个」。

      序数和「一双」**从这一包里拿掉**:一张静态图教不了序数。
      序数已经在口算的 ordinal / position 题型里,那里是一排东西
      问「第几个」—— 那才是序数正确的教法。

      (rev 3:1 原先是一个太阳、序数卡面写「第一」对不上金牌、
       0 原先是空罐子。那一版只修了表达,没动「用实物代表数字」这个根。)    */
    rev: 4,
    name: '数一数',
    subject: '启蒙',
    icon: '🔢',
    itemType: 'pic',
    stages: ['toddler'],
    default: true,
    load: () => json(require('../data/decks/enlight-numbers.json')),
  },
  {
    key: 'enlight-body',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '身体部位',
    subject: '启蒙',
    icon: '🦶',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-body.json')),
  },
  {
    key: 'enlight-transport',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '交通工具',
    subject: '启蒙',
    icon: '🚗',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-transport.json')),
  },
  {
    key: 'enlight-actions',
    name: '动作词',
    subject: '启蒙',
    icon: '🏃',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-actions.json')),
  },
  {
    key: 'enlight-weather',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '看天气',
    subject: '启蒙',
    icon: '⛅',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-weather.json')),
  },
  {
    key: 'enlight-family',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '家人与职业',
    subject: '启蒙',
    icon: '👨‍👩‍👧',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-family.json')),
  },
  {
    key: 'enlight-clothes',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '衣物穿戴',
    subject: '启蒙',
    icon: '👕',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-clothes.json')),
  },
  {
    key: 'enlight-school',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '学校用品',
    subject: '启蒙',
    icon: '🎒',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => json(require('../data/decks/enlight-school.json')),
  },
  {
    key: 'enlight-home',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '家里的东西',
    subject: '启蒙',
    icon: '🛋️',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-home.json')),
  },
  {
    key: 'enlight-sports',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '运动与玩具',
    subject: '启蒙',
    icon: '⚽',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-sports.json')),
  },
  {
    key: 'enlight-sea',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '海洋与昆虫',
    subject: '启蒙',
    icon: '🐠',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-sea.json')),
  },
  {
    key: 'enlight-nature',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '植物与自然',
    subject: '启蒙',
    icon: '🌳',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-nature.json')),
  },
  {
    key: 'enlight-feelings',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '情绪与感受',
    subject: '启蒙',
    icon: '😊',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-feelings.json')),
  },
  {
    key: 'enlight-abc',
    name: '字母 ABC',
    subject: '启蒙',
    icon: '🔡',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    default: true,
    load: () => json(require('../data/decks/enlight-abc.json')),
  },
  {
    key: 'phonics-cvc',
    // v36 扩充了词量,rev +1 让已装在设备上的卡组自动补齐新词(进度不受影响)
    rev: 2,
    name: '自然拼读·三字母词',
    subject: '启蒙',
    icon: '🧩',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => json(require('../data/decks/phonics-cvc.json')),
  },
  // ---------------- 语文:拼音与阅读 ----------------
  {
    /*
      拼音启蒙。部编版一年级上册第一单元就是拼音,5–6 岁必须提前认。

      放在 hanzi 类型里是有意的:它渲染成「大字 + 拼音 + 例词」,
      正好是拼音卡该有的样子,而且直接复用「认读」「听音选字」两种练法。

      发音这件事这里要说实话:单个字母的读音,在线音源大多读不准
      (常常把 b 念成「比」而不是「波」)。真正的解法是**家长录一遍** ——
      口语中心的「🎤 家长录音」录下的就是按文本索引的,
      家长把 63 个音录一次,以后这一包全程都是他自己的声音。
    */
    key: 'pinyin-basic',
    name: '拼音启蒙·声母韵母',
    subject: '语文',
    icon: '🔤',
    itemType: 'hanzi',
    stages: ['toddler', 'primary'],
    load: () => json(require('../data/decks/pinyin-basic.json')),
  },
  {
    /*
      亲子共读的小故事。

      阅读量是长期学业成绩最强的单一预测因子 —— 比任何刷题都强。
      而这套系统在此之前**一篇中文读物都没有**。

      放在 poem 类型里同样是有意的:它的「朗读」模式是逐句点读,
      正好适合亲子共读 —— 你读一句,他跟一句;认得的字他自己读。
    */
    key: 'read-story-1',
    name: '亲子共读·小故事',
    subject: '语文',
    icon: '📖',
    itemType: 'poem',
    stages: ['toddler', 'primary'],
    default: true,
    load: () => json(require('../data/decks/read-story-1.json')),
  },
  // ---------------- 语文:识字 ----------------
  {
    key: 'hanzi-toddler',
    name: '幼儿·最常用100字',
    subject: '语文',
    icon: '🈁',
    itemType: 'hanzi',
    stages: ['toddler'],
    default: true,
    load: () => json(require('../data/decks/hanzi-toddler.json')),
  },
  {
    key: 'hanzi-primary',
    name: '小学·常用识字(一)',
    subject: '语文',
    icon: '🈷️',
    itemType: 'hanzi',
    stages: ['primary'],
    default: true,
    load: () => json(require('../data/decks/hanzi-primary.json')),
  },
  {
    key: 'hanzi-primary-2',
    name: '小学·常用识字(二)',
    subject: '语文',
    icon: '🈴',
    itemType: 'hanzi',
    stages: ['primary'],
    load: () => json(require('../data/decks/hanzi-primary-2.json')),
  },
  {
    key: 'hanzi-primary-3',
    name: '小学·常用识字(三)',
    subject: '语文',
    icon: '🈵',
    itemType: 'hanzi',
    stages: ['primary'],
    load: () => json(require('../data/decks/hanzi-primary-3.json')),
  },
  // ---------------- 常识问答 ----------------
  {
    key: 'facts-science',
    name: '科学·自然常识',
    subject: '科学',
    icon: '🔬',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    default: true,
    load: () => json(require('../data/decks/facts-science.json')),
  },
  {
    key: 'facts-safety',
    name: '安全·生活常识',
    subject: '安全',
    icon: '🛡️',
    itemType: 'fact',
    stages: ['primary'],
    default: true,
    load: () => json(require('../data/decks/facts-safety.json')),
  },
  {
    key: 'facts-idioms',
    name: '语文·成语启蒙',
    subject: '语文',
    icon: '🏮',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    load: () => json(require('../data/decks/facts-idioms.json')),
  },
  {
    key: 'facts-geo',
    name: '地理·中国与世界',
    subject: '地理',
    icon: '🌍',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    load: () => json(require('../data/decks/facts-geo.json')),
  },
  // ---------------- 英语词库 ----------------
  {
    key: 'words-sight',
    name: '高频词 Sight Words',
    subject: '英语',
    icon: '✨',
    itemType: 'word',
    stages: ['primary'],
    default: true,
    load: () => json(require('../data/decks/words-sight.json')),
  },
  {
    key: 'words-primary',
    name: '小学·基础高频词',
    subject: '英语',
    icon: '🔤',
    itemType: 'word',
    stages: ['primary'],
    default: true,
    load: () => json(require('../data/decks/words-primary.json')),
  },
  {
    key: 'words-junior',
    name: '初中·中考大纲词',
    subject: '英语',
    icon: '📗',
    itemType: 'word',
    stages: ['junior'],
    default: true,
    load: () => json(require('../data/decks/words-junior.json')),
  },
  // ---------------- 古诗 ----------------
  {
    key: 'poems-primary',
    name: '小学·唐诗启蒙',
    subject: '语文',
    icon: '📜',
    itemType: 'poem',
    stages: ['primary'],
    default: true,
    load: () => json(require('../data/decks/poems-primary.json')),
  },
]

export function getPackMeta(key: string): BuiltinPackMeta | undefined {
  return BUILTIN_PACKS.find((p) => p.key === key)
}

export function packsForStage(stage: AgeStage): BuiltinPackMeta[] {
  return BUILTIN_PACKS.filter((p) => p.stages.includes(stage))
}

/** 该学段默认自动加上的包(其余的在「内容库」里自助添加,避免一次写入太多卡片) */
export function defaultPacksForStage(stage: AgeStage): BuiltinPackMeta[] {
  return packsForStage(stage).filter((p) => p.default)
}
