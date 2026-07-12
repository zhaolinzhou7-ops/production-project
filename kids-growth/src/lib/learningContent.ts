import type { AgeStage, CardItemType } from '../types'

export interface BuiltinPackMeta {
  key: string
  name: string
  subject: string
  icon: string
  itemType: CardItemType
  /** 适用年龄阶段(用于按学段推荐默认卡组) */
  stages: AgeStage[]
  /** 动态加载内容包(懒加载,不撑大首屏) */
  load: () => Promise<BuiltinPackData>
}

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

export interface BuiltinPicCard {
  front: string // 中文名(答案文字)
  en: string // 英文/辅助信息
  emoji: string // 大图(emoji,数一数为重复串)
  say?: string // 朗读文本(缺省用 front)
}

export type BuiltinCard = BuiltinWordCard | BuiltinPoemCard | BuiltinHanziCard | BuiltinPicCard

export interface BuiltinPackData {
  key: string
  name: string
  subject: string
  itemType: CardItemType
  source: string
  count: number
  cards: BuiltinCard[]
}

export const BUILTIN_PACKS: BuiltinPackMeta[] = [
  // ---- 幼儿启蒙(3–6 岁):看大图 + 语音,不认字也能玩 ----
  {
    key: 'enlight-animals',
    name: '认识动物',
    subject: '启蒙',
    icon: '🐼',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-animals.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-food',
    name: '水果食物',
    subject: '启蒙',
    icon: '🍎',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-food.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-colors',
    name: '颜色形状',
    subject: '启蒙',
    icon: '🌈',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-colors.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-numbers',
    name: '数一数',
    subject: '启蒙',
    icon: '🔢',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-numbers.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-body',
    name: '身体部位',
    subject: '启蒙',
    icon: '🖐️',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-body.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-transport',
    name: '交通工具',
    subject: '启蒙',
    icon: '🚗',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-transport.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-actions',
    name: '动作词',
    subject: '启蒙',
    icon: '🏃',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-actions.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-weather',
    name: '看天气',
    subject: '启蒙',
    icon: '⛅',
    itemType: 'pic',
    stages: ['toddler'],
    load: () => import('../data/decks/enlight-weather.json').then((m) => m.default as BuiltinPackData),
  },
  // ---- 英语入门(幼儿 + 小学低年级通用) ----
  {
    key: 'enlight-abc',
    name: '字母 ABC',
    subject: '启蒙',
    icon: '🔠',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => import('../data/decks/enlight-abc.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'phonics-cvc',
    name: '自然拼读·三字母词',
    subject: '启蒙',
    icon: '🧩',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    load: () => import('../data/decks/phonics-cvc.json').then((m) => m.default as BuiltinPackData),
  },
  // ---- 小学及以上 ----
  {
    key: 'words-sight',
    name: '高频词 Sight Words',
    subject: '英语',
    icon: '✨',
    itemType: 'word',
    stages: ['primary'],
    load: () => import('../data/decks/words-sight.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'words-primary',
    name: '小学·基础高频词',
    subject: '英语',
    icon: '🔤',
    itemType: 'word',
    stages: ['primary'],
    load: () => import('../data/decks/words-primary.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'words-junior',
    name: '初中·中考大纲词',
    subject: '英语',
    icon: '📗',
    itemType: 'word',
    stages: ['junior'],
    load: () => import('../data/decks/words-junior.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'words-senior',
    name: '高中·高考大纲词',
    subject: '英语',
    icon: '📘',
    itemType: 'word',
    stages: ['senior'],
    load: () => import('../data/decks/words-senior.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'poems-primary',
    name: '小学·唐诗启蒙',
    subject: '语文',
    icon: '📜',
    itemType: 'poem',
    stages: ['primary'],
    load: () => import('../data/decks/poems-primary.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'hanzi-primary',
    name: '小学·常用识字',
    subject: '语文',
    icon: '🈷️',
    itemType: 'hanzi',
    stages: ['primary'],
    load: () => import('../data/decks/hanzi-primary.json').then((m) => m.default as BuiltinPackData),
  },
]

export function getPackMeta(key: string): BuiltinPackMeta | undefined {
  return BUILTIN_PACKS.find((p) => p.key === key)
}

export function packsForStage(stage: AgeStage): BuiltinPackMeta[] {
  return BUILTIN_PACKS.filter((p) => p.stages.includes(stage))
}
