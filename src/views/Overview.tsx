import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { createQueue, listQueues, stats } from '../lib/api'
import type { Metrics, QueueInfo } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorBanner, Input, Label, Select, Spinner } from '../components/ui'
import { ago, fmtNum } from '../lib/format'

interface Row extends QueueInfo {
  m?: Metrics
}

export function Overview({ onOpen }: { onOpen: (q: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const qs = await listQueues()
      const withStats = await Promise.all(
        qs.map(async (q) => ({ ...q, m: await stats(q.name).catch(() => undefined) })),
      )
      setRows(withStats)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load queues')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const totalDlq = rows?.reduce((s, r) => s + (r.m?.dead_lettered ?? 0), 0) ?? 0

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">queues</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows ? `${rows.length} target${rows.length === 1 ? '' : 's'}` : '…'}
            {totalDlq > 0 && (
              <>
                {' · '}
                <span className="text-danger">{fmtNum(totalDlq)} dead-lettered</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            refresh
          </Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            + queue
          </Button>
        </div>
      </header>

      {creating && (
        <CreateQueueForm
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            load()
          }}
        />
      )}

      {err && (
        <div className="mt-4">
          <ErrorBanner message={err} />
        </div>
      )}

      {!rows ? (
        <Spinner label="loading queues" />
      ) : rows.length === 0 ? (
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
              {rows.map((r) => (
                <tr
                  key={r.name}
                  onClick={() => onOpen(r.name)}
                  className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{r.name}</span>
                      {r.kind === 'subscription' && (
                        <Badge tone="info" className="h-4 px-1.5 text-[10px]">
                          sub
                        </Badge>
                      )}
                    </div>
                  </td>
                  <Num v={r.m?.active} />
                  <Num v={r.m?.locked} tone={r.m?.locked ? 'warn' : undefined} />
                  <Num v={r.m?.scheduled} />
                  <Num v={r.m?.dead_lettered} tone={r.m?.dead_lettered ? 'danger' : undefined} />
                  <Num v={r.m?.total} bold />
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">
                    {r.m?.oldest_message_age_ms ? ago(Date.now() - r.m.oldest_message_age_ms) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-faint">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium text-center ${className ?? ''}`}>{children}</th>
}

function Num({ v, tone, bold }: { v?: number; tone?: 'warn' | 'danger'; bold?: boolean }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : bold ? 'text-foreground' : 'text-muted-foreground'
  return (
    <td className={`px-3 py-2.5 text-center tabular-nums ${color} ${bold ? 'font-semibold' : ''}`}>
      {v === undefined ? '·' : fmtNum(v)}
    </td>
  )
}

function CreateQueueForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [ordering, setOrdering] = useState('standard')
  const [maxDelivery, setMaxDelivery] = useState('10')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      await createQueue(name.trim(), {
        ordering_mode: ordering,
        max_delivery_count: Number(maxDelivery) || 0,
      })
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
        <div className="sm:col-span-1">
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
          <Label>max delivery</Label>
          <Input type="number" value={maxDelivery} onChange={(e) => setMaxDelivery(e.target.value)} />
        </div>
      </div>
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
