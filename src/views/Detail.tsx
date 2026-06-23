import { useCallback, useEffect, useState } from 'react'
import {
  bodySize,
  complete,
  decodeBody,
  listSubscriptions,
  peek,
  purge,
  receive,
  redrive,
  stats,
  subscribe,
} from '../lib/api'
import type { DetailTarget } from '../components/Shell'
import type { Metrics, MessageState, WireMessage } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBanner,
  FilterCode,
  PageHeader,
  Spinner,
  Stat,
  StatStrip,
} from '../components/ui'
import { FilterEditor } from '../components/FilterEditor'
import { PublishPanel, SendPanel } from '../components/Composer'
import { Time } from '../components/Time'
import { fmtBytes } from '../lib/format'

const TABS: { key: MessageState; label: string }[] = [
  { key: 'active', label: 'active' },
  { key: 'scheduled', label: 'scheduled' },
  { key: 'deferred', label: 'deferred' },
  { key: 'dead_lettered', label: 'dead-letter' },
]

export function Detail({
  target,
  onBack,
}: {
  target: DetailTarget
  onBack: () => void
  onOpenSub: (topic: string, name: string) => void
}) {
  const { name, kind, topic } = target
  const isSub = kind === 'subscription'

  const [m, setM] = useState<Metrics | null>(null)
  const [expr, setExpr] = useState<string | null>(null) // subscription filter (null until loaded)
  const [tab, setTab] = useState<MessageState>('active')
  const [msgs, setMsgs] = useState<WireMessage[] | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState(false) // send / publish composer
  const [editFilter, setEditFilter] = useState(false)

  const loadStats = useCallback(() => {
    stats(name).then(setM).catch(() => undefined)
  }, [name])

  const loadExpr = useCallback(() => {
    if (!isSub) return
    listSubscriptions()
      .then((subs) => setExpr(subs.find((s) => s.name === name)?.expr ?? ''))
      .catch(() => setExpr(''))
  }, [isSub, name])

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
    loadExpr()
    const t = setInterval(loadStats, 5000)
    return () => clearInterval(t)
  }, [loadStats, loadExpr])
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

  async function saveFilter(next: string) {
    if (!topic) return
    setBusy(true)
    setErr('')
    setNote('')
    try {
      await subscribe(topic, name, next.trim() || undefined)
      setExpr(next.trim())
      setEditFilter(false)
      setNote('filter updated')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to update filter')
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
        ← {isSub ? 'topics' : 'queues'}
      </button>

      <div className="mt-1">
        <PageHeader
          icon={<span className="text-faint">{isSub ? '◇' : '▸'}</span>}
          title={
            <span className="flex items-center gap-2">
              {isSub && topic && <span className="text-muted-foreground">{topic}</span>}
              {isSub && topic && <span className="text-faint">/</span>}
              {name}
              {isSub && <Badge tone="info">subscription</Badge>}
            </span>
          }
          subtitle={
            m ? (
              <span>
                {m.total} total
                {m.oldest_message_age_ms > 0 && (
                  <>
                    {' · oldest '}
                    <Time ms={Date.now() - m.oldest_message_age_ms} />
                  </>
                )}
              </span>
            ) : (
              '…'
            )
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={refresh}>
                refresh
              </Button>
              <Button size="sm" onClick={() => setPanel((v) => !v)}>
                {isSub ? '+ publish' : '+ send'}
              </Button>
            </>
          }
        />
      </div>

      <div className="mt-4">
        <StatStrip label="messages">
          <Stat label="active" v={m?.active} state="active" />
          <Stat label="locked" v={m?.locked} state="locked" tone={m?.locked ? 'warn' : undefined} />
          <Stat label="scheduled" v={m?.scheduled} state="scheduled" />
          <Stat label="deferred" v={m?.deferred} state="deferred" />
          <Stat label="dead-letter" v={m?.dead_lettered} state="dead_lettered" tone={m?.dead_lettered ? 'danger' : undefined} />
          <Stat label="total" v={m?.total} />
        </StatStrip>
      </div>

      {/* subscription filter — the online editor lives here. */}
      {isSub && (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-faint">filter</span>
            {!editFilter && (
              <Button variant="ghost" size="sm" onClick={() => setEditFilter(true)}>
                edit filter
              </Button>
            )}
          </div>
          {editFilter ? (
            <div className="mt-3">
              <FilterEditor
                expr={expr ?? ''}
                onChange={setExpr}
                onSave={saveFilter}
                saveLabel="update filter"
                busy={busy}
              />
              <div className="mt-2 flex justify-start">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditFilter(false)
                    loadExpr()
                  }}
                >
                  cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {expr === null ? <span className="text-xs text-faint">loading…</span> : <FilterCode expr={expr} />}
            </div>
          )}
        </Card>
      )}

      {panel &&
        (isSub && topic ? (
          <Card className="mt-4 p-4">
            <div className="mb-3 text-sm font-medium">publish to {topic}</div>
            <PublishPanel topic={topic} bordered={false} onPublished={refresh} />
          </Card>
        ) : (
          <SendPanel queue={name} onClose={() => setPanel(false)} onSent={refresh} />
        ))}

      <div className="mt-5 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.key ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
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
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !m?.dead_lettered}
                onClick={() => act(async () => `redrove ${await redrive(name)} message(s)`)}
              >
                redrive all
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy || !m?.dead_lettered}
                onClick={() => act(async () => `purged ${await purge(name)} message(s)`)}
              >
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
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    <Time ms={msg.enqueued_at_ms} />
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {msg.delivery_count ? <span className="text-warn">{msg.delivery_count}</span> : <span className="text-faint">0</span>}
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <div className="truncate font-mono text-xs text-foreground/90">
                      {decodeBody(msg.body) || <span className="text-faint">—</span>}
                    </div>
                    <div className="text-[10px] text-faint">{fmtBytes(bodySize(msg.body))}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {msg.subject && <div className="text-foreground/80">{msg.subject}</div>}
                    {msg.message_id && <div className="text-faint">{msg.message_id}</div>}
                    {msg.group_id && (
                      <Badge tone="outline" className="mt-0.5 h-4 px-1.5 text-[10px]">
                        {msg.group_id}
                      </Badge>
                    )}
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
  const msg = got[0]
  if (msg.seq_number && msg.lock_token) {
    await complete(name, msg.seq_number, msg.lock_token)
    return `received + completed seq ${msg.seq_number}`
  }
  return 'received a message'
}
