import { useState, type ReactNode } from 'react'
import { createQueue } from '../lib/api'
import type { QueueConfig } from '../lib/types'
import { useTopology } from '../lib/useTopology'
import { Badge, Button, Card, Empty, ErrorBanner, Input, Label, PageHeader, Select, Spinner } from '../components/ui'
import { Time } from '../components/Time'
import { fmtNum } from '../lib/format'

const TIME_UNITS = [
  { label: 'seconds', ms: 1000 },
  { label: 'minutes', ms: 60_000 },
  { label: 'hours', ms: 3_600_000 },
  { label: 'days', ms: 86_400_000 },
]
const BYTE_UNITS = [
  { label: 'KB', mul: 1024 },
  { label: 'MB', mul: 1_048_576 },
  { label: 'GB', mul: 1_073_741_824 },
]
const ms = (n: string, unit: string) => (Number(n) > 0 ? Number(n) * Number(unit) : 0)

// number + unit-select → a duration in ms (0 when blank).
function DurField({ n, setN, u, setU }: { n: string; setN: (v: string) => void; u: string; setU: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input type="number" min="0" className="w-24" value={n} onChange={(e) => setN(e.target.value)} placeholder="0" />
      <Select value={u} onChange={(e) => setU(e.target.value)} className="flex-1">
        {TIME_UNITS.map((x) => (
          <option key={x.ms} value={x.ms}>
            {x.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

export function Queues({ onOpen }: { onOpen: (name: string) => void }) {
  const { queues, metrics, loading, err, reload } = useTopology()
  const [creating, setCreating] = useState(false)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="queues"
        subtitle={loading ? '…' : `${queues.length} queue${queues.length === 1 ? '' : 's'} · point-to-point`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              refresh
            </Button>
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              + queue
            </Button>
          </>
        }
      />

      {creating && (
        <CreateQueueForm
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            reload()
          }}
        />
      )}

      {err && (
        <div className="mt-4">
          <ErrorBanner message={err} />
        </div>
      )}

      {loading ? (
        <Spinner label="loading queues" />
      ) : queues.length === 0 ? (
        <Empty>no queues yet — create one above</Empty>
      ) : (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <Th className="text-left">queue</Th>
                <Th>active</Th>
                <Th>locked</Th>
                <Th>scheduled</Th>
                <Th>dlq</Th>
                <Th>total</Th>
                <Th>oldest</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => {
                const m = metrics[q.name]
                return (
                  <tr
                    key={q.name}
                    onClick={() => onOpen(q.name)}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{q.name}</span>
                        {q.kind && q.kind !== 'queue' && (
                          <Badge tone="outline" className="h-4 px-1.5 text-[10px]">
                            {q.kind}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <Num v={m?.active} />
                    <Num v={m?.locked} tone={m?.locked ? 'warn' : undefined} />
                    <Num v={m?.scheduled} />
                    <Num v={m?.dead_lettered} tone={m?.dead_lettered ? 'danger' : undefined} />
                    <Num v={m?.total} bold />
                    <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                      {m?.oldest_message_age_ms ? <Time ms={Date.now() - m.oldest_message_age_ms} /> : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-faint">→</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-center font-medium ${className ?? ''}`}>{children}</th>
}

function Num({ v, tone, bold }: { v?: number; tone?: 'warn' | 'danger'; bold?: boolean }) {
  const color =
    tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : bold ? 'text-foreground' : 'text-muted-foreground'
  return (
    <td className={`px-3 py-2.5 text-center tabular-nums ${color} ${bold ? 'font-semibold' : ''}`}>
      {v === undefined ? '·' : fmtNum(v)}
    </td>
  )
}

// Every QueueConfig field the API accepts (Web↔API parity). Blank duration/count = inherit
// the broker default; the field is only sent when set.
function CreateQueueForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [ordering, setOrdering] = useState('standard')
  const [maxDelivery, setMaxDelivery] = useState('10')
  const [lockN, setLockN] = useState('30')
  const [lockU, setLockU] = useState(String(1000))
  const [ttlN, setTtlN] = useState('')
  const [ttlU, setTtlU] = useState(String(3_600_000))
  const [dle, setDle] = useState('default') // dead-letter on expire: default | dlq | discard
  const [dedupN, setDedupN] = useState('')
  const [dedupU, setDedupU] = useState(String(60_000))
  const [more, setMore] = useState(false)
  const [ageN, setAgeN] = useState('')
  const [ageU, setAgeU] = useState(String(86_400_000))
  const [maxCount, setMaxCount] = useState('')
  const [bytesN, setBytesN] = useState('')
  const [bytesU, setBytesU] = useState(String(1_048_576))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    const cfg: QueueConfig = { ordering_mode: ordering }
    if (Number(maxDelivery) > 0) cfg.max_delivery_count = Number(maxDelivery)
    if (ms(lockN, lockU) > 0) cfg.lock_duration_ms = ms(lockN, lockU)
    if (ms(ttlN, ttlU) > 0) cfg.default_ttl_ms = ms(ttlN, ttlU)
    if (ms(dedupN, dedupU) > 0) cfg.dedup_window_ms = ms(dedupN, dedupU)
    if (dle === 'dlq') cfg.dead_letter_on_expire = true
    else if (dle === 'discard') cfg.dead_letter_on_expire = false
    if (ms(ageN, ageU) > 0) cfg.dlq_max_age_ms = ms(ageN, ageU)
    if (Number(maxCount) > 0) cfg.dlq_max_count = Number(maxCount)
    if (Number(bytesN) > 0) cfg.dlq_max_bytes = Number(bytesN) * Number(bytesU)
    try {
      await createQueue(name.trim(), cfg)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">new queue</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          close ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="orders" autoFocus />
        </div>
        <div>
          <Label>ordering</Label>
          <Select value={ordering} onChange={(e) => setOrdering(e.target.value)}>
            <option value="standard">standard</option>
            <option value="group_fifo">group_fifo</option>
            <option value="strict_fifo">strict_fifo</option>
          </Select>
        </div>
        <div>
          <Label>max delivery count</Label>
          <Input type="number" min="0" value={maxDelivery} onChange={(e) => setMaxDelivery(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>lock duration</Label>
          <DurField n={lockN} setN={setLockN} u={lockU} setU={setLockU} />
        </div>
        <div>
          <Label>dedup window (blank = off)</Label>
          <DurField n={dedupN} setN={setDedupN} u={dedupU} setU={setDedupU} />
        </div>
        <div>
          <Label>default TTL (blank = none)</Label>
          <DurField n={ttlN} setN={setTtlN} u={ttlU} setU={setTtlU} />
        </div>
        <div>
          <Label>on TTL expiry</Label>
          <Select value={dle} onChange={(e) => setDle(e.target.value)}>
            <option value="default">broker default</option>
            <option value="dlq">dead-letter</option>
            <option value="discard">discard</option>
          </Select>
        </div>
      </div>

      <button
        onClick={() => setMore((v) => !v)}
        className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {more ? '▾' : '▸'} DLQ retention overrides (per-queue) — blank inherits the broker default
      </button>
      {more && (
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>max age</Label>
            <DurField n={ageN} setN={setAgeN} u={ageU} setU={setAgeU} />
          </div>
          <div>
            <Label>max count</Label>
            <Input type="number" min="0" value={maxCount} onChange={(e) => setMaxCount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>max bytes</Label>
            <div className="flex gap-2">
              <Input type="number" min="0" className="w-24" value={bytesN} onChange={(e) => setBytesN(e.target.value)} placeholder="0" />
              <Select value={bytesU} onChange={(e) => setBytesU(e.target.value)} className="flex-1">
                {BYTE_UNITS.map((b) => (
                  <option key={b.mul} value={b.mul}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      )}

      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          cancel
        </Button>
        <Button size="sm" disabled={!name.trim() || busy} onClick={submit}>
          {busy ? 'creating…' : 'create'}
        </Button>
      </div>
    </Card>
  )
}
