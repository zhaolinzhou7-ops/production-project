import type { AgeStage, MathVisual } from '../types'

/** 口算题型 */
export type MathKind =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mulTable'
  | 'mixed'
  // 英语口算:用英语做数学 —— 一次练两样,而且更接近真实使用
  | 'enCount'
  | 'enAdd'
  | 'enSub'

export interface MathProblem {
  /** 题干,如 "7 + 8 =" */
  text: string
  answer: number
  /**
   * 数形结合的图示 —— 把算式配上看得见的实物。
   *
   * 「5 + 5 = ?」对一个 5 岁的孩子是**两个抽象符号**,他只能靠背。
   * 而「🍬×5 和 🍬×5 一共几颗糖」他能**数出来** ——
   * 数出来的答案是他自己得到的,背下来的答案是别人给的。
   *
   * 数学教育里这叫「具体—表象—抽象」:实物 → 图示 → 符号。
   * 跳过前两步直接练符号,算得快也走不远,一遇到应用题就不会列式。
   * 所以图示和算式**同时出现**,不是二选一。
   *
   * 数目太大(超过 20 个)就不给图:一排二十几个 emoji 在手机上要换行三次,
   * 孩子数到一半就乱了,那时候图反而是干扰。
   */
  visual?: MathVisual
}

/** 图示里用的实物 —— 都是孩子认得、且一眼能数清的 */
const COUNTABLES = ['🍬', '🍎', '⭐', '🐟', '🎈', '🍪', '🐤', '🍓']

const VISUAL_MAX = 20

function visualOf(
  groups: Array<{ emoji: string; n: number }>,
  ops: string[],
  strike?: number,
): MathVisual | undefined {
  const total = groups.reduce((n, g) => n + g.n, 0)
  if (total <= 0 || total > VISUAL_MAX) return undefined
  return { groups, ops, strike }
}

export interface MathKindDef {
  kind: MathKind
  label: string
  icon: string
  desc: string
}

export const MATH_KINDS: MathKindDef[] = [
  { kind: 'add', label: '加法', icon: '➕', desc: '两数相加' },
  { kind: 'sub', label: '减法', icon: '➖', desc: '两数相减(不为负)' },
  { kind: 'mulTable', label: '乘法口诀', icon: '✖️', desc: '九九乘法表' },
  { kind: 'mul', label: '乘法', icon: '⏫', desc: '含两位数乘一位数' },
  { kind: 'div', label: '除法', icon: '➗', desc: '整除,无余数' },
  { kind: 'mixed', label: '混合', icon: '🎲', desc: '四则混合随机' },
  /*
    英语口算。

    口算和英语原先是两套互不相干的东西,而 4 岁半真正该练的是
    **用英语做数学**("two apples plus three apples")——
    这是国际学校低龄段的标准做法:一次练两样,而且比单独练任何一样
    都更接近真实使用。数字是他已经会的部分,所以英语那一半的负担很小 ——
    这正是「在会的东西上挂新东西」,语言习得里效率最高的一种。
  */
  { kind: 'enCount', label: 'How many?', icon: '🍎', desc: '听英文,数一数有几个' },
  { kind: 'enAdd', label: 'Plus', icon: '➕', desc: 'Two plus three = ?' },
  { kind: 'enSub', label: 'Minus', icon: '➖', desc: 'Five minus two = ?' },
]

/**
 * 数字的英文写法(0–20)。
 * 只做到 20 —— 英语口算的取值范围本来就压在 20 以内,
 * 超过这个数,他的负担就从「英语」变成了「算术」,两样都练不好。
 */
const EN_NUM = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
]

/** 英语口算里用的可数名词,单复数都写对 —— 教材里错一个 s,孩子就记错一个 */
const EN_ITEMS: Array<[string, string, string]> = [
  ['apple', 'apples', '🍎'],
  ['star', 'stars', '⭐'],
  ['fish', 'fish', '🐟'],
  ['cat', 'cats', '🐱'],
  ['ball', 'balls', '⚽'],
  ['duck', 'ducks', '🦆'],
]

function enPlural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** 把 n 个东西排成每行五个 —— 五个一组让孩子建立「五」这个基准量 */
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

/** How many apples? —— 听英文数数,英语和数学最自然的交叉点 */
function genEnCount(): MathProblem {
  const [one, many, emoji] = pick(EN_ITEMS)
  const n = randInt(1, 10)
  return {
    text: `How many ${enPlural(n, one, many)}?`,
    answer: n,
    visual: rowsOfFive(emoji, n),
  }
}

/** Two apples plus three apples = ? */
function genEnAdd(): MathProblem {
  const [one, many] = pick(EN_ITEMS)
  const a = randInt(1, 5)
  const b = randInt(1, 5)
  return {
    text: `${EN_NUM[a]} ${enPlural(a, one, many)} plus ${EN_NUM[b]} ${enPlural(b, one, many)} =`,
    answer: a + b,
  }
}

/** Five apples minus two apples = ? */
function genEnSub(): MathProblem {
  const [one, many] = pick(EN_ITEMS)
  const a = randInt(2, 10)
  const b = randInt(1, a - 1)
  return {
    text: `${EN_NUM[a]} ${enPlural(a, one, many)} minus ${EN_NUM[b]} ${enPlural(b, one, many)} =`,
    answer: a - b,
  }
}

export function getMathKindDef(kind: MathKind): MathKindDef | undefined {
  return MATH_KINDS.find((k) => k.kind === kind)
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

function genAdd(stage: AgeStage): MathProblem {
  const max = addSubMax(stage)
  const a = randInt(1, max)
  const b = randInt(1, max)
  const e = pick(COUNTABLES)
  return {
    text: `${a} + ${b} =`,
    answer: a + b,
    visual: visualOf([{ emoji: e, n: a }, { emoji: e, n: b }], ['+']),
  }
}

function genSub(stage: AgeStage): MathProblem {
  const max = addSubMax(stage)
  const a = randInt(1, max)
  const b = randInt(0, a) // 保证不为负
  // 减法的图示是「画出来再划掉几个」,比另起一排更接近「拿走」这个动作
  return {
    text: `${a} − ${b} =`,
    answer: a - b,
    visual: visualOf([{ emoji: pick(COUNTABLES), n: a }], [], b),
  }
}

/** 九九乘法表:1..9 × 1..9 */
function genMulTable(): MathProblem {
  const a = randInt(1, 9)
  const b = randInt(1, 9)
  const e = pick(COUNTABLES)
  /*
    乘法最该配图:`3 × 4` 的意思是**三组、每组四个**。
    背下九九表却说不出「3×4 是什么意思」的孩子非常多,
    而摆成三堆之后这件事不用讲他就看懂了。
  */
  return {
    text: `${a} × ${b} =`,
    answer: a * b,
    visual: visualOf(
      Array.from({ length: a }, () => ({ emoji: e, n: b })),
      Array.from({ length: Math.max(0, a - 1) }, () => '+'),
    ),
  }
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
    case 'add':
      return genAdd(stage)
    case 'sub':
      return genSub(stage)
    case 'enCount':
      return genEnCount()
    case 'enAdd':
      return genEnAdd()
    case 'enSub':
      return genEnSub()
    case 'mulTable':
      return genMulTable()
    case 'mul':
      return genMul(stage)
    case 'div':
      return genDiv(stage)
    case 'mixed':
      return generateProblem(pick(['add', 'sub', 'mul', 'div'] as MathKind[]), stage)
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
