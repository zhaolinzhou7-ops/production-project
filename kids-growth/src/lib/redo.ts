import type { RedoSpec } from '../types'

/**
 * 错题「怎么重做」的构造。
 *
 * 关键判断:干扰项要在**答错的当下**就定下来,和卡一起存起来。
 * 如果等到重做时再现算,干扰项换了一批,那就不是「重做这道题」,
 * 是另出了一道题 —— 孩子上次踩的那个坑不会再出现,错题本也就白记了。
 *
 * 选项给到 5 个(A–E)。为什么不是 4 个:重做时孩子已经见过这道题一次,
 * 蒙对的概率本来就高;多一个选项把蒙对率从 25% 压到 20%,
 * 而对他的负担几乎没有变化。
 */

export interface RedoCard {
  front: string
  back: string
  emoji?: string
  en?: string
}

export const REDO_OPTION_COUNT = 5

/** A B C D E —— 界面上给每个选项一个字母,家长报题、孩子指认都方便 */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

/** 从池子里挑不重复的干扰项,凑够 count 个选项(含答案) */
function optionsFrom(answer: string, pool: string[], count = REDO_OPTION_COUNT): string[] {
  const seen = new Set<string>([answer])
  const distractors: string[] = []
  for (const v of shuffle(pool)) {
    const t = String(v ?? '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    distractors.push(t)
    if (distractors.length >= count - 1) break
  }
  return shuffle([answer, ...distractors])
}

/**
 * 按「当初是怎么答错的」造一份重做规格。
 *
 * 返回 undefined 表示这道题没法做成选择题(比如池子里凑不出第二个选项),
 * 那就退回原来的「看题回想」—— 但那种情况现在很少。
 */
export function buildRedo(params: {
  mode: string
  itemType: string
  card: RedoCard
  pool: RedoCard[]
}): RedoSpec | undefined {
  const { mode, itemType, card, pool } = params
  const emoji = card.emoji
  const en = card.en ?? card.back

  /** 造一个选择题 */
  const choice = (
    answer: string,
    values: string[],
    opts: { emoji?: string; audio?: string; lang?: 'zh' | 'en' } = {},
  ): RedoSpec | undefined => {
    const a = String(answer ?? '').trim()
    if (!a) return undefined
    const options = optionsFrom(a, values)
    if (options.length < 2) return undefined
    return { type: 'choice', options, answer: a, ...opts }
  }

  switch (mode) {
    // ---- 看图:选中文名 ----
    case 'picChoose':
      return choice(
        card.front,
        pool.map((c) => c.front),
        { emoji, audio: card.front, lang: 'zh' },
      )
    // ---- 看图:选英文 —— 纯英文,不给中文 ----
    case 'picChooseEn':
      return choice(
        en,
        pool.map((c) => c.en ?? c.back),
        { emoji, audio: en, lang: 'en' },
      )
    // ---- 听音选图:选项是图 ----
    case 'listenPic':
      return choice(
        emoji ?? '',
        pool.map((c) => c.emoji ?? ''),
        { audio: card.front, lang: 'zh' },
      )
    case 'listenPicEn':
      return choice(
        emoji ?? '',
        pool.map((c) => c.emoji ?? ''),
        { audio: en, lang: 'en' },
      )
    // ---- 识字:听读音选字 / 看拼音选字 ----
    case 'listenChoose':
      if (itemType === 'hanzi') {
        return choice(
          card.front,
          pool.map((c) => c.front),
          { audio: card.front, lang: 'zh' },
        )
      }
      return choice(
        card.back,
        pool.map((c) => c.back),
        { audio: card.front, lang: 'en' },
      )
    case 'pinyin':
      return choice(
        card.front,
        pool.map((c) => c.front),
        { emoji: card.back, audio: card.front, lang: 'zh' },
      )
    // ---- 常识问答 ----
    case 'quiz':
      return choice(
        card.back,
        pool.map((c) => c.back),
        { audio: card.front, lang: 'zh' },
      )
    default:
      break
  }

  /*
    其余练法(认一认、跟读、说给我听…)没有现成的选项,但错题**仍然要能重做**。
    按内容类型退回到一个通用的选择题:
    - 看图卡:给图,选名字
    - 英语单词:给单词,选另一个单词 —— 纯英文,不出现中文
    - 其它:给题干,选答案
  */
  if (itemType === 'pic') {
    return choice(
      card.front,
      pool.map((c) => c.front),
      { emoji, audio: card.front, lang: 'zh' },
    )
  }
  if (itemType === 'word') {
    return choice(
      card.front,
      pool.map((c) => c.front),
      { audio: card.front, lang: 'en' },
    )
  }
  return choice(
    card.back,
    pool.map((c) => c.back),
    { audio: card.front, lang: 'zh' },
  )
}
