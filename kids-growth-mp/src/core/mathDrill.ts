import type { AgeStage, MathVisual } from '../types'

/** 口算题型 */
export type MathKind =
  // 幼儿档(大班 / 幼小衔接):从「数得清」到「算得出」,一小步一小步来
  | 'count10'
  | 'add10'
  | 'sub10'
  | 'makeTen'
  | 'compare'
  | 'add20'
  // 幼小衔接:20 以内退位减、连加连减、序数、分一半
  | 'sub20'
  | 'chain'
  | 'ordinal'
  | 'half'
  // 思维启蒙(真正的「幼儿奥数」不是竖式,是规律/空间/推理)
  | 'pattern'
  | 'countShape'
  // 幼小衔接:看图列式(从「会算」到「看懂题」)
  | 'picAdd'
  | 'picSub'
  | 'picDiff'
  // 思维板块:方位、分类、量的比较、推理、专注力
  | 'position'
  | 'oddOne'
  | 'sizeCmp'
  | 'logic3'
  | 'spotDiff'
  // 小学及以上
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mulTable'
  | 'mixed'
  // 进阶思维:周期、等量代换、图形计数、数列
  | 'cycle'
  | 'swap'
  | 'countRect'
  | 'series'
  | 'enumerate'
  | 'clever'
  // 中高年级经典奥数专题
  | 'sumDiff'
  | 'ageDiff'
  | 'tree'
  | 'chicken'
  | 'profitLoss'
  | 'average'

/**
 * 实物图示。
 *
 * **只用在本来就是「看图数数」的题型上**(数一数、看图合起来、看图拿走…),
 * 算式题一律不配图。
 *
 * 上一版把图铺到了所有算式题上,想法是「数形结合」,实际结果是
 * **每道题都变成了数糖果** —— 他不再算 7+5,而是低头数十二颗糖。
 * 对一个 20 以内加减已经做得不错的孩子,这是退步:数出来又慢又容易错,
 * 而且练不出数感。图该出现在看图题里,算式题就该是干干净净的算式。
 *
 * 图示按**每行五个**排。五个一组是数数教学里的标准做法 ——
 * 它让孩子逐渐建立「五」这个基准量,以后看到七个能一眼认出「五加二」,
 * 而不是每次都从一数到七。挤成一长排则相反:数到一半就乱了。
 */
export type { MathVisual } from '../types'

export interface MathProblem {
  /** 题干,如 "7 + 8 =" */
  text: string
  answer: number
  /** 数形结合图示;题目太大(超过 20 个)时不给,画出来反而数不清 */
  visual?: MathVisual
}

/** 图示里用的实物 —— 都是孩子认得、且一眼能数清的 */
const COUNTABLES = ['🍬', '🍎', '⭐', '🐟', '🎈', '🍪', '🐤', '🍓']

/**
 * 造一个图示。
 *
 * 总数超过 20 就不给图 —— 一排二十几个 emoji 在手机上要换行三次,
 * 孩子数到一半就乱了,那时候图示反而变成干扰。
 */
function visualOf(groups: Array<{ emoji: string; n: number }>, ops: string[], strike?: number): MathVisual | undefined {
  const total = groups.reduce((n, g) => n + g.n, 0)
  if (total <= 0 || total > 20) return undefined
  return { groups, ops, strike }
}

/**
 * 把 n 个东西排成**每行五个**。
 *
 * 五个一组是数数教学里的标准做法:孩子逐渐建立「五」这个基准量,
 * 以后看到七个能一眼认出「五加二」,而不是每次从一数到七。
 * 挤成一长排则相反 —— 数到一半就乱了,而且他会以为「数错」是自己的问题。
 */
function rowsOfFive(emoji: string, n: number): MathVisual | undefined {
  if (n <= 0 || n > 20) return undefined
  const groups: Array<{ emoji: string; n: number }> = []
  let left = n
  while (left > 0) {
    const take = Math.min(5, left)
    groups.push({ emoji, n: take })
    left -= take
  }
  // 行与行之间不放任何符号 —— 这是「同一堆东西的换行」,不是两堆相加
  return { groups, ops: groups.slice(1).map(() => '') }
}

export interface MathKindDef {
  kind: MathKind
  label: string
  icon: string
  desc: string
  /** 归到哪一组(见 MATH_GROUPS)—— 用来把长长的题型清单收成几块 */
  group: MathGroup
}

/**
 * 题型分组。
 *
 * 为什么要分组:光幼儿档就有 20 个题型,平铺在屏幕上是一面「题型墙」。
 * 家长每天晚上要在这面墙里挑一个 —— 挑不动,最后固定点同一个,
 * 后面十几个等于不存在。
 *
 * 分成五块之后,每块 3–5 个,而且每块可以**整组随机**:
 * 家长点「加法·随便来」就行,不必逐个题型去想今天练哪个。
 */
export type MathGroup = 'count' | 'plus' | 'minus' | 'mixed' | 'think' | 'times' | 'olympic'

export interface MathGroupDef {
  group: MathGroup
  label: string
  icon: string
  desc: string
}

export const MATH_GROUPS: MathGroupDef[] = [
  { group: 'count', label: '数与比较', icon: '🔢', desc: '数得清、排第几、谁多谁少' },
  { group: 'plus', label: '加法', icon: '➕', desc: '10/20 以内加法、凑十、看图合起来' },
  { group: 'minus', label: '减法', icon: '➖', desc: '10/20 以内减法、看图拿走' },
  { group: 'mixed', label: '连算与分配', icon: '➰', desc: '连加连减、平均分' },
  { group: 'times', label: '乘除', icon: '✖️', desc: '乘法口诀、乘法、除法、四则混合' },
  { group: 'think', label: '找规律·动脑', icon: '🧩', desc: '规律、方位、分类、推理、专注' },
  { group: 'olympic', label: '奥数专题', icon: '🏅', desc: '和差、年龄、植树、鸡兔同笼…' },
]

export function getMathGroupDef(group: MathGroup): MathGroupDef | undefined {
  return MATH_GROUPS.find((g) => g.group === group)
}

/**
 * 题型清单。
 *
 * 幼儿档是按大班/幼小衔接的实际进度切的 —— 5-6 岁不该一上来就做抽象算式:
 * 先「数得清」(数一数),再 10 以内加、减分开练熟,然后凑十,最后才是进位加。
 * 每一档都窄到孩子能连着做对,做对本身就是继续的动力。
 */
export const MATH_KINDS: MathKindDef[] = [
  { kind: 'count10', label: '数一数', icon: '🔢', desc: '数图形有几个(10 以内)' , group: 'count' },
  { kind: 'add10', label: '10 以内加法', icon: '➕', desc: '和不超过 10' , group: 'plus' },
  { kind: 'sub10', label: '10 以内减法', icon: '➖', desc: '10 以内,不出现负数' , group: 'minus' },
  { kind: 'makeTen', label: '凑十', icon: '🔟', desc: '几加几等于 10' , group: 'plus' },
  { kind: 'compare', label: '比大小', icon: '⚖️', desc: '哪个多、哪个少' , group: 'count' },
  { kind: 'add20', label: '20 以内进位加', icon: '🧮', desc: '9+5 这类,幼小衔接重点' , group: 'plus' },
  { kind: 'sub20', label: '20 以内退位减', icon: '🔻', desc: '13-5 这类,和进位加配套' , group: 'minus' },
  { kind: 'chain', label: '连加连减', icon: '➰', desc: '3+4-2 这类,一步一步算' , group: 'mixed' },
  { kind: 'ordinal', label: '排第几', icon: '🥇', desc: '从前数第几个' , group: 'count' },
  { kind: 'half', label: '分一分', icon: '🍰', desc: '平均分,除法的地基' , group: 'mixed' },
  { kind: 'pattern', label: '找规律', icon: '🔍', desc: '接着往下填什么' , group: 'think' },
  { kind: 'countShape', label: '数图形', icon: '🔺', desc: '数一数有几个' , group: 'count' },
  { kind: 'picAdd', label: '看图·合起来', icon: '🧺', desc: '两堆合在一起有几个' , group: 'plus' },
  { kind: 'picSub', label: '看图·拿走了', icon: '✋', desc: '走掉一些,还剩几个' , group: 'minus' },
  { kind: 'picDiff', label: '看图·多几个', icon: '⚖️', desc: '哪边多,多几个' , group: 'minus' },
  { kind: 'position', label: '认方位', icon: '🧭', desc: '从左数、从右数,排第几' , group: 'count' },
  { kind: 'oddOne', label: '找不同类', icon: '🧩', desc: '哪个不是一伙的' , group: 'think' },
  { kind: 'sizeCmp', label: '比长短', icon: '📏', desc: '哪个长、哪个高' , group: 'count' },
  { kind: 'logic3', label: '想一想', icon: '💭', desc: '谁最高、谁最快' , group: 'think' },
  { kind: 'spotDiff', label: '找不同', icon: '👀', desc: '两排里哪个不一样' , group: 'think' },
  { kind: 'add', label: '加法', icon: '➕', desc: '两数相加' , group: 'plus' },
  { kind: 'sub', label: '减法', icon: '➖', desc: '两数相减(不为负)' , group: 'minus' },
  { kind: 'mulTable', label: '乘法口诀', icon: '✖️', desc: '九九乘法表' , group: 'times' },
  { kind: 'mul', label: '乘法', icon: '⏫', desc: '含两位数乘一位数' , group: 'times' },
  { kind: 'div', label: '除法', icon: '➗', desc: '整除,无余数' , group: 'times' },
  { kind: 'mixed', label: '混合', icon: '🎲', desc: '四则混合随机' , group: 'times' },
  { kind: 'series', label: '数列找规律', icon: '📈', desc: '2,4,8,16… 接下来是几' , group: 'olympic' },
  { kind: 'cycle', label: '周期问题', icon: '🔁', desc: '重复排下去,第 N 个是什么' , group: 'olympic' },
  { kind: 'swap', label: '等量代换', icon: '⚖️', desc: '1 个换 2 个,那 3 个换几个' , group: 'olympic' },
  { kind: 'countRect', label: '图形计数', icon: '▦', desc: '一共能数出几个长方形' , group: 'olympic' },
  { kind: 'enumerate', label: '有几种搭配', icon: '👕', desc: '简单枚举:一共几种穿法' , group: 'olympic' },
  { kind: 'clever', label: '巧算', icon: '⚡', desc: '1+2+3+…,不用一个个加' , group: 'olympic' },
  { kind: 'sumDiff', label: '和差问题', icon: '➕➖', desc: '知道和与差,求那两个数' , group: 'olympic' },
  { kind: 'ageDiff', label: '年龄问题', icon: '👨‍👦', desc: '年龄差是不会变的' , group: 'olympic' },
  { kind: 'tree', label: '植树问题', icon: '🌳', desc: '每隔几米栽一棵,要几棵' , group: 'olympic' },
  { kind: 'chicken', label: '鸡兔同笼', icon: '🐔', desc: '数头又数脚' , group: 'olympic' },
  { kind: 'profitLoss', label: '盈亏问题', icon: '🍬', desc: '多了几个、少了几个' , group: 'olympic' },
  { kind: 'average', label: '平均数', icon: '📊', desc: '匀一匀,每份是多少' , group: 'olympic' },
]

export function getMathKindDef(kind: MathKind): MathKindDef | undefined {
  return MATH_KINDS.find((k) => k.kind === kind)
}

const TODDLER_KINDS: MathKind[] = [
  'count10', 'add10', 'sub10', 'makeTen', 'compare',
  'add20', 'sub20', 'chain', 'ordinal', 'half', 'pattern', 'countShape',
  // 幼小衔接:看图列式 —— 从「会算 5+3」到「看懂一幅图知道该用加法」,
  // 是完全不同的两件事,而一年级立刻就考后者
  'picAdd', 'picSub', 'picDiff',
  // 4–6 岁真正的思维板块:方位、分类、比较、推理、专注力
  'position', 'oddOne', 'sizeCmp', 'logic3', 'spotDiff',
]

/**
 * 思维档(低年级奥数入门)。
 * 和「算得快」是两回事 —— 考的是想法:看出藏在后面的那条规则。
 */
const OLYMPIC_KINDS: MathKind[] = [
  'series', 'cycle', 'swap', 'countRect', 'enumerate', 'clever',
]

/** 奥数档:中高年级经典专题。名字听着吓人,但每一个都有一句话的窍门 */
const ADVANCED_KINDS: MathKind[] = [
  'sumDiff', 'ageDiff', 'tree', 'chicken', 'profitLoss', 'average',
]

/**
 * 难度档。
 *
 * 为什么要把它和「学段」分开:学段存在本地存储里,一旦清过数据就退回默认的
 * 「小学」,孩子第二天打开发现口算全变成了两位数乘除 —— 他不知道发生了什么,
 * 只知道「我做不出来了」。难度必须是**页面上看得见、随手能换**的东西,
 * 而不是藏在别处、还会被一次清缓存悄悄改掉的设置。
 */
export type MathTier = 'toddler' | 'school' | 'olympic' | 'advanced'

export interface MathTierDef {
  tier: MathTier
  label: string
  desc: string
}

export const MATH_TIERS: MathTierDef[] = [
  { tier: 'toddler', label: '幼儿档', desc: '10/20 以内加减、凑十、找规律、数图形' },
  { tier: 'school', label: '小学档', desc: '加减乘除、乘法口诀、混合运算' },
  { tier: 'olympic', label: '思维档', desc: '找规律、周期、等量代换、图形计数、巧算' },
  { tier: 'advanced', label: '奥数档', desc: '和差、年龄、植树、鸡兔同笼、盈亏、平均数' },
]

/** 学段对应的默认难度档(只作默认值,页面上随时可改) */
export function defaultTierFor(stage: AgeStage): MathTier {
  return stage === 'toddler' ? 'toddler' : 'school'
}

/**
 * 某一档里的题型,**按组分好**。
 *
 * 只返回这一档真的有题的组 —— 空组不该在屏幕上占一行。
 */
export function mathGroupsForTier(tier: MathTier): Array<{ def: MathGroupDef; kinds: MathKindDef[] }> {
  const kinds = mathKindsForTier(tier)
  const out: Array<{ def: MathGroupDef; kinds: MathKindDef[] }> = []
  for (const def of MATH_GROUPS) {
    const mine = kinds.filter((k) => k.group === def.group)
    if (mine.length > 0) out.push({ def, kinds: mine })
  }
  return out
}

/**
 * 整组随机出题 —— 家长点一下「加法·随便来」就能开始。
 *
 * 这是分组之后最有用的一件事:他不必先想「今天练 10 以内加法还是凑十」,
 * 而那个念头正是每天晚上最容易卡住的地方。
 * 组内几个题型轮着出,顺带也避免了连做二十道同一种题的枯燥。
 */
export function generateGroupDrill(kinds: MathKind[], count: number, stage: AgeStage): MathProblem[] {
  const list = kinds.filter(Boolean)
  if (list.length === 0) return []
  const out: MathProblem[] = []
  for (let i = 0; i < count; i++) {
    // 轮着来而不是纯随机:纯随机常常连着出五道同一种,那就白分组了
    out.push(generateProblem(list[i % list.length], stage))
  }
  // 再打乱一次,免得顺序太规律被他摸出来
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = out[i]
    out[i] = out[j]
    out[j] = t
  }
  return out
}

/** 某一档里有哪些题型 */
export function mathKindsForTier(tier: MathTier): MathKindDef[] {
  if (tier === 'toddler') return MATH_KINDS.filter((k) => TODDLER_KINDS.includes(k.kind))
  if (tier === 'olympic') return MATH_KINDS.filter((k) => OLYMPIC_KINDS.includes(k.kind))
  if (tier === 'advanced') return MATH_KINDS.filter((k) => ADVANCED_KINDS.includes(k.kind))
  return MATH_KINDS.filter(
    (k) =>
      !TODDLER_KINDS.includes(k.kind) &&
      !OLYMPIC_KINDS.includes(k.kind) &&
      !ADVANCED_KINDS.includes(k.kind),
  )
}

/** 这个题型属于哪一档 —— 用来把「上次选的题型」还原到对的档上 */
export function tierOfKind(kind: MathKind): MathTier {
  if (TODDLER_KINDS.includes(kind)) return 'toddler'
  if (OLYMPIC_KINDS.includes(kind)) return 'olympic'
  if (ADVANCED_KINDS.includes(kind)) return 'advanced'
  return 'school'
}

/**
 * 按学段给题型(保留旧签名,内部走难度档)。
 * 幼儿看到的是「数一数 / 10 以内加 / 10 以内减 / 凑十 / 比大小 / 进位加」,
 * 不会看到乘除 —— 摆在那里只会让孩子挫败。
 */
export function mathKindsFor(stage: AgeStage): MathKindDef[] {
  return mathKindsForTier(defaultTierFor(stage))
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 按学段决定加减法的取值上限(幼儿 10 以内 / 小学 100 以内 / 更大 1000 以内) */
function addSubMax(stage: AgeStage): number {
  if (stage === 'toddler') return 10
  if (stage === 'primary') return 100
  return 1000
}

// ---------------- 幼儿档 ----------------

/** 数一数:用图形代替抽象数字,5-6 岁最先要过的一关 */
function genCount10(): MathProblem {
  const shapes = ['🍎', '⭐', '🐟', '🌸', '🚗', '🐤', '🍬', '🎈']
  const n = randInt(2, 10)
  const emoji = pick(shapes)
  /*
    题干里**不再塞图**。

    原先是把十个 emoji 拼进题干字符串里,和问题挤在一起 ——
    换行靠 \n、间距靠运气,一行十个挤成一坨,孩子根本数不清,
    家长看到的就是「表达很有问题」。
    现在图交给 visual(每行五个、可以点着数),题干只留那句问题。
  */
  return { text: `数一数,一共有几个 ${emoji}?`, answer: n, visual: rowsOfFive(emoji, n) }
}

/**
 * 纯算式题**不配图**。
 *
 * 上一版给 10/20 以内加减、凑十、连加连减、比大小都配了实物图,
 * 想法是「数形结合」。用户试下来的结果是:**每道题都变成了数糖果** ——
 * 他不再算 7+5,而是低头数十二颗糖。对一个 20 以内加减已经做得不错的孩子,
 * 这是**退步**:数出来又慢又容易错,而且练不出数感。
 *
 * 数形结合本身没错,错在把它铺到所有题上。图该出现在**本来就是看图数数**
 * 的题型里(数一数、看图合起来、看图拿走、比长短…),那些题型家长可以
 * 单独选;算式题就该是干干净净的算式。
 */

/** 10 以内加法:和不超过 10,先把「不进位」练熟 */
function genAdd10(): MathProblem {
  const a = randInt(1, 8)
  const b = randInt(1, 9 - a + 1)
  return { text: `${a} + ${b} =`, answer: a + b }
}

/** 10 以内减法:结果不为负 */
function genSub10(): MathProblem {
  const a = randInt(2, 10)
  const b = randInt(1, a)
  return { text: `${a} - ${b} =`, answer: a - b }
}

/** 凑十:进位加法的地基,单独练熟收益最大 */
function genMakeTen(): MathProblem {
  const a = randInt(1, 9)
  return { text: `${a} + ( ) = 10`, answer: 10 - a }
}

/** 比大小:答大的那个数 —— 题干里写清楚怎么答 */
function genCompare(): MathProblem {
  let a = randInt(1, 20)
  let b = randInt(1, 20)
  if (a === b) b = a + 1
  return { text: `${a} 和 ${b}\n哪个大?大的那个是几?`, answer: Math.max(a, b) }
}

/** 20 以内进位加:幼小衔接的重点题型 */
function genAdd20(): MathProblem {
  const a = randInt(5, 9)
  const b = randInt(11 - a, 9)
  return { text: `${a} + ${b} =`, answer: a + b }
}

/** 20 以内退位减:13-5 这类。和进位加是配套的一对,只练加不练减会瘸腿 */
function genSub20(): MathProblem {
  const a = randInt(11, 18)
  const b = randInt(a - 9, 9)
  return { text: `${a} - ${b} =`, answer: a - b }
}

/** 连加连减:一步一步往下算,练的是「保持住中间结果」这件事 */
function genChain(): MathProblem {
  const a = randInt(2, 8)
  const b = randInt(1, 9 - Math.min(a, 8))
  const mid = a + b
  const c = randInt(1, mid)
  return { text: `${a} + ${b} - ${c} =`, answer: mid - c }
}

/** 排第几:序数概念。孩子常把「第 3 个」和「3 个」混起来,值得单独练 */
function genOrdinal(): MathProblem {
  const shapes = ['🍎', '🐟', '⭐', '🎈', '🚗']
  const n = randInt(5, 9)
  const at = randInt(2, n - 1)
  const e = pick(shapes)
  const row = new Array(n).fill(e)
  row[at - 1] = '🐣'
  return { text: `${row.join('')}\n小鸡排第几个?`, answer: at }
}

/** 分一分:把 n 个东西平均分给几个人 —— 除法的地基,比背口诀早得多 */
function genHalf(): MathProblem {
  const per = randInt(1, 5)
  const people = randInt(2, 4)
  const total = per * people
  const e = pick(['🍬', '🍪', '🍓', '🎁'])
  return { text: `${e.repeat(total)}\n平均分给 ${people} 个小朋友,每人几个?`, answer: per }
}

/**
 * 找规律。
 *
 * 这才是真正的「幼儿奥数」—— 不是算得更快,是看出**藏在后面的那条规则**。
 * 等差、等比、隔项三种,覆盖了低龄段绝大多数规律题。
 */
function genPattern(): MathProblem {
  const type = randInt(1, 3)
  if (type === 1) {
    const start = randInt(1, 5)
    const step = randInt(1, 4)
    const xs = [start, start + step, start + step * 2, start + step * 3]
    return { text: `${xs.join(', ')}, ( )\n接着填什么?`, answer: start + step * 4 }
  }
  if (type === 2) {
    const start = randInt(1, 3)
    const xs = [start, start * 2, start * 4, start * 8]
    return { text: `${xs.join(', ')}, ( )\n接着填什么?`, answer: start * 16 }
  }
  // 隔项:1,5,2,5,3,5,( )
  const a = randInt(1, 4)
  const fix = randInt(6, 9)
  return { text: `${a}, ${fix}, ${a + 1}, ${fix}, ${a + 2}, ${fix}, ( )\n接着填什么?`, answer: a + 3 }
}

/** 数图形:数量与专注力一起练,而且不需要认字 */
function genCountShape(): MathProblem {
  const target = pick(['🔺', '⭐', '🔵', '🟣'])
  const other = pick(['🟩', '🟨', '⬜', '🟪'])
  const n = randInt(3, 8)
  const noise = randInt(3, 8)
  const all = [...new Array(n).fill(target), ...new Array(noise).fill(other)]
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = all[i]
    all[i] = all[j]
    all[j] = t
  }
  return { text: `${all.join('')}\n一共有几个 ${target}?`, answer: n }
}

// ---------------- 进阶思维(奥数入门) ----------------

/** 数列找规律:比幼儿档更长、规则更隐蔽(平方数、斐波那契、二级等差) */
function genSeries(): MathProblem {
  const type = randInt(1, 3)
  if (type === 1) {
    // 二级等差:1,2,4,7,11(差 1,2,3,4)
    const a0 = randInt(1, 4)
    const xs = [a0]
    for (let i = 1; i < 5; i++) xs.push(xs[i - 1] + i)
    return { text: `${xs.slice(0, 4).join(', ')}, ( )\n接下来是几?`, answer: xs[4] }
  }
  if (type === 2) {
    // 斐波那契式:前两个相加
    const a = randInt(1, 3)
    const b = randInt(2, 5)
    const xs = [a, b, a + b, a + 2 * b]
    return { text: `${xs.join(', ')}, ( )\n接下来是几?`, answer: xs[2] + xs[3] }
  }
  // 平方数
  const s0 = randInt(1, 4)
  const xs = [s0, s0 + 1, s0 + 2, s0 + 3, s0 + 4].map((x) => x * x)
  return { text: `${xs.slice(0, 4).join(', ')}, ( )\n接下来是几?`, answer: xs[4] }
}

/**
 * 周期问题。
 * 经典奥数入门专题:一串东西循环排下去,问第 N 个是什么。
 * 考的是「除法 + 余数」的实际含义,而不是会不会算除法。
 */
function genCycle(): MathProblem {
  const set = pick([
    ['🔴', '🟡', '🔵'],
    ['🐶', '🐱'],
    ['⭐', '🌙', '☀️', '☁️'],
  ])
  const n = randInt(7, 30)
  const idx = (n - 1) % set.length
  return {
    text: `${set.join('')}${set.join('')}… 一直这样排下去\n第 ${n} 个是第几种?(从左数,答 1-${set.length})`,
    answer: idx + 1,
  }
}

/** 等量代换:代数思维的起点,比列方程早很多年就能懂 */
function genSwap(): MathProblem {
  const rate = randInt(2, 4)
  const k = randInt(2, 5)
  const a = pick(['🍎', '🍐', '🍊'])
  const b = pick(['🍬', '🍪', '🥕'])
  return { text: `1 个 ${a} 可以换 ${rate} 个 ${b}\n${k} 个 ${a} 能换几个 ${b}?`, answer: rate * k }
}

/**
 * 图形计数:一排 n 个小格子,一共能数出几个长方形?
 * 答案是 n(n+1)/2 —— 孩子先靠数,数着数着自己会发现规律。
 */
function genCountRect(): MathProblem {
  const n = randInt(3, 6)
  // ▭ 不是 emoji(会显示成方框),用真 emoji 的方块代替
  return {
    text: `${'🟨'.repeat(n)}\n这样连成一排的 ${n} 个格子,一共能数出几个长方形?`,
    answer: (n * (n + 1)) / 2,
  }
}


// ---------------- 幼小衔接:看图列式 ----------------

/*
  「会算 5+3」和「看懂一幅图、知道该用加法」是完全不同的两件事,
  而一年级立刻就考后者。孩子卡在应用题上,几乎从来不是算错,
  是不知道该加还是该减 —— 所以这三种要单独练:
  合起来(加)、拿走了(减)、比多少(减但问法不同)。
*/

function genPicAdd(): MathProblem {
  const e = pick(['🍎', '🐟', '⭐', '🎈', '🍬', '🐤'])
  const a = randInt(1, 6)
  const b = randInt(1, 9 - a)
  return {
    text: '两堆合起来,一共有几个?',
    answer: a + b,
    visual: visualOf([{ emoji: e, n: a }, { emoji: e, n: b }], ['和']),
  }
}

function genPicSub(): MathProblem {
  const [e, verb] = pick([
    ['🐟', '游走了'],
    ['🐤', '飞走了'],
    ['🍬', '吃掉了'],
    ['🎈', '飞走了'],
    ['🚗', '开走了'],
  ])
  const a = randInt(3, 9)
  const b = randInt(1, a - 1)
  // 划掉的那几个就是「走掉的」—— 比另起一排更接近「拿走」这个动作
  return {
    text: `${verb} ${b} 个,还剩几个?`,
    answer: a - b,
    visual: visualOf([{ emoji: e, n: a }], [], b),
  }
}

function genPicDiff(): MathProblem {
  const e1 = pick(['🐶', '🐱', '🐰'])
  const e2 = pick(['🦴', '🐟', '🥕'])
  const a = randInt(3, 9)
  const b = randInt(1, a - 1)
  return {
    text: '上面比下面多几个?',
    answer: a - b,
    visual: visualOf([{ emoji: e1, n: a }, { emoji: e2, n: b }], ['']),
  }
}

// ---------------- 思维板块:方位 / 分类 / 比较 / 推理 / 专注 ----------------

/** 认方位:序数 + 左右。「从右数第几个」是很多孩子第一次真正卡住的地方 */
function genPosition(): MathProblem {
  const fill = pick(['🍎', '🌟', '🔵'])
  const target = pick(['🐣', '🦋', '🍓'])
  const n = randInt(5, 8)
  const at = randInt(2, n - 1)
  const row = new Array(n).fill(fill)
  row[at - 1] = target
  const fromLeft = randInt(1, 2) === 1
  return {
    text: `${row.join('')}\n从${fromLeft ? '左' : '右'}边数,${target} 排第几个?`,
    answer: fromLeft ? at : n - at + 1,
  }
}

/** 找不同类:分类与归纳。答序号,不用认字 */
function genOddOne(): MathProblem {
  const groups: Array<[string[], string[]]> = [
    [['🍎', '🍌', '🍇', '🍓'], ['🚗', '✈️', '🚌']],
    [['🐶', '🐱', '🐰', '🐷'], ['🌳', '🌸', '🌵']],
    [['🚗', '🚌', '🚲', '✈️'], ['🍎', '🐶', '⚽']],
    [['👕', '👖', '🧦', '👟'], ['🍕', '🐟', '📕']],
    [['⚽', '🏀', '🎾', '🏐'], ['🍇', '🐶', '🚗']],
  ]
  const [same, other] = pick(groups)
  const three = [...same].sort(() => Math.random() - 0.5).slice(0, 3)
  const odd = pick(other)
  const at = randInt(1, 4)
  const row: string[] = []
  let k = 0
  for (let i = 1; i <= 4; i++) row.push(i === at ? odd : three[k++])
  return {
    text: `${row.map((x, i) => `${i + 1}.${x}`).join('  ')}\n哪个和其它三个不是一伙的?(答序号)`,
    answer: at,
  }
}

/** 比长短/高矮:用重复的方块表示长度,一眼能比出来 */
function genSizeCmp(): MathProblem {
  /*
    ⚠️ 只用真 emoji。原先这里用的是 ▬(U+25AC)—— 它长得像方块,
    但**不是 emoji**,在很多手机上是一个空方框,孩子看到的是两排空框。
    这正是内容包里已经修过一次的那类坑,代码里同样不能犯。
  */
  const [what, unit] = pick([
    ['长', '🟩'],
    ['长', '🟦'],
    ['大', '🟨'],
  ])
  let a = randInt(2, 8)
  let b = randInt(2, 8)
  if (a === b) b = a + 1
  return {
    text: `1. ${unit.repeat(a)}\n2. ${unit.repeat(b)}\n哪个更${what}?(答 1 或 2)`,
    answer: a > b ? 1 : 2,
  }
}

/**
 * 简单推理:传递关系。
 * 「小明比小红高,小红比小刚高,谁最高」—— 这是逻辑推理最早的样子,
 * 4–5 岁就能懂,而它是后面所有应用题的底子。
 */
function genLogic3(): MathProblem {
  const names = ['小明', '小红', '小刚']
  // 成对的反义词 —— 原先反着问会生成「最不高」这种不是人话的题面
  const [adj, most, least] = pick([
    ['高', '最高', '最矮'],
    ['快', '最快', '最慢'],
    ['大', '最大', '最小'],
  ])
  // 随机一个真实排序,再按传递关系描述出来
  const order = [0, 1, 2].sort(() => Math.random() - 0.5)
  const [first, second, third] = order
  const askTop = randInt(1, 2) === 1
  return {
    text:
      `${names[first]}比${names[second]}${adj},${names[second]}比${names[third]}${adj}\n` +
      `谁${askTop ? most : least}?(1 ${names[0]} 2 ${names[1]} 3 ${names[2]})`,
    answer: (askTop ? first : third) + 1,
  }
}

/** 找不同:两排里有一个位置不一样。练的是专注力,不是知识 */
function genSpotDiff(): MathProblem {
  /*
    这里只能用**单码点**的 emoji。
    ❤️ 这类是「基本字符 + 变体选择符」两个码点拼出来的,混进来之后
    两排的视觉长度会对不齐,判定「第几个不一样」也会错位。
  */
  const a = pick(['🔵', '🟢', '🟣'])
  const b = pick(['🔴', '🟡', '🟠'])
  const n = randInt(5, 8)
  const at = randInt(1, n)
  const row1: string[] = []
  const row2: string[] = []
  for (let i = 1; i <= n; i++) {
    const e = randInt(1, 2) === 1 ? a : b
    row1.push(e)
    row2.push(i === at ? (e === a ? b : a) : e)
  }
  return { text: `${row1.join('')}\n${row2.join('')}\n第几个不一样?`, answer: at }
}

// ---------------- 思维档:枚举与巧算 ----------------

/** 简单枚举:2 件上衣配 3 条裤子有几种穿法 —— 乘法原理的启蒙 */
function genEnumerate(): MathProblem {
  const a = randInt(2, 5)
  const b = randInt(2, 5)
  const pairs = pick([
    ['件上衣', '条裤子', '种穿法'],
    ['种面包', '种果酱', '种搭配'],
    ['条路', '条路', '种走法'],
  ])
  return {
    text: `有 ${a} ${pairs[0]}、${b} ${pairs[1]}\n一共有几${pairs[2]}?`,
    answer: a * b,
  }
}

/** 巧算:1+2+…+n。孩子先一个个加,加着加着自己会发现「首尾配对」 */
function genClever(): MathProblem {
  const n = pick([5, 6, 8, 9, 10, 12, 15, 20])
  return { text: `1 + 2 + 3 + … + ${n} =\n(想想有没有快办法)`, answer: (n * (n + 1)) / 2 }
}

// ---------------- 奥数档:中高年级经典专题 ----------------

/** 和差问题:大数 =(和 + 差)÷ 2。一句话的窍门,但要真的想明白 */
function genSumDiff(): MathProblem {
  const big = randInt(6, 40)
  const small = randInt(1, big - 1)
  return {
    text: `两个数,和是 ${big + small},差是 ${big - small}\n大的那个数是几?`,
    answer: big,
  }
}

/** 年龄问题:年龄差**永远不变** —— 这是这一类题唯一的窍门 */
function genAgeDiff(): MathProblem {
  const kid = randInt(5, 14)
  const gap = randInt(20, 35)
  const after = randInt(2, 12)
  return {
    text: `今年孩子 ${kid} 岁,妈妈 ${kid + gap} 岁\n${after} 年后,妈妈比孩子大几岁?`,
    answer: gap,
  }
}

/** 植树问题:两端都栽 → 棵数 = 段数 + 1。差的就是那个 +1 */
function genTree(): MathProblem {
  const gap = pick([2, 3, 4, 5, 10])
  const seg = randInt(3, 12)
  return {
    text: `一条 ${gap * seg} 米的小路,每隔 ${gap} 米栽一棵树\n两头都栽,一共要栽几棵?`,
    answer: seg + 1,
  }
}

/** 鸡兔同笼:兔子数 =(脚 − 头×2)÷ 2 */
function genChicken(): MathProblem {
  const rabbit = randInt(2, 12)
  const chicken = randInt(2, 12)
  const heads = rabbit + chicken
  const feet = rabbit * 4 + chicken * 2
  return { text: `笼子里有鸡和兔,一共 ${heads} 个头、${feet} 只脚\n兔子有几只?`, answer: rabbit }
}

/** 盈亏问题:人数 =(盈 + 亏)÷(两次每人分的差) */
function genProfitLoss(): MathProblem {
  const people = randInt(3, 12)
  const perLow = randInt(2, 6)
  const perHigh = perLow + randInt(1, 3)
  /*
    ⚠️「多出来的那几颗」必须小于「多分一轮所需要的总量」,否则算出来的
    「少了几颗」会是**负数** —— 题面上就成了「少了 -2 颗」,孩子看不懂,
    而且这道题根本不成立。自测按题面里的数字反算时抓到了这个。
  */
  const maxLeft = Math.min(perLow, people * (perHigh - perLow) - 1)
  const left = randInt(1, Math.max(1, maxLeft))
  const total = perLow * people + left
  const short = perHigh * people - total // 按多的分,差 short 个
  return {
    text: `一些糖分给小朋友:每人 ${perLow} 颗,多出 ${left} 颗;每人 ${perHigh} 颗,少了 ${short} 颗\n一共有几个小朋友?`,
    answer: people,
  }
}

/** 平均数:匀一匀。先会「总数 ÷ 份数」,后面统计全靠它 */
function genAverage(): MathProblem {
  const n = randInt(3, 5)
  const avg = randInt(3, 20)
  const xs: number[] = []
  let acc = 0
  for (let i = 0; i < n - 1; i++) {
    const v = Math.max(1, avg + randInt(-3, 3))
    xs.push(v)
    acc += v
  }
  const last = avg * n - acc
  xs.push(last > 0 ? last : 1)
  const total = xs.reduce((a, b) => a + b, 0)
  // 保证整除:用实际总数反推平均数
  if (total % n !== 0) xs[xs.length - 1] += n - (total % n)
  const sum = xs.reduce((a, b) => a + b, 0)
  return { text: `${xs.join('、')}\n这 ${n} 个数的平均数是几?`, answer: sum / n }
}

// ---------------- 小学及以上 ----------------

function genAdd(stage: AgeStage): MathProblem {
  const max = addSubMax(stage)
  const a = randInt(1, max)
  const b = randInt(1, max)
  return { text: `${a} + ${b} =`, answer: a + b }
}

function genSub(stage: AgeStage): MathProblem {
  const max = addSubMax(stage)
  const a = randInt(1, max)
  const b = randInt(0, a) // 保证不为负
  return { text: `${a} − ${b} =`, answer: a - b }
}

/** 九九乘法表:1..9 × 1..9 */
function genMulTable(): MathProblem {
  const a = randInt(1, 9)
  const b = randInt(1, 9)
  return { text: `${a} × ${b} =`, answer: a * b }
}

function genMul(stage: AgeStage): MathProblem {
  if (stage === 'toddler' || stage === 'primary') {
    // 两位数 × 一位数(小学),或退化到九九表
    const a = randInt(2, stage === 'toddler' ? 9 : 20)
    const b = randInt(2, 9)
    return { text: `${a} × ${b} =`, answer: a * b }
  }
  const a = randInt(11, 99)
  const b = randInt(2, 19)
  return { text: `${a} × ${b} =`, answer: a * b }
}

/** 整除:先定商与除数,再倒推被除数,避免余数 */
function genDiv(stage: AgeStage): MathProblem {
  const divisor = randInt(2, 9)
  const quotient = stage === 'toddler' ? randInt(1, 9) : randInt(2, stage === 'primary' ? 12 : 30)
  const dividend = divisor * quotient
  return { text: `${dividend} ÷ ${divisor} =`, answer: quotient }
}

/** 生成一道题(mixed 时随机选四则之一) */
export function generateProblem(kind: MathKind, stage: AgeStage): MathProblem {
  switch (kind) {
    case 'count10':
      return genCount10()
    case 'add10':
      return genAdd10()
    case 'sub10':
      return genSub10()
    case 'makeTen':
      return genMakeTen()
    case 'compare':
      return genCompare()
    case 'add20':
      return genAdd20()
    case 'sub20':
      return genSub20()
    case 'chain':
      return genChain()
    case 'ordinal':
      return genOrdinal()
    case 'half':
      return genHalf()
    case 'pattern':
      return genPattern()
    case 'countShape':
      return genCountShape()
    case 'series':
      return genSeries()
    case 'cycle':
      return genCycle()
    case 'swap':
      return genSwap()
    case 'countRect':
      return genCountRect()
    case 'picAdd':
      return genPicAdd()
    case 'picSub':
      return genPicSub()
    case 'picDiff':
      return genPicDiff()
    case 'position':
      return genPosition()
    case 'oddOne':
      return genOddOne()
    case 'sizeCmp':
      return genSizeCmp()
    case 'logic3':
      return genLogic3()
    case 'spotDiff':
      return genSpotDiff()
    case 'enumerate':
      return genEnumerate()
    case 'clever':
      return genClever()
    case 'sumDiff':
      return genSumDiff()
    case 'ageDiff':
      return genAgeDiff()
    case 'tree':
      return genTree()
    case 'chicken':
      return genChicken()
    case 'profitLoss':
      return genProfitLoss()
    case 'average':
      return genAverage()
    case 'add':
      return genAdd(stage)
    case 'sub':
      return genSub(stage)
    case 'mulTable':
      return genMulTable()
    case 'mul':
      return genMul(stage)
    case 'div':
      return genDiv(stage)
    case 'mixed':
      return generateProblem(
        stage === 'toddler'
          ? pick(['count10', 'add10', 'sub10', 'makeTen', 'compare'] as MathKind[])
          : pick(['add', 'sub', 'mul', 'div'] as MathKind[]),
        stage,
      )
  }
}

/** 生成一组题;尽量避免与上一题完全重复 */
export function generateDrill(kind: MathKind, count: number, stage: AgeStage): MathProblem[] {
  const out: MathProblem[] = []
  let last = ''
  let guard = 0
  while (out.length < count) {
    const p = generateProblem(kind, stage)
    if (p.text === last && guard < 50) {
      guard++
      continue
    }
    last = p.text
    guard = 0
    out.push(p)
  }
  return out
}
