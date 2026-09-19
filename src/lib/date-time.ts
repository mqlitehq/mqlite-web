const pad = (value: number) => String(value).padStart(2, '0')

// Date-time inputs represent local wall time, with minutes as their precision.
export function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return ''
  return `${String(year).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Blank is optional; invalid input must stay distinguishable from no expiry.
// Round-tripping also rejects impossible dates and local daylight-saving gaps.
export function parseDateTime(value: string): number {
  const text = value.trim()
  if (!text) return 0
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text)
  if (!match) return Number.NaN
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return Number.NaN
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, 0, 0)
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute
  ) return Number.NaN
  return date.getTime()
}
