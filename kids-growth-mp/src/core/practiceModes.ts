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
  /**
   * 是否放进首页的「🔄 再练一遍」。
   *
   * 这两个位置很值钱 —— 孩子主动想多练时点的就是它们,所以要放**最该反复做**的,
   * 而不是「列表里排在最前的两个」。看图包尤其明显:排最前的是中文的
   * 「看图选一选 / 听音选图」,可孩子需要反复磨的是**英语**那两个
   * (磨耳朵、英语·听音选图)—— 中文他本来就会说,英语才需要一遍一遍听。
   */
  repeat?: boolean
}

/** 每种卡片类型支持的练习模式(批次0聚焦 word;其余类型的模式在后续批次接) */
export const MODES_BY_TYPE: Record<CardItemType, PracticeModeDef[]> = {
  /*
    英语练法**全部改成纯英文**。

    原先「听音选义」是听英文、在四个中文释义里选,「认词」是看英文想中文 ——
    练的其实是一张中译英对应表:先把声音翻成中文,再去找那个中文。
    这条路走下去,他读一句英文永远要在脑子里过一遍中文,那个习惯以后
    要花好几年去掉。

    现在选项也是英文(cat / cap / cut 里点出 cat),释义换成例句 ——
    意思靠图和句子建立,不靠翻译。
  */
  word: [
    { mode: 'recognize', label: '认词', icon: '👀', desc: '看词想意思,再看例句', lowAgeFriendly: true, repeat: true },
    { mode: 'listenChoose', label: '听音选词', icon: '👂', desc: '听一听,选出听到的词', lowAgeFriendly: true, repeat: true },
    { mode: 'speakEn', label: '跟我读', icon: '🗣️', desc: '听范读→读出来→读例句', lowAgeFriendly: true, repeat: true },
    { mode: 'spell', label: '拼写', icon: '⌨️', desc: '把字母拼成这个词', lowAgeFriendly: true },
    { mode: 'dictation', label: '听写', icon: '✍️', desc: '听发音写单词', lowAgeFriendly: true },
    { mode: 'speak', label: '跟读', icon: '🎤', desc: '跟着读一遍', needsMic: true, lowAgeFriendly: true },
  ],
  poem: [
    { mode: 'recite', label: '朗读背诵', icon: '📖', desc: '听读并背诵', lowAgeFriendly: true, repeat: true },
    { mode: 'fillBlank', label: '补全诗句', icon: '✏️', desc: '选出缺的一句', lowAgeFriendly: true, repeat: true },
  ],
  hanzi: [
    { mode: 'recognize', label: '认字', icon: '👀', desc: '看字读音组词', lowAgeFriendly: true, repeat: true },
    { mode: 'listenChoose', label: '听音选字', icon: '👂', desc: '听读音选汉字', lowAgeFriendly: true, repeat: true },
    { mode: 'sayIt', label: '说给我听', icon: '🗣️', desc: '看字读出来,家长判对错', lowAgeFriendly: true, repeat: true },
    { mode: 'pinyin', label: '看拼音选字', icon: '🅿️', desc: '照着拼音找汉字', lowAgeFriendly: true },
  ],
  wrong: [{ mode: 'review', label: '重做', icon: '🔁', desc: '回想再自评', lowAgeFriendly: true, repeat: true }],
  fact: [
    { mode: 'quiz', label: '选一选', icon: '🧠', desc: '看题目选答案', lowAgeFriendly: true, repeat: true },
    { mode: 'review', label: '想一想', icon: '💭', desc: '先回想再翻答案自评', lowAgeFriendly: true, repeat: true },
  ],
  pic: [
    { mode: 'picChoose', label: '看图选一选', icon: '🖼️', desc: '看图片选名字', lowAgeFriendly: true },
    { mode: 'listenPic', label: '听音选图', icon: '👂', desc: '听声音点图片', lowAgeFriendly: true },
    { mode: 'picChooseEn', label: '英语·看图选词', icon: '🅰️', desc: '看图选英语单词', lowAgeFriendly: true },
    { mode: 'listenPicEn', label: '英语·听音选图', icon: '🎧', desc: '听英语点图片', lowAgeFriendly: true, repeat: true },
    { mode: 'earTrain', label: '磨耳朵', icon: '🎵', desc: '英语中文自动连播,不用操作', lowAgeFriendly: true, repeat: true },
    { mode: 'sayIt', label: '说给我听', icon: '🗣️', desc: '看图说出来,家长判对错', lowAgeFriendly: true, repeat: true },
    { mode: 'speakEn', label: '英语·跟我读', icon: '🎙️', desc: '听一遍,再读给爸爸妈妈听', lowAgeFriendly: true, repeat: true },
  ],
}

export function modesFor(itemType: CardItemType, lowAge: boolean): PracticeModeDef[] {
  const all = MODES_BY_TYPE[itemType] ?? []
  return lowAge ? all.filter((m) => m.lowAgeFriendly) : all
}

/**
 * 首页「🔄 再练一遍」放哪两个模式。
 *
 * 看图包给的是**磨耳朵**和**英语·听音选图** —— 这两个是英语输入量的来源,
 * 值得一遍一遍来;中文的看图选词孩子做两次就腻了,占着这个位置是浪费。
 * 万一哪种卡组一个都没标(以后新增类型时容易漏),退回取前两个,
 * 保证按钮不会凭空消失。
 */
export function repeatModesFor(itemType: CardItemType, lowAge: boolean): PracticeModeDef[] {
  const all = modesFor(itemType, lowAge)
  const marked = all.filter((m) => m.repeat)
  return (marked.length > 0 ? marked : all).slice(0, 2)
}
