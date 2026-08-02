import type { AgeStage } from '../types'

/** 口算题型 */
export type MathKind =
  // 幼儿档(大班 / 幼小衔接):从「数得清」到「算得出」,一小步一小步来
  | 'count10'
  | 'add10'
  | 'sub10'
  | 'makeTen'
  | 'compare'
  | 'add20'
  // 小学及以上
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mulTable'
  | 'mixed'

export interface MathProblem {
  /** 题干,如 "7 + 8 =" */
  text: string
  answer: number
}

export interface MathKindDef {
  kind: MathKind
  label: string
  icon: string
  desc: string
}

/**
 * 题型清单。
 *
 * 幼儿档是按大班/幼小衔接的实际进度切的 —— 5-6 岁不该一上来就做抽象算式:
 * 先「数得清」(数一数),再 10 以内加、减分开练熟,然后凑十,最后才是进位加。
 * 每一档都窄到孩子能连着做对,做对本身就是继续的动力。
 */
export const MATH_KINDS: MathKindDef[] = [
  { kind: 'count10', label: '数一数', icon: '🔢', desc: '数图形有几个(10 以内)' },
  { kind: 'add10', label: '10 以内加法', icon: '➕', desc: '和不超过 10' },
  { kind: 'sub10', label: '10 以内减法', icon: '➖', desc: '10 以内,不出现负数' },
  { kind: 'makeTen', label: '凑十', icon: '🔟', desc: '几加几等于 10' },
  { kind: 'compare', label: '比大小', icon: '⚖️', desc: '哪个多、哪个少' },
  { kind: 'add20', label: '20 以内进位加', icon: '🧮', desc: '9+5 这类,幼小衔接重点' },
  { kind: 'add', label: '加法', icon: '➕', desc: '两数相加' },
  { kind: 'sub', label: '减法', icon: '➖', desc: '两数相减(不为负)' },
  { kind: 'mulTable', label: '乘法口诀', icon: '✖️', desc: '九九乘法表' },
  { kind: 'mul', label: '乘法', icon: '⏫', desc: '含两位数乘一位数' },
  { kind: 'div', label: '除法', icon: '➗', desc: '整除,无余数' },
  { kind: 'mixed', label: '混合', icon: '🎲', desc: '四则混合随机' },
]

export function getMathKindDef(kind: MathKind): MathKindDef | undefined {
  return MATH_KINDS.find((k) => k.kind === kind)
}

const TODDLER_KINDS: MathKind[] = ['count10', 'add10', 'sub10', 'makeTen', 'compare', 'add20']

/**
 * 难度档。
 *
 * 为什么要把它和「学段」分开:学段存在本地存储里,一旦清过数据就退回默认的
 * 「小学」,孩子第二天打开发现口算全变成了两位数乘除 —— 他不知道发生了什么,
 * 只知道「我做不出来了」。难度必须是**页面上看得见、随手能换**的东西,
 * 而不是藏在别处、还会被一次清缓存悄悄改掉的设置。
 */
export type MathTier = 'toddler' | 'school'

export interface MathTierDef {
  tier: MathTier
  label: string
  desc: string
}

export const MATH_TIERS: MathTierDef[] = [
  { tier: 'toddler', label: '幼儿档', desc: '数一数、10 以内加减、凑十、20 以内进位' },
  { tier: 'school', label: '小学档', desc: '加减乘除、乘法口诀、混合运算' },
]

/** 学段对应的默认难度档(只作默认值,页面上随时可改) */
export function defaultTierFor(stage: AgeStage): MathTier {
  return stage === 'toddler' ? 'toddler' : 'school'
}

/** 某一档里有哪些题型 */
export function mathKindsForTier(tier: MathTier): MathKindDef[] {
  return tier === 'toddler'
    ? MATH_KINDS.filter((k) => TODDLER_KINDS.includes(k.kind))
    : MATH_KINDS.filter((k) => !TODDLER_KINDS.includes(k.kind))
}

/** 这个题型属于哪一档 —— 用来把「上次选的题型」还原到对的档上 */
export function tierOfKind(kind: MathKind): MathTier {
  return TODDLER_KINDS.includes(kind) ? 'toddler' : 'school'
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
  return { text: `${emoji.repeat(n)}\n一共有几个?`, answer: n }
}

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

/** 比大小:答 1 表示前面大,答 2 表示后面大 —— 题干里写清楚怎么答 */
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
