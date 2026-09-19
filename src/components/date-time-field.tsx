import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Input } from './ui.js'
import { formatDateTime, parseDateTime } from '../lib/date-time.js'

export { formatDateTime, parseDateTime } from '../lib/date-time.js'

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (value: number) => String(value).padStart(2, '0')

function monthStart(date: Date): Date {
  const start = new Date(date)
  start.setDate(1)
  start.setHours(12, 0, 0, 0)
  return start
}

interface DateTimeFieldProps {
  value: string
  onChange: (value: string) => void
  'aria-label'?: string
  disabled?: boolean
  id?: string
}

// The browser's date picker follows OS locale even on an English page. Keep all
// visible date/time controls here so the format and calendar remain predictable.
export function DateTimeField({ value, onChange, disabled, id, 'aria-label': label }: DateTimeFieldProps) {
  const dialogId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const focusDay = useRef('')
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const [day, setDay] = useState('')
  const [hour, setHour] = useState('00')
  const [minute, setMinute] = useState('00')
  const [position, setPosition] = useState({ top: 8, left: 8 })
  const draft = `${day} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
  const valid = /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number.isFinite(parseDateTime(draft))
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const last = new Date(month)
  last.setMonth(monthIndex + 1, 0)

  function close(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  function apply() {
    if (!valid) return
    onChange(draft)
    close()
  }

  function seed(date: Date) {
    const text = formatDateTime(date)
    setDay(text.slice(0, 10))
    setHour(text.slice(11, 13))
    setMinute(text.slice(14, 16))
    setMonth(monthStart(date))
    focusDay.current = text.slice(0, 10)
  }

  function toggle() {
    if (open) return close()
    const parsed = parseDateTime(value)
    seed(value.trim() && Number.isFinite(parsed) ? new Date(parsed) : new Date())
    setOpen(true)
  }

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const anchor = root.current?.getBoundingClientRect()
      const picker = dialog.current?.getBoundingClientRect()
      if (!anchor || !picker) return
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - picker.width - 8))
      const below = anchor.bottom + 6
      const top = below + picker.height <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.top - picker.height - 6)
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, month])

  useEffect(() => {
    if (!open || !focusDay.current) return
    dialog.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDay.current}"]`)?.focus()
    focusDay.current = ''
  }, [open, month, day])

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function moveMonth(offset: number) {
    const next = new Date(month)
    next.setMonth(next.getMonth() + offset)
    if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) setMonth(next)
  }

  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -date.getDay(),
      End: 6 - date.getDay(),
    }
    const offset = offsets[event.key]
    if (offset === undefined) return
    event.preventDefault()
    const next = new Date(date)
    next.setDate(next.getDate() + offset)
    const text = formatDateTime(next).slice(0, 10)
    if (!text) return
    focusDay.current = text
    setDay(text)
    setMonth(monthStart(next))
  }

  return (
    <div
      ref={root}
      className="relative flex min-w-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
      onBlur={(event) => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false)
      }}
    >
      <Input
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="yyyy-MM-dd HH:mm"
        autoComplete="off"
        spellCheck={false}
        className="pr-9"
      />
      <button
        ref={trigger}
        type="button"
        aria-label="Choose date and time"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        disabled={disabled}
        onClick={toggle}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Calendar size={15} />
      </button>
      {open && (
        <div
          ref={dialog}
          id={dialogId}
          role="dialog"
          aria-label="Choose date and time"
          lang="en"
          style={position}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
              event.preventDefault()
              event.stopPropagation()
              apply()
            }
          }}
          className="fixed z-50 max-h-[calc(100dvh-1rem)] w-[min(20rem,calc(100vw-1rem))] overflow-auto rounded-xl bg-surface p-3 text-foreground ring-1 ring-border-strong"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium" aria-live="polite">
              {months[monthIndex]} {String(year).padStart(4, '0')}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                disabled={year === 1 && monthIndex === 0}
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next month"
                disabled={year === 9999 && monthIndex === 11}
                onClick={() => moveMonth(1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs" role="group" aria-label="Calendar">
            {weekdays.map((weekday) => (
              <span key={weekday} className="py-1 text-muted-foreground">{weekday}</span>
            ))}
            {Array.from({ length: month.getDay() }, (_, index) => <span key={`blank-${index}`} />)}
            {Array.from({ length: last.getDate() }, (_, index) => {
              const date = new Date(month)
              date.setDate(index + 1)
              const text = formatDateTime(date).slice(0, 10)
              const selected = day === text
              const firstInNewMonth = index === 0 &&
                !day.startsWith(`${String(year).padStart(4, '0')}-${pad(monthIndex + 1)}-`)
              return (
                <Button
                  key={text}
                  type="button"
                  variant={selected ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-0"
                  aria-label={`${months[monthIndex]} ${index + 1}, ${String(year).padStart(4, '0')}`}
                  aria-pressed={selected}
                  data-date={text}
                  tabIndex={selected || firstInNewMonth ? 0 : -1}
                  onClick={() => setDay(text)}
                  onKeyDown={(event) => dayKey(event, date)}
                >
                  {index + 1}
                </Button>
              )
            })}
          </div>
          <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
            <label className="min-w-0 flex-1 text-xs text-muted-foreground">
              Hour (00–23)
              <Input
                aria-label="Hour"
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={hour}
                onChange={(event) => setHour(event.target.value)}
                className="mt-1"
              />
            </label>
            <span className="pb-1.5">:</span>
            <label className="min-w-0 flex-1 text-xs text-muted-foreground">
              Minute (00–59)
              <Input
                aria-label="Minute"
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
                className="mt-1"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{draft} · local time</p>
          {!valid && (
            <p role="alert" className="mt-1 text-xs text-danger">Choose a valid local date and time.</p>
          )}
          <div className="mt-3 flex justify-between gap-2">
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(''); close() }}>
                Clear
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => seed(new Date())}>
                Now
              </Button>
            </div>
            <Button type="button" size="sm" disabled={!valid} onClick={apply}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}
