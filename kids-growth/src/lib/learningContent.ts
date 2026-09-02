import type { AgeStage, CardItemType } from '../types'

export interface BuiltinPackMeta {
  key: string
  name: string
  subject: string
  icon: string
  itemType: CardItemType
  /** 适用年龄阶段(用于按学段推荐默认卡组) */
  stages: AgeStage[]
  /**
   * 内容修订号(缺省 1)。内容包 JSON 改动后 +1,
   * 已实例化的卡组会在下次进入学习页时自动刷新卡片内容(SRS 进度保留)。
   */
  rev?: number
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

export interface BuiltinFactCard {
  q: string // 题目/问题
  a: string // 答案
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

export const BUILTIN_PACKS: BuiltinPackMeta[] = [
  // ---- 幼儿启蒙(3–6 岁):看大图 + 语音,不认字也能玩 ----
  {
    key: 'enlight-animals',
    name: '认识动物',
    subject: '启蒙',
    icon: '🐼',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 3, // 批次33 扩充词汇量
    load: () => import('../data/decks/enlight-animals.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-food',
    name: '水果食物',
    subject: '启蒙',
    icon: '🍎',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 3, // 批次33 扩充词汇量
    load: () => import('../data/decks/enlight-food.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-colors',
    name: '认识颜色',
    subject: '启蒙',
    icon: '🌈',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 5, // 内容与小程序对齐(原:批次35 形状拆成独立卡组)
    load: () => import('../data/decks/enlight-colors.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-shapes',
    name: '认识形状',
    subject: '启蒙',
    icon: '🔷',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-shapes.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-numbers',
    name: '数一数',
    subject: '启蒙',
    icon: '🔢',
    itemType: 'pic',
    stages: ['toddler'],
    /*
      rev 5(w63):0 从 0️⃣ 改成空盘子 🍽️,读出来是「零,一个也没有」。

      整组卡的规矩是「front 是数字、emoji 是数量」。零是唯一画不出个数的数 ——
      1–10 靠「重复几个同样的东西」看得出来,零没有东西可重复。
      空罐子会被认成「罐子」;0️⃣ 更糟,它让图也变成了数字,规矩就破了。
      现在给「一个也没有」找一个他见过的场面:空盘子(吃完了、一个不剩)。
      (rev 4:1 用一个苹果、序数配名次)
    */
    rev: 5,
    load: () => import('../data/decks/enlight-numbers.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-body',
    name: '身体部位',
    subject: '启蒙',
    icon: '🖐️',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 3, // 内容与小程序对齐(原:批次33 扩充词汇量)
    load: () => import('../data/decks/enlight-body.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-transport',
    name: '交通工具',
    subject: '启蒙',
    icon: '🚗',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 3, // 内容与小程序对齐(原:批次33 扩充词汇量)
    load: () => import('../data/decks/enlight-transport.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-actions',
    name: '动作词',
    subject: '启蒙',
    icon: '🏃',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 批次33 扩充词汇量
    load: () => import('../data/decks/enlight-actions.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-weather',
    name: '看天气',
    subject: '启蒙',
    icon: '⛅',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 3, // 内容与小程序对齐(原:批次33 扩充词汇量)
    load: () => import('../data/decks/enlight-weather.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-family',
    name: '家人与职业',
    subject: '启蒙',
    icon: '👨‍👩‍👧',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-family.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-clothes',
    name: '衣物穿戴',
    subject: '启蒙',
    icon: '👕',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-clothes.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-school',
    name: '学校用品',
    subject: '启蒙',
    icon: '✏️',
    itemType: 'pic',
    stages: ['toddler', 'primary'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-school.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-home',
    name: '家里的东西',
    subject: '启蒙',
    icon: '🏠',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-home.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-sports',
    name: '运动与玩具',
    subject: '启蒙',
    icon: '⚽',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-sports.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-sea',
    name: '海洋与昆虫',
    subject: '启蒙',
    icon: '🐠',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-sea.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-nature',
    name: '植物与自然',
    subject: '启蒙',
    icon: '🌳',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-nature.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'enlight-feelings',
    name: '情绪与感受',
    subject: '启蒙',
    icon: '😄',
    itemType: 'pic',
    stages: ['toddler'],
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/enlight-feelings.json').then((m) => m.default as BuiltinPackData),
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
    rev: 2, // 内容与小程序对齐,扩充词汇量
    load: () => import('../data/decks/phonics-cvc.json').then((m) => m.default as BuiltinPackData),
  },
  {
    /*
      拼音。

      为什么把它排在识字前面:拼音是**自主阅读的钥匙** —— 学会了拼音,
      他能自己拼出没见过的字,识字量从此不再受「教过多少」限制。
      部编版一年级上册的第一个单元就是拼音,正是这个道理。

      放在 hanzi 类型里是有意的:它的练法(听音选字 / 看字读音)
      正好就是拼音要练的两件事。
      家长录音按文本索引,把这 63 个音录一次,这一包全程都是他自己的声音。
    */
    key: 'pinyin-basic',
    name: '拼音启蒙·声母韵母',
    subject: '语文',
    icon: '🔤',
    itemType: 'hanzi',
    stages: ['toddler', 'primary'],
    load: () => import('../data/decks/pinyin-basic.json').then((m) => m.default as BuiltinPackData),
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
    load: () => import('../data/decks/read-story-1.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'hanzi-toddler',
    name: '幼儿·最常用100字',
    subject: '语文',
    icon: '🈁',
    itemType: 'hanzi',
    stages: ['toddler'],
    load: () => import('../data/decks/hanzi-toddler.json').then((m) => m.default as BuiltinPackData),
  },
  // ---- 常识问答(科学/安全/成语/地理) ----
  {
    key: 'facts-science',
    name: '科学·自然常识',
    subject: '科学',
    icon: '🔬',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    load: () => import('../data/decks/facts-science.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'facts-safety',
    name: '安全·生活常识',
    subject: '安全',
    icon: '🛡️',
    itemType: 'fact',
    stages: ['primary'],
    load: () => import('../data/decks/facts-safety.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'facts-idioms',
    name: '语文·成语启蒙',
    subject: '语文',
    icon: '🏮',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    load: () => import('../data/decks/facts-idioms.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'facts-geo',
    name: '地理·中国与世界',
    subject: '地理',
    icon: '🌍',
    itemType: 'fact',
    stages: ['primary', 'junior'],
    load: () => import('../data/decks/facts-geo.json').then((m) => m.default as BuiltinPackData),
  },
  // ---- 小学及以上 ----
  {
    key: 'words-sight',
    name: '高频词 Sight Words',
    subject: '英语',
    icon: '✨',
    itemType: 'word',
    stages: ['primary'],
    rev: 2, // 批次33 扩充词汇量
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
    name: '小学·常用识字(一)',
    subject: '语文',
    icon: '🈷️',
    itemType: 'hanzi',
    stages: ['primary'],
    rev: 3, // 内容与小程序对齐(原:改名为(一),与(二)(三)成序列)
    load: () => import('../data/decks/hanzi-primary.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'hanzi-primary-2',
    name: '小学·常用识字(二)',
    subject: '语文',
    icon: '🈶',
    itemType: 'hanzi',
    stages: ['primary', 'junior'],
    load: () => import('../data/decks/hanzi-primary-2.json').then((m) => m.default as BuiltinPackData),
  },
  {
    key: 'hanzi-primary-3',
    name: '小学·常用识字(三)',
    subject: '语文',
    icon: '🈚',
    itemType: 'hanzi',
    stages: ['primary', 'junior'],
    load: () => import('../data/decks/hanzi-primary-3.json').then((m) => m.default as BuiltinPackData),
  },
]

export function getPackMeta(key: string): BuiltinPackMeta | undefined {
  return BUILTIN_PACKS.find((p) => p.key === key)
}

export function packsForStage(stage: AgeStage): BuiltinPackMeta[] {
  return BUILTIN_PACKS.filter((p) => p.stages.includes(stage))
}
