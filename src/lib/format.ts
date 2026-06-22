export function fmtNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k'
  return String(n)
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function dur(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 1) return '0s'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function ago(ms?: number): string {
  if (!ms) return '—'
  const d = Date.now() - ms
  return d < 0 ? `in ${dur(-d)}` : `${dur(d)} ago`
}

export function fmtTime(ms?: number): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

export function fmtMs(ms?: number): string {
  if (!ms || ms <= 0) return '—'
  return dur(ms)
}
