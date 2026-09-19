import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn.js'

const permissions = [
  { value: 'send', label: 'send', description: 'Publish, schedule, and cancel messages.' },
  { value: 'listen', label: 'listen', description: 'Consume, settle, and inspect messages.' },
  { value: 'send,listen', label: 'send + listen', description: 'Publish and consume messages.' },
  { value: 'manage', label: 'manage', description: 'Full administration, including issuing and revoking keys.' },
]

interface PermissionSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function PermissionSelect({ value, onChange, disabled }: PermissionSelectProps) {
  const listId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const selected = Math.max(0, permissions.findIndex((permission) => permission.value === value))
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(selected)
  const [position, setPosition] = useState({ top: 8, left: 8, width: 288 })

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  function show(index = selected) {
    if (disabled) return
    setActive(index)
    setOpen(true)
  }

  function choose(index: number) {
    if (disabled) return
    onChange(permissions[index].value)
    close(true)
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const offset = event.key === 'ArrowDown' ? 1 : -1
        if (open) setActive((index) => (index + offset + permissions.length) % permissions.length)
        else show()
        break
      }
      case 'Home':
      case 'End':
        event.preventDefault()
        show(event.key === 'Home' ? 0 : permissions.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        event.stopPropagation()
        if (open) choose(active)
        else show()
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        }
        break
      case 'Tab':
        close()
        break
    }
  }

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const anchor = trigger.current?.getBoundingClientRect()
      const picker = popup.current?.getBoundingClientRect()
      if (!anchor || !picker) return
      const width = Math.min(Math.max(anchor.width, 288), window.innerWidth - 16)
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8))
      const below = anchor.bottom + 6
      const top = below + picker.height <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.top - picker.height - 6)
      setPosition({ top, left, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, position.width])

  useEffect(() => {
    if (!open) return
    popup.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

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

  return (
    <div
      ref={root}
      className="min-w-0"
      onBlur={(event) => {
        if (open && !event.currentTarget.contains(event.relatedTarget)) close()
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label="key permissions"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => open ? close() : show()}
        onKeyDown={keyDown}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border-strong bg-input px-2.5 text-left text-sm text-foreground transition-colors hover:border-faint focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <span className="truncate">{permissions[selected].label}</span>
        <ChevronDown size={15} aria-hidden className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          ref={popup}
          id={listId}
          role="listbox"
          aria-label="Key permissions"
          style={position}
          className="fixed z-50 max-h-[calc(100dvh-1rem)] overflow-auto rounded-lg bg-surface p-1 text-foreground ring-1 ring-border-strong"
        >
          {permissions.map((permission, index) => (
            <div
              key={permission.value}
              id={`${listId}-${index}`}
              role="option"
              aria-label={permission.label}
              aria-describedby={`${listId}-${index}-description`}
              aria-selected={index === selected}
              data-index={index}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-sm',
                index === selected ? 'bg-accent-dim text-accent' : 'text-foreground',
                index === active && 'ring-1 ring-inset ring-border-strong',
                index === active && index !== selected && 'bg-muted',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{permission.label}</span>
                <span id={`${listId}-${index}-description`} className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {permission.description}
                </span>
              </span>
              <span className="mt-0.5 w-4 shrink-0" aria-hidden>
                {index === selected && <Check size={16} />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
