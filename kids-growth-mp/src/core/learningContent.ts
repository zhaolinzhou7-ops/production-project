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
    name: '认识形状',
    subject: '启蒙',
    icon: '🔷',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-shapes.json')),
  },
  {
    key: 'enlight-numbers',
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
    name: '身体部位',
    subject: '启蒙',
    icon: '🦶',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-body.json')),
  },
  {
    key: 'enlight-transport',
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
    name: '看天气',
    subject: '启蒙',
    icon: '⛅',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-weather.json')),
  },
  {
    key: 'enlight-family',
    name: '家人与职业',
    subject: '启蒙',
    icon: '👨‍👩‍👧',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-family.json')),
  },
  {
    key: 'enlight-clothes',
    name: '衣物穿戴',
    subject: '启蒙',
    icon: '👕',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-clothes.json')),
  },
  {
    key: 'enlight-school',
    name: '学校用品',
    subject: '启蒙',
    icon: '🎒',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => json(require('../data/decks/enlight-school.json')),
  },
  {
    key: 'enlight-home',
    name: '家里的东西',
    subject: '启蒙',
    icon: '🛋️',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-home.json')),
  },
  {
    key: 'enlight-sports',
    name: '运动与玩具',
    subject: '启蒙',
    icon: '⚽',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-sports.json')),
  },
  {
    key: 'enlight-sea',
    name: '海洋与昆虫',
    subject: '启蒙',
    icon: '🐠',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-sea.json')),
  },
  {
    key: 'enlight-nature',
    name: '植物与自然',
    subject: '启蒙',
    icon: '🌳',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => json(require('../data/decks/enlight-nature.json')),
  },
  {
    key: 'enlight-feelings',
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
    name: '自然拼读·三字母词',
    subject: '启蒙',
    icon: '🧩',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => json(require('../data/decks/phonics-cvc.json')),
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
