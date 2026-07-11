import type { CardItemType, PracticeMode } from '../types'

export interface PracticeModeDef {
  mode: PracticeMode
  label: string
  icon: string
  /** 简介 */
  desc: string
  /** 是否需要联网/麦克风(用于轻提示) */
  needsMic?: boolean
  /** 低龄段(toddler/primary)是否展示 */
  lowAgeFriendly: boolean
}

/** 每种卡片类型支持的练习模式(批次0聚焦 word;其余类型的模式在后续批次接) */
export const MODES_BY_TYPE: Record<CardItemType, PracticeModeDef[]> = {
  word: [
    { mode: 'recognize', label: '认词', icon: '👀', desc: '看英文想中文', lowAgeFriendly: true },
    { mode: 'listenChoose', label: '听音选义', icon: '👂', desc: '听发音选意思', lowAgeFriendly: true },
    { mode: 'spell', label: '拼写', icon: '⌨️', desc: '看中文拼单词', lowAgeFriendly: true },
    { mode: 'dictation', label: '听写', icon: '✍️', desc: '听发音写单词', lowAgeFriendly: true },
    { mode: 'speak', label: '跟读', icon: '🎤', desc: '跟着读一遍', needsMic: true, lowAgeFriendly: true },
  ],
  poem: [
    { mode: 'recite', label: '朗读背诵', icon: '📖', desc: '听读并背诵', lowAgeFriendly: true },
    { mode: 'fillBlank', label: '补全诗句', icon: '✏️', desc: '选出缺的一句', lowAgeFriendly: true },
  ],
  hanzi: [
    { mode: 'recognize', label: '认字', icon: '👀', desc: '看字读音组词', lowAgeFriendly: true },
    { mode: 'listenChoose', label: '听音选字', icon: '👂', desc: '听读音选汉字', lowAgeFriendly: true },
  ],
  wrong: [{ mode: 'review', label: '重做', icon: '🔁', desc: '回想再自评', lowAgeFriendly: true }],
  pic: [
    { mode: 'picChoose', label: '看图选一选', icon: '🖼️', desc: '看图片选名字', lowAgeFriendly: true },
    { mode: 'listenPic', label: '听音选图', icon: '👂', desc: '听声音点图片', lowAgeFriendly: true },
  ],
}

export function modesFor(itemType: CardItemType, lowAge: boolean): PracticeModeDef[] {
  const all = MODES_BY_TYPE[itemType] ?? []
  return lowAge ? all.filter((m) => m.lowAgeFriendly) : all
}
