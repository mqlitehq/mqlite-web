import { useCallback, useEffect, useState } from 'react'
import {
  abandon,
  bodySize,
  complete,
  decodeBody,
  peek,
  purge,
  receive,
  redrive,
  send,
  stats,
} from '../lib/api'
import type { Metrics, MessageState, WireMessage } from '../lib/types'
import { Badge, Button, Card, Dot, Empty, ErrorBanner, Input, Label, Spinner, Textarea } from '../components/ui'
import { ago, fmtBytes } from '../lib/format'

const TABS: { key: MessageState; label: string }[] = [
  { key: 'active', label: 'active' },
  { key: 'scheduled', label: 'scheduled' },
  { key: 'deferred', label: 'deferred' },
  { key: 'dead_lettered', label: 'dead-letter' },
]

export function QueueDetail({ name, onBack }: { name: string; onBack: () => void }) {
  const [m, setM] = useState<Metrics | null>(null)
  const [tab, setTab] = useState<MessageState>('active')
  const [msgs, setMsgs] = useState<WireMessage[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSend, setShowSend] = useState(false)

  const loadStats = useCallback(() => {
    stats(name).then(setM).catch(() => undefined)
  }, [name])

  const loadMsgs = useCallback(async () => {
    setMsgs(null)
    try {
      setMsgs(await peek(name, tab, 100))
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'peek failed')
    }
  }, [name, tab])

  useEffect(() => {
    loadStats()
    const t = setInterval(loadStats, 5000)
    return () => clearInterval(t)
  }, [loadStats])
  useEffect(() => {
    loadMsgs()
  }, [loadMsgs])

  const refresh = () => {
    loadStats()
    loadMsgs()
  }

  async function act(fn: () => Promise<string>) {
    setBusy(true)
    setNote('')
    setErr('')
    try {
      setNote(await fn())
      refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'action failed')
    } finally {
      setBusy(false)
    }
  }

  const counts: Record<MessageState, number | undefined> = {
    active: m?.active,
    locked: m?.locked,
    scheduled: m?.scheduled,
    deferred: m?.deferred,
    dead_lettered: m?.dead_lettered,
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={onBack} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
        ← queues
      </button>
      <header className="mt-1 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span className="text-accent">▸</span>
            {name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {m ? `${m.total} total` : '…'}
            {m && m.oldest_message_age_ms > 0 && ` · oldest ${ago(Date.now() - m.oldest_message_age_ms)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            refresh
          </Button>
          <Button size="sm" onClick={() => setShowSend((v) => !v)}>
            + send
          </Button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="active" v={m?.active} state="active" />
        <Stat label="locked" v={m?.locked} state="locked" />
        <Stat label="scheduled" v={m?.scheduled} state="scheduled" />
        <Stat label="deferred" v={m?.deferred} state="deferred" />
        <Stat label="dlq" v={m?.dead_lettered} state="dead_lettered" />
        <Stat label="total" v={m?.total} />
      </div>

      {showSend && <SendPanel name={name} onClose={() => setShowSend(false)} onSent={refresh} />}

      <div className="mt-5 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {counts[t.key] !== undefined && counts[t.key]! > 0 && (
              <span className="ml-1.5 text-xs text-faint">{counts[t.key]}</span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-1">
          {tab === 'dead_lettered' && (
            <>
              <Button variant="outline" size="sm" disabled={busy || !m?.dead_lettered} onClick={() => act(async () => `redrove ${await redrive(name)} message(s)`)}>
                redrive all
              </Button>
              <Button variant="danger" size="sm" disabled={busy || !m?.dead_lettered} onClick={() => act(async () => `purged ${await purge(name)} message(s)`)}>
                purge
              </Button>
            </>
          )}
          {tab === 'active' && (
            <Button variant="outline" size="sm" disabled={busy || !m?.active} onClick={() => act(() => receiveOne(name))}>
              receive 1
            </Button>
          )}
        </div>
      </div>

      {note && <p className="mt-3 text-xs text-ok">✓ {note}</p>}
      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}

      {!msgs ? (
        <Spinner label="peeking" />
      ) : msgs.length === 0 ? (
        <Empty>no {tab.replace('_', '-')} messages</Empty>
      ) : (
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">seq</th>
                <th className="px-3 py-2 font-medium">enqueued</th>
                <th className="px-3 py-2 text-center font-medium">tries</th>
                <th className="px-3 py-2 font-medium">body</th>
                <th className="px-3 py-2 font-medium">subject / id</th>
                {tab === 'dead_lettered' && <th className="px-3 py-2 font-medium">reason</th>}
              </tr>
            </thead>
            <tbody>
              {msgs.map((msg) => (
                <tr key={msg.seq_number} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{msg.seq_number}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{ago(msg.enqueued_at_ms)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {msg.delivery_count ? <span className="text-warn">{msg.delivery_count}</span> : <span className="text-faint">0</span>}
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <div className="truncate font-mono text-xs text-foreground/90">{decodeBody(msg.body) || <span className="text-faint">—</span>}</div>
                    <div className="text-[10px] text-faint">{fmtBytes(bodySize(msg.body))}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {msg.subject && <div className="text-foreground/80">{msg.subject}</div>}
                    {msg.message_id && <div className="text-faint">{msg.message_id}</div>}
                    {msg.group_id && <Badge tone="outline" className="mt-0.5 h-4 px-1.5 text-[10px]">{msg.group_id}</Badge>}
                    {!msg.subject && !msg.message_id && !msg.group_id && <span className="text-faint">—</span>}
                  </td>
                  {tab === 'dead_lettered' && (
                    <td className="px-3 py-2 text-xs text-danger/90">
                      {msg.dead_letter_reason ?? '—'}
                      {msg.dead_letter_description && <div className="text-faint">{msg.dead_letter_description}</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// receive one message and immediately complete it (a manual drain, for testing).
async function receiveOne(name: string): Promise<string> {
  const got = await receive(name, 1, 0)
  if (got.length === 0) return 'nothing to receive'
  const m = got[0]
  if (m.seq_number && m.lock_token) {
    await complete(name, m.seq_number, m.lock_token)
    return `received + completed seq ${m.seq_number}`
  }
  // shouldn't happen; abandon to be safe so the message isn't stuck locked.
  if (m.seq_number && m.lock_token) await abandon(name, m.seq_number, m.lock_token)
  return 'received a message'
}

function Stat({ label, v, state }: { label: string; v?: number; state?: MessageState }) {
  return (
    <Card className="px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {state && <Dot state={state} />}
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{v ?? '·'}</div>
    </Card>
  )
}

function SendPanel({ name, onClose, onSent }: { name: string; onClose: () => void; onSent: () => void }) {
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [group, setGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  async function submit() {
    if (busy) return
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const seqs = await send(name, {
        bodyText: body,
        ...(subject ? { subject } : {}),
        ...(group ? { group_id: group } : {}),
      })
      setOk(`sent seq ${seqs.join(', ') || '—'}`)
      setBody('')
      onSent()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'send failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">send a message</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          close ✕
        </button>
      </div>
      <Label>body</Label>
      <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder='{"hello":"world"}' autoFocus />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <Label>subject (optional)</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="order.created" />
        </div>
        <div>
          <Label>group id (optional)</Label>
          <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="order-42" />
        </div>
      </div>
      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}
      {ok && <p className="mt-3 text-xs text-ok">✓ {ok}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          done
        </Button>
        <Button size="sm" disabled={busy} onClick={submit}>
          {busy ? 'sending…' : 'send'}
        </Button>
      </div>
    </Card>
  )
}
