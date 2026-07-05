import type { AgeStage } from '../types'

/** 口算题型 */
export type MathKind = 'add' | 'sub' | 'mul' | 'div' | 'mulTable' | 'mixed'

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

export const MATH_KINDS: MathKindDef[] = [
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
