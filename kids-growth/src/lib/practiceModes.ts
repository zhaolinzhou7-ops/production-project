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
    { mode: 'speak', label: '跟读', icon: '🎤', desc: '跟着读一遍', needsMic: true, lowAgeFriendly: true },
  ],
  poem: [
    { mode: 'recite', label: '朗读背诵', icon: '📖', desc: '听读并背诵', lowAgeFriendly: true },
    { mode: 'fillBlank', label: '补全诗句', icon: '✏️', desc: '选出缺的一句', lowAgeFriendly: true },
  ],
  hanzi: [
    { mode: 'recognize', label: '认字', icon: '👀', desc: '看字读音组词', lowAgeFriendly: true },
    { mode: 'listenChoose', label: '听音选字', icon: '👂', desc: '听读音选汉字', lowAgeFriendly: true },
    { mode: 'sayIt', label: '说给我听', icon: '🗣️', desc: '自己说出来,家长判', lowAgeFriendly: true },
  ],
  wrong: [{ mode: 'review', label: '重做', icon: '🔁', desc: '回想再自评', lowAgeFriendly: true }],
  fact: [
    { mode: 'quiz', label: '选一选', icon: '🧠', desc: '看题目选答案', lowAgeFriendly: true },
    { mode: 'review', label: '想一想', icon: '💭', desc: '先回想再翻答案自评', lowAgeFriendly: true },
  ],
  pic: [
    { mode: 'picChoose', label: '看图选一选', icon: '🖼️', desc: '看图片选名字', lowAgeFriendly: true },
    { mode: 'listenPic', label: '听音选图', icon: '👂', desc: '听声音点图片', lowAgeFriendly: true },
    { mode: 'picChooseEn', label: '英语·看图选词', icon: '🅰️', desc: '看图选英语单词', lowAgeFriendly: true },
    { mode: 'listenPicEn', label: '英语·听音选图', icon: '🎧', desc: '听英语点图片', lowAgeFriendly: true },
    { mode: 'earTrain', label: '磨耳朵', icon: '🎵', desc: '英语中文自动连播', lowAgeFriendly: true },
    /*
      「读出来」是难度阶梯的最后一档,也是这套系统原先缺掉的一环。
      四选一有 25% 的蒙对率,而说出来没有 —— 一个内容真正学会的标志,
      是他能说出来,不是能认出来。
    */
    { mode: 'speakEn', label: '英语·跟我读', icon: '🗣️', desc: '听范读→读出来→家长判', lowAgeFriendly: true },
    { mode: 'sayIt', label: '说给我听', icon: '💬', desc: '看图自己说,家长判', lowAgeFriendly: true },
  ],
}

export function modesFor(itemType: CardItemType, lowAge: boolean): PracticeModeDef[] {
  const all = MODES_BY_TYPE[itemType] ?? []
  return lowAge ? all.filter((m) => m.lowAgeFriendly) : all
}
