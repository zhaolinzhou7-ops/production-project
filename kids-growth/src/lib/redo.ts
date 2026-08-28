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
    opts: {
      optionKind?: 'text' | 'emoji'
      emoji?: string
      audio?: string
      lang?: 'zh' | 'en'
    } = {},
  ): RedoSpec | undefined => {
    const a = String(answer ?? '').trim()
    if (!a) return undefined
    const options = optionsFrom(a, values)
    if (options.length < 2) return undefined
    return { type: 'choice', options, answer: a, ...opts }
  }

  /*
    **每一种练法都映射到「同一种答题方式」。**

    这是用户明确要的一条:错了什么类型的题,就归入什么类型的错题,不要换。
    听音选图错了,重做还是点图;看图选单词错了,重做还是选单词;
    拼写错了还是拼;跟我读错了还是读。

    换类型的坏处不只是「不一样」——「听英语点图」考的是听懂,
    「看图选单词」考的是认字形。把前者换成后者,等于用一道他没错的题
    去替换他真正错的那道,错题本就失去了意义。
  */
  switch (mode) {
    // ---- 听音选图:选项是**图** ----
    case 'listenPic':
      return choice(
        emoji ?? '',
        pool.map((c) => c.emoji ?? ''),
        { optionKind: 'emoji', audio: card.front, lang: 'zh' },
      )
    case 'listenPicEn':
      return choice(
        emoji ?? '',
        pool.map((c) => c.emoji ?? ''),
        { optionKind: 'emoji', audio: en, lang: 'en' },
      )
    // ---- 看图选名字:选项是**文字** ----
    case 'picChoose':
      return choice(
        card.front,
        pool.map((c) => c.front),
        { optionKind: 'text', emoji, audio: card.front, lang: 'zh' },
      )
    case 'picChooseEn':
      return choice(
        en,
        pool.map((c) => c.en ?? c.back),
        { optionKind: 'text', emoji, audio: en, lang: 'en' },
      )
    // ---- 识字:听读音选字 / 看拼音选字 ----
    case 'listenChoose':
      if (itemType === 'hanzi') {
        return choice(
          card.front,
          pool.map((c) => c.front),
          { optionKind: 'text', audio: card.front, lang: 'zh' },
        )
      }
      // 英语单词:听英文选英文,纯英文
      return choice(
        card.front,
        pool.map((c) => c.front),
        { optionKind: 'text', audio: card.front, lang: 'en' },
      )
    case 'pinyin':
      return choice(
        card.front,
        pool.map((c) => c.front),
        { optionKind: 'text', emoji: card.back, audio: card.front, lang: 'zh' },
      )
    // ---- 常识问答 ----
    case 'quiz':
      return choice(
        card.back,
        pool.map((c) => c.back),
        { optionKind: 'text', audio: card.front, lang: 'zh' },
      )
    // ---- 拼写 / 听写:还是让他拼一遍 ----
    case 'spell':
    case 'dictation': {
      const target = itemType === 'pic' ? en : card.front
      if (!target) return undefined
      return { type: 'spell', answer: target, emoji, audio: target }
    }
    // ---- 跟我读 / 说给我听:还是听范读、读出来、家长判 ----
    case 'speakEn':
    case 'speak': {
      const target = itemType === 'pic' ? en : card.front
      if (!target) return undefined
      return { type: 'speak', answer: target, emoji, audio: target }
    }
    case 'sayIt':
      return { type: 'speak', answer: card.front, emoji, audio: card.front }
    default:
      break
  }

  /*
    其余练法(磨耳朵、朗读背诵、补全诗句…)没有明确的对应形式。
    按内容类型退回到一个**不改变媒介**的选择题:
    看图卡给图选图,英语单词给词选词,其它给题干选答案。
  */
  if (itemType === 'pic') {
    return choice(
      emoji ?? '',
      pool.map((c) => c.emoji ?? ''),
      { optionKind: 'emoji', audio: en, lang: 'en' },
    )
  }
  if (itemType === 'word') {
    return choice(
      card.front,
      pool.map((c) => c.front),
      { optionKind: 'text', audio: card.front, lang: 'en' },
    )
  }
  return choice(
    card.back,
    pool.map((c) => c.back),
    { optionKind: 'text', audio: card.front, lang: 'zh' },
  )
}

/**
 * 给一张**没有重做规格**的错题现造一份。
 *
 * 为什么必须有:新做法只对「以后答错的题」生效,而错题本里已经攒着的那些
 * 一条 redo 都没有 —— 家长打开一看,和以前一模一样,会以为根本没改。
 *
 * 老卡上只有题干和答案,但**原题往往还在内容包里**:按题干/答案回去找到它,
 * 就能恢复出图、英文和所属类型,重做时就还是原来那种形式。
 * 找不到才退回按文本推断。
 *
 * `origin` 由调用方提供:传入孩子所有卡组的卡片,以及每张卡属于什么类型。
 */
export interface OriginCard extends RedoCard {
  itemType: string
  /** 同一个卡组里的其它卡,用作干扰项 */
  siblings: RedoCard[]
}

export function inferRedo(
  card: RedoCard,
  siblings: RedoCard[],
  findOrigin?: (card: RedoCard) => OriginCard | undefined,
): RedoSpec | undefined {
  const front = String(card.front ?? '').trim()
  const back = String(card.back ?? '').trim()
  if (!front && !back) return undefined

  // 纯数字答案 → 算术题,还是让他算
  if (/^-?\d+$/.test(back)) {
    return { type: 'input', answer: Number(back) }
  }

  /*
    先回内容包里找原题。
    找得到就按它的类型出题 —— 看图卡还是选图,单词还是选词,
    这样老错题也**不会被换成另一种题**。
  */
  const origin = findOrigin?.(card)
  if (origin) {
    const built = buildRedo({
      // 老卡没记当初是哪种练法;按内容类型给一个「最典型」的:
      // 看图卡=听英语点图(这是它最常错的一档),单词=听音选词
      mode: origin.itemType === 'pic' ? 'listenPicEn' : 'listenChoose',
      itemType: origin.itemType,
      card: origin,
      pool: origin.siblings,
    })
    if (built) return built
  }

  /*
    找不到原题(手动记的错题、内容包被移除过)才按文本推断。
    选择题的干扰项要「像」正确答案:答案是英文就配英文,是中文就配中文 ——
    一个中文选项混在四个英文里,等于直接告诉他答案是哪个。
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
    optionKind: 'text',
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
