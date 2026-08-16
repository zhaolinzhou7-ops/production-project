/**
 * 难度自适应。
 *
 * 间隔重复只管「什么时候再见到这张卡」,**完全不管「这组题对他是难还是易」**。
 * 结果是:他连续三天全对,题目不会变难;连续错三次,也不会变简单 ——
 * 一直待在同一个高度上。
 *
 * 而学习效率最高的地方,是**刚好够得着**的那一档:太简单没有增益,
 * 太难只会让他放弃。所以按最近几组的正确率自动升降。
 *
 * 判据故意保守:
 * - 升档要求高(≥90%)且要**连着两组**,免得他蒙对一组就被推上去
 * - 降档要求低(<50%)且**一组就降**,因为「太难」的伤害比「太简单」大得多 ——
 *   一个 4 岁半的孩子连着做错八题,下次就不肯打开了
 */

export interface RecentResult {
  total: number
  correct: number
}

export type Adjust = 'up' | 'down' | 'keep'

/** 一组的正确率(没做题时返回 -1,表示「没有信息」) */
export function rateOf(r: RecentResult): number {
  return r.total > 0 ? r.correct / r.total : -1
}

/**
 * 该升、该降,还是保持。
 * `recent` 按时间**倒序**传入(最近的在前),只看前两组。
 */
export function adjustFor(recent: RecentResult[]): Adjust {
  const rated = recent.filter((r) => r.total >= 4).slice(0, 2)
  if (rated.length === 0) return 'keep'

  // 太难先判:一组就够,不等第二组
  if (rateOf(rated[0]) < 0.5) return 'down'

  // 太简单要连着两组都很高才升
  if (rated.length >= 2 && rated.every((r) => rateOf(r) >= 0.9)) return 'up'
  return 'keep'
}

/**
 * 难度档位 0–4,对应「一组几题」和「几个选项」。
 *
 * 调的是**题量**和**选项数**,而不是换一批更难的词 ——
 * 对幼儿来说,四选一变二选一带来的难度差,比换词大得多,
 * 而且不需要为此准备分级内容。
 */
export interface LevelSpec {
  /** 一组几题 */
  size: number
  /** 几个选项(含正确答案) */
  choices: number
  label: string
}

const LEVELS: LevelSpec[] = [
  { size: 4, choices: 2, label: '入门' },
  { size: 6, choices: 3, label: '轻松' },
  { size: 6, choices: 4, label: '正常' },
  { size: 8, choices: 4, label: '进阶' },
  { size: 10, choices: 5, label: '挑战' },
]

export function specOf(level: number): LevelSpec {
  const i = Math.max(0, Math.min(LEVELS.length - 1, Math.round(level)))
  return LEVELS[i]
}

export function nextLevel(level: number, adjust: Adjust): number {
  if (adjust === 'up') return Math.min(LEVELS.length - 1, level + 1)
  if (adjust === 'down') return Math.max(0, level - 1)
  return level
}

export const LEVEL_COUNT = LEVELS.length


/**
 * 练法阶梯 —— 难度真正被感觉到的地方。
 *
 * 原先难度档只调「一组几题」和「几个选项」。孩子的感受是:
 * **每次都一样**。因为对他来说,题目长得一模一样,只是少了一个选项。
 *
 * 真正的难度是**认知方式**在变:
 *   听中文点图(不用认字) → 看图选中文 → 看图选英文 → 自己说出来
 * 这四步一步比一步难,而且孩子一眼就能感觉到「变了」。
 *
 * 最后一档是**产出** —— 四选一有 25% 蒙对率,而说出来没有。
 * 一个内容真正学会的标志,是他能说出来,不是能认出来。
 */
export function modeLadder(itemType: string, level: number): string | undefined {
  const l = Math.max(0, Math.min(LEVELS.length - 1, Math.round(level)))
  if (itemType === 'pic') {
    /*
      五档要**平滑**:中间不能出现断崖。
      原先第 2 档直接是「看图选英文」,而新卡组默认就在第 2 档 ——
      一个刚开始的孩子上来就要认英文单词,太跳了。
      现在英语是分两步进来的:先「听英文点图」(只要听得懂),
      再「看图选英文」(要认得出),最后才是「读出来」。
    */
    return ['listenPic', 'picChoose', 'listenPicEn', 'picChooseEn', 'speakEn'][l]
  }
  if (itemType === 'hanzi') {
    return ['listenChoose', 'listenChoose', 'recognize', 'recognize', 'sayIt'][l]
  }
  if (itemType === 'word') {
    return ['listenChoose', 'listenChoose', 'recognize', 'speak', 'spell'][l]
  }
  return undefined
}
