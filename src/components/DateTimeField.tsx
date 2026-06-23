import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { Input } from './ui'

const pad = (n: number) => String(n).padStart(2, '0')

// "YYYY.MM.DD HH:mm" (dotted, locale-independent) → epoch ms. 0 for blank/invalid.
export function parseDateTime(s: string): number {
  const p = s.trim().split(/\D+/).filter(Boolean).map(Number)
  if (p.length < 5 || p.some((n) => Number.isNaN(n))) return 0
  const [y, mo, d, h, mi] = p
  const dt = new Date(y, mo - 1, d, h, mi)
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime()
}
function fmtDotted(dt: Date): string {
  return `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}
function toNative(ms: number): string {
  if (!ms) return ''
  const dt = new Date(ms)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// A dotted (YYYY.MM.DD HH:mm) datetime field — the native input's separator is locale-bound
// and can't be themed, so we render our own and keep the native picker behind the calendar
// button (showPicker), syncing the value back in dotted form.
export function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const native = useRef<HTMLInputElement>(null)
  return (
    <div className="relative flex">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="2026.06.24 03:30"
        spellCheck={false}
        className="pr-9"
      />
      <button
        type="button"
        title="pick a date/time"
        onClick={() => native.current?.showPicker?.()}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <Calendar size={15} />
      </button>
      <input
        ref={native}
        type="datetime-local"
        tabIndex={-1}
        aria-hidden
        value={toNative(parseDateTime(value))}
        onChange={(e) => {
          const dt = new Date(e.target.value)
          if (!Number.isNaN(dt.getTime())) onChange(fmtDotted(dt))
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </div>
  )
}
