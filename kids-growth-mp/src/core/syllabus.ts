/**
 * 内容顺序(教学大纲)。
 *
 * 现在的难度递增只发生在**练法**上:听 → 认 → 说 → 拼 → 听写。
 * 而**内容**是平摊的 —— 装了十个包,六百个词从第一天起就一起轮。
 * 后果是他每一样都碰一点、每一样都不熟,两个月后词还是那六百个,
 * 而且没有一个到了「脱口而出」的程度。
 *
 * 语言学习在这一点上的结论很一致:**先把最高频的一小批练到自动化,
 * 再开下一批**,比同时铺开六百个有效得多。二百个高频词能覆盖日常口语的
 * 一大半,而第 401–600 个词在他这个年纪几乎用不到。
 *
 * 所以这里给内容包排一个顺序,并定义「什么时候该开下一包」:
 * 当前这一批**练熟了**才开新的,而不是家长凭感觉一次全装上。
 */

/** 每一批的推荐顺序;越靠前越该先学 */
export interface SyllabusStep {
  key: string
  /** 第几批(同一批里的包可以一起学) */
  batch: number
  /** 为什么这个排在这里 —— 家长看得懂才会照着走 */
  why: string
}

/**
 * 启蒙阶段的推荐顺序。
 *
 * 排序依据是**他每天真的会用到的频率**,不是学科分类:
 * 第 1 批全是他睁眼就能指着说的东西(家人、身体、食物、动物);
 * 第 2 批是描述词(颜色、数字、感受)—— 有了名词才谈得上形容;
 * 第 3 批是场景扩展;字母和自然拼读放在最后 ——
 * **先会说再会拼**,这个顺序反过来是绝大多数英语启蒙走弯路的地方。
 */
export const TODDLER_SYLLABUS: SyllabusStep[] = [
  { key: 'enlight-family', batch: 1, why: '每天都在说的人:妈妈、爸爸、宝宝' },
  { key: 'enlight-animals', batch: 1, why: '这个年纪最感兴趣、也最容易记住的一类' },
  { key: 'enlight-food', batch: 1, why: '一日三餐都在用,张口的机会最多' },
  { key: 'enlight-body', batch: 1, why: '能配着动作学:摸摸鼻子、拍拍手' },

  { key: 'enlight-colors', batch: 2, why: '有了名词才谈得上形容:a red apple' },
  { key: 'enlight-numbers', batch: 2, why: '数数是数学和英语的交叉点,两边都用得上' },
  { key: 'enlight-feelings', batch: 2, why: '会说「我很难过」比会说十个名词更有用' },
  { key: 'enlight-actions', batch: 2, why: '动词一到,他就能造句了:I can jump' },

  { key: 'enlight-home', batch: 3, why: '家里的东西,随时能指着实物复习' },
  { key: 'enlight-clothes', batch: 3, why: '每天穿衣服时就能问一遍' },
  { key: 'enlight-transport', batch: 3, why: '出门路上全是教具' },
  { key: 'enlight-weather', batch: 3, why: '每天早上都能问一句 How is the weather' },

  { key: 'enlight-nature', batch: 4, why: '去公园时用得上' },
  { key: 'enlight-sea', batch: 4, why: '兴趣向:很多孩子在这一包上格外投入' },
  { key: 'enlight-sports', batch: 4, why: '把英语和运动连起来' },
  { key: 'enlight-school', batch: 4, why: '为上幼儿园/小学的场景做准备' },
  { key: 'enlight-shapes', batch: 4, why: '形状是数学启蒙的一部分' },

  /*
    字母和自然拼读**放在最后**。
    这一条和很多家长的直觉相反:字母表通常是第一个被教的东西。
    但对 4–6 岁来说,**先积累口语词汇、再学字母和拼读**效果好得多 ——
    拼读的意义是「把听过的词拼出来」,他脑子里没有那些词的时候,
    拼读就只是背 26 个符号。
  */
  { key: 'enlight-abc', batch: 5, why: '先会说再认字母 —— 拼读是给已经听熟的词用的' },
  { key: 'phonics-cvc', batch: 5, why: '自然拼读:把听熟的词自己拼出来' },
]

/** 一包算「练熟」的门槛:掌握 70% */
export const MASTER_THRESHOLD = 0.7

export interface PackProgress {
  key: string
  /** 这一包已经装了没有 */
  installed: boolean
  /** 总卡数 */
  total: number
  /** 已经进入长期记忆的卡数(status === 'mastered' 或间隔够长) */
  mastered: number
}

export interface SyllabusAdvice {
  /** 现在该练哪几包(已装、且还没练熟的) */
  focus: string[]
  /** 下一个该装的包;没有就是 undefined */
  nextKey?: string
  nextWhy?: string
  /** 当前这一批的掌握进度 0–100 */
  batchPct: number
  /** 给家长的一句话 */
  note: string
}

/**
 * 现在该学什么、什么时候开下一包。
 *
 * 规则:
 * 1. 已装但没练熟的包 —— 那就是「现在该练的」
 * 2. 手上这些**练熟了**才推荐下一包
 * 3. 同时在学的包不超过 4 个 —— 再多就又变成平摊了
 */
export function adviseSyllabus(
  progress: PackProgress[],
  syllabus: SyllabusStep[] = TODDLER_SYLLABUS,
): SyllabusAdvice {
  const byKey = new Map(progress.map((p) => [p.key, p]))
  const rateOf = (p?: PackProgress) => (p && p.total > 0 ? p.mastered / p.total : 0)

  const installed = syllabus.filter((s) => byKey.get(s.key)?.installed)
  const unfinished = installed.filter((s) => rateOf(byKey.get(s.key)) < MASTER_THRESHOLD)

  // 当前这一批 = 已装且没练熟的里面,批次最小的那一批
  const curBatch = unfinished.length > 0 ? Math.min(...unfinished.map((s) => s.batch)) : 0
  const focus = unfinished.filter((s) => s.batch === curBatch).map((s) => s.key)

  const batchPacks = installed.filter((s) => s.batch === curBatch)
  const batchPct =
    batchPacks.length > 0
      ? Math.round(
          (batchPacks.reduce((n, s) => n + rateOf(byKey.get(s.key)), 0) / batchPacks.length) * 100,
        )
      : 100

  /*
    同时在学的包不超过 4 个。
    超了就不推荐新的 —— 再装下去又回到「平摊六百个词」那个老问题。
  */
  const TOO_MANY = 4
  let nextKey: string | undefined
  let nextWhy: string | undefined
  if (unfinished.length < TOO_MANY) {
    const next = syllabus.find((s) => !byKey.get(s.key)?.installed)
    if (next) {
      nextKey = next.key
      nextWhy = next.why
    }
  }

  let note: string
  if (installed.length === 0) {
    note = '还没有装内容包。按下面的顺序一批一批来,比一次全装上有效得多。'
  } else if (unfinished.length === 0) {
    note = '手上的内容都练熟了 —— 可以开新的一批了。'
  } else if (unfinished.length >= TOO_MANY) {
    note = `同时在学 ${unfinished.length} 包,已经偏多了。先把手上的练熟(${batchPct}%),再开新的 —— 同时铺开的话哪一包都熟不了。`
  } else {
    note = `当前这一批练到 ${batchPct}%,练到 ${Math.round(MASTER_THRESHOLD * 100)}% 就可以开下一批。`
  }

  return { focus, nextKey, nextWhy, batchPct, note }
}
