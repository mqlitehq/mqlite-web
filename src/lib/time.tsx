import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ago, fmtMs } from './format'

// Global timestamp format. Relative ("5m ago"), the viewer's local zone, or UTC — chosen
// once in the top bar and applied to every timestamp in the console.
export type TimeMode = 'relative' | 'local' | 'utc'
export const SUBSCRIPTION_EXPIRING_SOON_MS = 24 * 60 * 60 * 1000
const KEY = 'mqlite.timefmt'

interface Ctx {
  mode: TimeMode
  setMode: (m: TimeMode) => void
}
const TimeCtx = createContext<Ctx>({ mode: 'relative', setMode: () => {} })

export function TimeFormatProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<TimeMode>(() => (localStorage.getItem(KEY) as TimeMode) || 'relative')
  useEffect(() => {
    localStorage.setItem(KEY, mode)
  }, [mode])
  return <TimeCtx.Provider value={{ mode, setMode }}>{children}</TimeCtx.Provider>
}

export function useTimeFormat(): Ctx {
  return useContext(TimeCtx)
}

const pad = (n: number) => String(n).padStart(2, '0')

export type RelativeTimeStyle = 'elapsed' | 'remaining'

export function formatStamp(
  ms: number | undefined,
  mode: TimeMode,
  relativeToMs?: number | null,
  relativeStyle: RelativeTimeStyle = 'elapsed',
): string {
  if (!ms) return '—'
  if (mode === 'relative') {
    if (relativeToMs === null) return 'unavailable'
    const reference = relativeToMs ?? Date.now()
    if (relativeStyle === 'remaining') {
      const remaining = ms - reference
      if (remaining === 0) return 'now'
      const elapsed = fmtMs(Math.abs(remaining))
      return remaining > 0 ? `${elapsed} left` : `${elapsed} ago`
    }
    return ago(ms, reference)
  }
  const d = new Date(ms)
  if (mode === 'utc') {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
