/**
 * 身高体重的小工具函数 —— 刻意**不依赖**那张 70KB 的生长标准表。
 *
 * 为什么单独拆一个文件:年度报告只需要算个 BMI,如果它从
 * growthPercentile.ts 里拿函数,打包器会把整张 WHO 标准表也拖进公共包,
 * 于是每次冷启动都要多解析 70KB —— 而绝大多数时候根本用不上。
 * 拆开之后,标准表只在真正打开「生长曲线」那一页时才加载。
 */

/** BMI = 体重(kg) ÷ 身高(m)²,保留一位小数 */
export function bmiOf(heightCm: number, weightKg: number): number {
  const m = heightCm / 100
  if (m <= 0) return 0
  return Math.round((weightKg / (m * m)) * 10) / 10
}

/** 出生日期到某一天的月龄(生日没到的当月不算满) */
export function ageMonthsAt(birthdate: string, atISO: string): number {
  const b = new Date(birthdate)
  const a = new Date(atISO)
  if (isNaN(b.getTime()) || isNaN(a.getTime())) return 0
  let months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth())
  if (a.getDate() < b.getDate()) months -= 1
  return Math.max(0, months)
}
