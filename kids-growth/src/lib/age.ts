export function formatAge(birthdate: string, atDate: Date = new Date()): string {
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return ''

  let years = atDate.getFullYear() - birth.getFullYear()
  let months = atDate.getMonth() - birth.getMonth()
  let days = atDate.getDate() - birth.getDate()

  if (days < 0) {
    months -= 1
    const prevMonth = new Date(atDate.getFullYear(), atDate.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years < 0) return '尚未出生'
  if (years === 0 && months === 0) return `${days}天`
  if (years === 0) return `${months}个月${days > 0 ? days + '天' : ''}`
  return `${years}岁${months > 0 ? months + '个月' : ''}`
}

export function ageInMonths(birthdate: string, atDate: Date = new Date()): number {
  const birth = new Date(birthdate)
  const totalMonths =
    (atDate.getFullYear() - birth.getFullYear()) * 12 + (atDate.getMonth() - birth.getMonth())
  const dayAdjust = atDate.getDate() < birth.getDate() ? -1 : 0
  return Math.max(0, totalMonths + dayAdjust)
}
