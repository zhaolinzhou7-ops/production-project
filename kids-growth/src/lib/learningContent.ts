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

export type BuiltinCard = BuiltinWordCard | BuiltinPoemCard | BuiltinHanziCard

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
  {
    key: 'words-primary',
    name: '小学·基础高频词',
    subject: '英语',
    icon: '🔤',
    itemType: 'word',
    stages: ['toddler', 'primary'],
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
