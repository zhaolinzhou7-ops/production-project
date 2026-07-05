export function todayISO(): string {
  return toISODate(new Date())
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 0 = Sunday .. 6 = Saturday, matching Date#getDay() */
export function weekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}
