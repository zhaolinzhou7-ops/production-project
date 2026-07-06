import type { AgeStage, CardItemType } from '../types'
import wordsPrimary from '../data/decks/words-primary.json'
import poemsPrimary from '../data/decks/poems-primary.json'
import hanziPrimary from '../data/decks/hanzi-primary.json'

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

export interface BuiltinPackMeta {
  key: string
  name: string
  subject: string
  icon: string
  itemType: CardItemType
  stages: AgeStage[]
  /** 小程序:内容包静态内置,直接返回 */
  load: () => BuiltinPackData
}

export const BUILTIN_PACKS: BuiltinPackMeta[] = [
  {
    key: 'words-primary',
    name: '小学·基础高频词',
    subject: '英语',
    icon: '🔤',
    itemType: 'word',
    stages: ['toddler', 'primary'],
    load: () => wordsPrimary as unknown as BuiltinPackData,
  },
  {
    key: 'poems-primary',
    name: '小学·唐诗启蒙',
    subject: '语文',
    icon: '📜',
    itemType: 'poem',
    stages: ['primary'],
    load: () => poemsPrimary as unknown as BuiltinPackData,
  },
  {
    key: 'hanzi-primary',
    name: '小学·常用识字',
    subject: '语文',
    icon: '🈷️',
    itemType: 'hanzi',
    stages: ['primary'],
    load: () => hanziPrimary as unknown as BuiltinPackData,
  },
]

export function getPackMeta(key: string): BuiltinPackMeta | undefined {
  return BUILTIN_PACKS.find((p) => p.key === key)
}

export function packsForStage(stage: AgeStage): BuiltinPackMeta[] {
  return BUILTIN_PACKS.filter((p) => p.stages.includes(stage))
}
