import { useState, type ReactNode } from 'react'
import { createQueue } from '../lib/api'
import { useTopology } from '../lib/useTopology'
import { Badge, Button, Card, Empty, ErrorBanner, Input, Label, PageHeader, Select, Spinner } from '../components/ui'
import { Time } from '../components/Time'
import { fmtNum } from '../lib/format'

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
      await createQueue(name.trim(), { ordering_mode: ordering, max_delivery_count: Number(maxDelivery) || 0 })
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
