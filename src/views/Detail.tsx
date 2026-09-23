import { useTopology } from '../lib/useTopology.js'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { bodySize, cancel, decodeBody, listSubscriptions, peek, subscribe } from '../lib/api.js'
import type { DetailTarget } from '../components/Shell.js'
import type { MessageState, WireMessage } from '../lib/types.js'
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
} from '../components/ui.js'
import { FilterEditor } from '../components/FilterEditor.js'
import { PublishPanel, SendPanel } from '../components/Composer.js'
import { Receiver } from '../components/Receiver.js'
import { DLQActions } from '../components/DLQActions.js'
import { DeferredSettle } from '../components/DeferredSettle.js'
import { MessageDetail } from '../components/MessageDetail.js'
import { Time } from '../components/Time.js'
import { fmtBytes } from '../lib/format.js'

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

  const { metrics, reload: loadStats, err: observationError } = useTopology()
  const m = metrics[name]
  const [expr, setExpr] = useState<string | null>(null) // subscription filter (null until loaded)
  const [tab, setTab] = useState<MessageState>('active')
  const [msgs, setMsgs] = useState<WireMessage[] | null>(null)
  const [openSeq, setOpenSeq] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState(false) // send / publish composer
  const [showRecv, setShowRecv] = useState(false) // receive & settle
  const [editFilter, setEditFilter] = useState(false)

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
    loadExpr()
  }, [loadExpr])
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
      {observationError && <ErrorBanner message={observationError} />}
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
          <Stat
            label="dead-letter"
            v={m?.dead_lettered}
            state="dead_lettered"
            tone={m?.dead_lettered ? 'danger' : undefined}
          />
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

      {showRecv && <Receiver queue={name} onClose={() => setShowRecv(false)} onChanged={refresh} />}

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
          {tab === 'active' && (
            <Button variant="outline" size="sm" disabled={busy || !m?.active} onClick={() => setShowRecv((v) => !v)}>
              receive
            </Button>
          )}
        </div>
      </div>

      {tab === 'dead_lettered' && <DLQActions queue={name} busy={busy} run={act} />}

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
              {msgs.map((msg) => {
                const open = openSeq === msg.seq_number
                const cols = tab === 'dead_lettered' ? 6 : 5
                return (
                  <Fragment key={msg.seq_number}>
                    <tr
                      onClick={() => setOpenSeq(open ? null : (msg.seq_number ?? null))}
                      className="cursor-pointer border-b border-border/60 align-top last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        <span className="mr-1 text-faint">{open ? '▾' : '▸'}</span>
                        {msg.seq_number}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        <Time ms={msg.enqueued_at_ms} />
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">
                        {msg.delivery_count ? (
                          <span className="text-warn">{msg.delivery_count}</span>
                        ) : (
                          <span className="text-faint">0</span>
                        )}
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
                        {msg.properties && Object.keys(msg.properties).length > 0 && (
                          <div className="text-faint">{Object.keys(msg.properties).length} props</div>
                        )}
                        {!msg.subject && !msg.message_id && !msg.group_id && <span className="text-faint">—</span>}
                      </td>
                      {tab === 'dead_lettered' && (
                        <td className="px-3 py-2 text-xs text-danger/90">
                          {msg.dead_letter_reason ?? '—'}
                          {msg.dead_letter_description && (
                            <div className="text-faint">{msg.dead_letter_description}</div>
                          )}
                        </td>
                      )}
                    </tr>
                    {open && (
                      <tr className="border-b border-border/60">
                        <td colSpan={cols} className="p-0">
                          <MessageDetail m={msg} />
                          {msg.state === 'scheduled' && msg.seq_number != null && (
                            <div className="flex items-center gap-3 border-t border-border bg-surface-2/40 px-4 py-2">
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  act(async () => {
                                    await cancel(name, msg.seq_number!)
                                    setOpenSeq(null)
                                    return `cancelled scheduled seq ${msg.seq_number}`
                                  })
                                }
                              >
                                cancel — delete this scheduled message
                              </Button>
                              <span className="text-[11px] text-faint">removes it before it ever activates</span>
                            </div>
                          )}
                          {msg.state === 'deferred' && msg.seq_number != null && (
                            <div className="border-t border-border bg-surface-2/40 px-4 py-2">
                              <DeferredSettle
                                queue={name}
                                seq={msg.seq_number}
                                onDone={() => {
                                  setOpenSeq(null)
                                  refresh()
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
