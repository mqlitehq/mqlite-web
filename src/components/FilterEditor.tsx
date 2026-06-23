import { useEffect, useRef, useState } from 'react'
import { testFilter, type FilterSample } from '../lib/api'
import type { FilterTest } from '../lib/types'
import { Badge, Button, Input, Label, Textarea } from './ui'
import { cn } from '../lib/cn'

// The online filter editor. An expr-lang predicate is validated *as you type* (the broker
// compiles it via TestFilter) and can be run against a sample message to see whether it
// would route — the exact publish-time evaluation, server-side, never a re-implementation.
export function FilterEditor({
  expr,
  onChange,
  onSave,
  saveLabel = 'save filter',
  busy,
}: {
  expr: string
  onChange: (v: string) => void
  onSave?: (expr: string) => void
  saveLabel?: string
  busy?: boolean
}) {
  // live compile check (debounced), with no sample → {valid, error}.
  const [check, setCheck] = useState<FilterTest | null>(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    if (!expr.trim()) {
      setCheck({ valid: true, ran: false, matched: false })
      return
    }
    setChecking(true)
    const id = setTimeout(() => {
      testFilter(expr)
        .then(setCheck)
        .catch(() => setCheck(null))
        .finally(() => setChecking(false))
    }, 350)
    return () => clearTimeout(id)
  }, [expr])

  const valid = check?.valid ?? null

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="mb-0">filter expression</Label>
          <Status checking={checking} valid={valid} error={check?.error} empty={!expr.trim()} />
        </div>
        <Textarea
          rows={2}
          spellCheck={false}
          value={expr}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'properties["tier"] == "gold" && body_json.amount > 100'}
          className={cn(
            'font-mono',
            valid === false && 'border-danger focus-visible:border-danger',
            valid === true && expr.trim() && 'border-ok/60',
          )}
        />
        {check?.error && <p className="mt-1 font-mono text-xs text-danger">{check.error}</p>}
        {!expr.trim() && (
          <p className="mt-1 text-xs text-faint">empty = match every message published to the topic</p>
        )}
      </div>

      <Cheatsheet onInsert={(snippet) => onChange(expr ? `${expr} && ${snippet}` : snippet)} />

      <SampleTester expr={expr} canRun={valid !== false} />

      {onSave && (
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || valid === false} onClick={() => onSave(expr)}>
            {busy ? 'saving…' : saveLabel}
          </Button>
        </div>
      )}
    </div>
  )
}

function Status({
  checking,
  valid,
  error,
  empty,
}: {
  checking: boolean
  valid: boolean | null
  error?: string
  empty: boolean
}) {
  if (checking) return <span className="text-xs text-muted-foreground animate-pulse">checking…</span>
  if (empty) return <Badge tone="info">match all</Badge>
  if (valid === true) return <Badge tone="ok">✓ valid</Badge>
  if (valid === false) return <Badge tone="danger">✗ {error ? 'invalid' : 'error'}</Badge>
  return null
}

// Test the expression against a hand-built sample message — the killer feature: see whether
// a given message *would* route before you commit the filter.
function SampleTester({ expr, canRun }: { expr: string; canRun: boolean }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('orders.created')
  const [props, setProps] = useState<{ k: string; v: string }[]>([{ k: 'tier', v: 'gold' }])
  const [body, setBody] = useState('{"amount": 250}')
  const [result, setResult] = useState<FilterTest | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  async function run() {
    setBusy(true)
    const sample: FilterSample = {
      ...(subject ? { subject } : {}),
      properties: Object.fromEntries(props.filter((p) => p.k).map((p) => [p.k, p.v])),
      ...(body ? { bodyText: body } : {}),
    }
    const mine = ++seq.current
    try {
      const r = await testFilter(expr, sample)
      if (mine === seq.current) setResult(r)
    } catch {
      if (mine === seq.current) setResult(null)
    } finally {
      if (mine === seq.current) setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{open ? '▾' : '▸'} test against a sample message</span>
        {result && !open && <ResultBadge r={result} />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div>
            <Label>subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="orders.created" />
          </div>
          <div>
            <Label>properties</Label>
            <div className="space-y-1.5">
              {props.map((p, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input
                    className="flex-1"
                    placeholder="key"
                    value={p.k}
                    onChange={(e) => setProps((ps) => ps.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
                  />
                  <Input
                    className="flex-1"
                    placeholder="value"
                    value={p.v}
                    onChange={(e) => setProps((ps) => ps.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setProps((ps) => ps.filter((_, j) => j !== i))}
                    aria-label="remove property"
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setProps((ps) => [...ps, { k: '', v: '' }])}>
                + property
              </Button>
            </div>
          </div>
          <div>
            <Label>body</Label>
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"amount": 250}' className="font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" disabled={busy || !canRun} onClick={run}>
              {busy ? 'evaluating…' : 'evaluate'}
            </Button>
            {result && <ResultBadge r={result} />}
            {result?.error && <span className="font-mono text-xs text-danger">{result.error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultBadge({ r }: { r: FilterTest }) {
  if (!r.valid) return <Badge tone="danger">invalid expression</Badge>
  if (!r.ran) return <Badge tone="neutral">no sample</Badge>
  return r.matched ? <Badge tone="ok">✓ would route</Badge> : <Badge tone="warn">✕ filtered out</Badge>
}

// A compact reference of the message environment, click to insert.
const SNIPPETS: { label: string; snippet: string }[] = [
  { label: 'subject', snippet: 'subject == "orders.created"' },
  { label: 'subject prefix', snippet: 'subject startsWith "orders."' },
  { label: 'subject part', snippet: 'subject_parts[0] == "orders"' },
  { label: 'property', snippet: 'properties["tier"] == "gold"' },
  { label: 'has property', snippet: '"tier" in properties' },
  { label: 'body field', snippet: 'body_json.amount > 100' },
  { label: 'body text', snippet: 'body_text contains "urgent"' },
]
function Cheatsheet({ onInsert }: { onInsert: (snippet: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-xs">
      <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground transition-colors hover:text-foreground">
        {open ? '▾' : '▸'} expression reference
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => onInsert(s.snippet)}
              title={s.snippet}
              className="rounded-md border border-border-strong px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
