import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

// ── Button ──────────────────────────────────────────────────────────────────
const button = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all active:translate-y-px disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:opacity-90',
        outline: 'border border-border-strong bg-transparent text-foreground hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        danger: 'bg-danger/12 text-danger hover:bg-danger/20',
      },
      size: { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-sm', lg: 'h-9 px-4 text-sm', icon: 'h-8 w-8 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />
}

// ── Input / Textarea / Select ─────────────────────────────────────────────────
const fieldBase =
  'w-full rounded-lg border border-border-strong bg-input text-sm text-foreground placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-8 px-2.5', className)} {...props} />
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'px-2.5 py-2 leading-relaxed', className)} {...props} />
}
export function Select({ className, children, ...props }: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(fieldBase, 'h-8 px-2', className)} {...props}>
      {children}
    </select>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl bg-surface ring-1 ring-border', className)} {...props} />
}

// ── Badge ───────────────────────────────────────────────────────────────────
const badge = cva('inline-flex items-center gap-1 rounded-full px-2 h-5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      accent: 'bg-accent-dim text-accent',
      ok: 'bg-ok/12 text-ok',
      warn: 'bg-warn/12 text-warn',
      danger: 'bg-danger/12 text-danger',
      info: 'bg-info/12 text-info',
      outline: 'border border-border-strong text-muted-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
})
export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />
}

// ── Status dot ────────────────────────────────────────────────────────────────
const dotColor: Record<string, string> = {
  active: 'bg-ok',
  locked: 'bg-warn',
  scheduled: 'bg-info',
  deferred: 'bg-faint',
  dead_lettered: 'bg-danger',
}
export function Dot({ state, className }: { state: string; className?: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', dotColor[state] ?? 'bg-faint', className)} />
}

// ── small layout helpers ──────────────────────────────────────────────────────
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn('block text-xs text-muted-foreground mb-1', className)}>{children}</label>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>
}
export function Spinner({ label = 'loading' }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">{label}…</div>
}
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg bg-danger/10 text-danger text-sm px-3 py-2">
      <span className="opacity-70">✗ </span>
      {message}
    </div>
  )
}

// ── page scaffolding ──────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
          {icon}
          {title}
        </h1>
        {subtitle !== undefined && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  )
}

// A labelled row of stats — the label makes the *level* explicit (topology counts vs
// message counts are different things and must never read as one flat strip).
export function StatStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{children}</div>
    </div>
  )
}

export function Stat({
  label,
  v,
  state,
  tone,
  onClick,
}: {
  label: string
  v?: number | string
  state?: string
  tone?: 'danger' | 'warn'
  onClick?: () => void
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-foreground'
  return (
    <Card
      onClick={onClick}
      className={cn('px-3 py-2.5', onClick && 'cursor-pointer transition-colors hover:bg-muted/40')}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {state && <Dot state={state} />}
        {label}
      </div>
      <div className={cn('mt-0.5 text-xl font-semibold tabular-nums', color)}>{v ?? '·'}</div>
    </Card>
  )
}

// A filter expression rendered as code — or a clear "match all" when empty.
export function FilterCode({ expr, className }: { expr: string; className?: string }) {
  if (!expr)
    return <span className={cn('text-xs italic text-faint', className)}>match all messages</span>
  return (
    <code
      className={cn(
        'rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/90 break-all',
        className,
      )}
    >
      {expr}
    </code>
  )
}
