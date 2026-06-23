import { formatStamp, useTimeFormat, type TimeMode } from '../lib/time'
import { cn } from '../lib/cn'

// A timestamp that re-renders with the global format. Hovering always shows the exact ISO.
export function Time({ ms, className }: { ms?: number; className?: string }) {
  const { mode } = useTimeFormat()
  return (
    <span className={className} title={ms ? new Date(ms).toISOString() : undefined}>
      {formatStamp(ms, mode)}
    </span>
  )
}

const MODES: { id: TimeMode; label: string }[] = [
  { id: 'relative', label: 'rel' },
  { id: 'local', label: 'local' },
  { id: 'utc', label: 'UTC' },
]

// The global time-format switch — a charcoal segmented control for the top bar.
export function TimeFormatToggle() {
  const { mode, setMode } = useTimeFormat()
  return (
    <div className="flex items-center rounded-md border border-border-strong p-0.5">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          title={`timestamps: ${m.id}`}
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[11px] transition-colors',
            mode === m.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
