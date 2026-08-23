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

/**
 * 给一张**没有重做规格**的错题现造一份。
 *
 * 为什么必须有:新做法只对「以后答错的题」生效,而错题本里已经攒着的那些
 * 一条 redo 都没有 —— 家长打开一看,和以前一模一样,会以为根本没改。
 * 这类「新功能只对新数据生效」的坑,用户一定会踩,而且踩了会觉得白改。
 *
 * 老卡上只有题干和答案,信息比当初少,所以靠推断:
 * - 答案是**纯数字** → 算术题,让他重新算一遍(输入)
 * - 其它 → 选择题,干扰项从错题本里**别的题的答案**里挑
 *
 * 干扰项来自同一个错题本,所以它们本身就是他做错过的东西 ——
 * 作为干扰项比随便造几个假选项更有意义。
 */
export function inferRedo(card: RedoCard, siblings: RedoCard[]): RedoSpec | undefined {
  const front = String(card.front ?? '').trim()
  const back = String(card.back ?? '').trim()
  if (!front && !back) return undefined

  // 纯数字答案 → 算术题,还是让他算
  if (/^-?\d+$/.test(back)) {
    return { type: 'input', answer: Number(back) }
  }

  /*
    选择题的干扰项要「像」正确答案:
    答案是英文就配英文,是中文就配中文 —— 一个中文选项混在四个英文里,
    等于直接告诉他答案是哪个。
  */
  const sameShape = (v: string) => isLatin(back) === isLatin(v)
  const pool = siblings
    .map((c) => String(c.back ?? '').trim())
    .filter((v) => v && v !== back && !/^-?\d+$/.test(v) && sameShape(v))

  if (pool.length === 0) return undefined
  const options = optionsFrom(back, pool)
  if (options.length < 2) return undefined

  /*
    点一下要能读出来。
    读什么:答案是英文就读英文(他要记的是那个词的发音),
    否则读题干(中文题目念一遍,不识字的孩子才知道这题问什么)。
  */
  const audio = isLatin(back) ? back : front
  return {
    type: 'choice',
    options,
    answer: back,
    audio: audio || undefined,
    lang: isLatin(audio) ? 'en' : 'zh',
    emoji: card.emoji || pickEmoji(front),
  }
}

/** 是不是英文(只含拉丁字母、空格和常见标点) */
function isLatin(s: string): boolean {
  return /^[A-Za-z][A-Za-z\s'’.\-!?]*$/.test(String(s ?? '').trim())
}

/**
 * 从题干里把开头的图捞出来。
 * 老的看图错题题干长这样:「🐱 这是什么?」—— 那个 emoji 就是原来的图,
 * 拿回来当题面,孩子一眼就认得出是哪道题。
 */
function pickEmoji(front: string): string | undefined {
  const m = String(front ?? '').trim().match(/^(\p{Extended_Pictographic}+)/u)
  return m ? m[1] : undefined
}
