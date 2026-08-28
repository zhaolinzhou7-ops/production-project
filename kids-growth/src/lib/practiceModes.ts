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
  /*
    英语练法**全部改成纯英文**。

    原先「听音选义」是听英文、在四个中文释义里选,「认词」是看英文想中文 ——
    练的其实是一张中译英对应表:先把声音翻成中文,再去找那个中文。
    这条路走下去,他读一句英文永远要在脑子里过一遍中文,那个习惯以后
    要花好几年去掉。

    现在选项也是英文(cat / cap / cut 里点出 cat),释义旁边补例句 ——
    意思靠图和句子建立,不靠翻译。
  */
  word: [
    { mode: 'recognize', label: '认词', icon: '👀', desc: '看词想意思,再看例句', lowAgeFriendly: true },
    { mode: 'listenChoose', label: '听音选词', icon: '👂', desc: '听一听,选出听到的词', lowAgeFriendly: true },
    { mode: 'speakEn', label: '跟我读', icon: '🗣️', desc: '听范读→读出来→读例句', lowAgeFriendly: true },
    { mode: 'spell', label: '拼写', icon: '⌨️', desc: '把字母拼成这个词', lowAgeFriendly: true },
    { mode: 'dictation', label: '听写', icon: '✍️', desc: '听发音写单词', lowAgeFriendly: true },
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
  fact: [
    { mode: 'quiz', label: '选一选', icon: '🧠', desc: '看题目选答案', lowAgeFriendly: true },
    { mode: 'review', label: '想一想', icon: '💭', desc: '先回想再翻答案自评', lowAgeFriendly: true },
  ],
  /*
    看图卡的练法**全程英语**,而且不留重复的。

    删掉的:
    - 「看图选一选」(看图选中文名):对一个中文母语的孩子,🐱 叫猫这件事
      他三岁就会了 —— 这一档不是学习,是占位。
    - 「听音选图」(听中文点图):同上,和英语版是同一个动作,只是换了语言,
      而中文那一半没有任何增益。
    - 「说给我听」:和「跟我读」是同一件事(他说、家长判),只是少了范读,
      合并成一个就够了。
  */
  pic: [
    { mode: 'listenPicEn', label: '听英语点图', icon: '🎧', desc: '听英语,点出对应的图', lowAgeFriendly: true },
    { mode: 'picChooseEn', label: '看图选单词', icon: '🅰️', desc: '看图选出英语单词', lowAgeFriendly: true },
    { mode: 'speakEn', label: '跟我读', icon: '🎙️', desc: '听范读→读出来→读例句', lowAgeFriendly: true },
    { mode: 'spell', label: '拼出来', icon: '⌨️', desc: '听发音+看图,把词拼出来', lowAgeFriendly: true },
    { mode: 'earTrain', label: '磨耳朵', icon: '🎵', desc: '单词和例句自动连播,不用操作', lowAgeFriendly: true },
  ],
}

export function modesFor(itemType: CardItemType, lowAge: boolean): PracticeModeDef[] {
  const all = MODES_BY_TYPE[itemType] ?? []
  return lowAge ? all.filter((m) => m.lowAgeFriendly) : all
}
