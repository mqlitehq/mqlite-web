import { useTopology } from '../lib/useTopology.js'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  bodySize,
  cancel,
  decodeBody,
  findSubscription,
  peek,
  subscribe,
} from '../lib/api.js'
import type { DetailTarget } from '../components/Shell.js'
import type { MessageState, SubscriptionPageItem, WireMessage } from '../lib/types.js'
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
import { DeleteQueue } from '../components/delete-queue.js'
import { DeleteSubscription } from '../components/delete-subscription.js'
import { DLQActions } from '../components/DLQActions.js'
import { DeferredSettle } from '../components/DeferredSettle.js'
import { MessageDetail } from '../components/MessageDetail.js'
import { Time } from '../components/Time.js'
import { fmtBytes, fmtMs, fmtUTC } from '../lib/format.js'

const TABS: { key: MessageState; label: string }[] = [
  { key: 'active', label: 'active' },
  { key: 'scheduled', label: 'scheduled' },
  { key: 'deferred', label: 'deferred' },
  { key: 'dead_lettered', label: 'dead-letter' },
]

type SubscriptionLookup = 'loading' | 'found' | 'missing' | 'legacy' | 'error'

export function subscriptionRemaining(expiresAtMs: number, serverTimeMs?: number): string {
  if (expiresAtMs === 0) return 'permanent'
  if (!serverTimeMs) return 'unavailable — broker time not reported'
  const remaining = expiresAtMs - serverTimeMs
  return remaining <= 0 ? 'expired' : fmtMs(remaining)
}

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

  const {
    observation,
    queues,
    subscriptions,
    subscriptionInventoryMode,
    metrics,
    current: observationCurrent,
    reload: reloadAll,
    reloadObservation,
    reloadTopology,
    err: observationError,
  } = useTopology()
  const m = metrics[name]
  const queueState = isSub ? undefined : queues.find((queue) => queue.name === name)?.state
  const topologySubscription = isSub
    ? subscriptions.find((subscription) => subscription.topic === topic && subscription.name === name)
    : undefined
  const topologySubscriptionState = topologySubscription?.state
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionPageItem | null>(null)
  const [subscriptionLookup, setSubscriptionLookup] = useState<SubscriptionLookup>('loading')
  const [subscriptionError, setSubscriptionError] = useState('')
  const [savedExpr, setSavedExpr] = useState<string | null>(null)
  const subscriptionRequest = useRef(0)
  const subscriptionState =
    subscriptionLookup === 'found' ? subscriptionInfo?.state : topologySubscriptionState
  const lifecycleState = isSub ? subscriptionState : queueState
  const [deletionAccepted, setDeletionAccepted] = useState(lifecycleState === 'deleting')
  const subscriptionLoading = isSub && subscriptionLookup === 'loading'
  const subscriptionAbsent = isSub && subscriptionLookup === 'missing'
  // A completed lifecycle scan is authoritative for absence even if the cheaper
  // topology view still says deleting. Render exactly one state while it catches up.
  const deleting = !subscriptionAbsent && (lifecycleState === 'deleting' || deletionAccepted)
  const subscriptionMissing = subscriptionAbsent
  const brokerTime = observation?.server_time_ms || undefined
  const subscriptionExpired =
    isSub &&
    !deleting &&
    subscriptionLookup === 'found' &&
    !!subscriptionInfo?.expires_at_ms &&
    brokerTime !== undefined &&
    brokerTime >= subscriptionInfo.expires_at_ms
  const blocked = deleting || subscriptionLoading || subscriptionMissing || subscriptionExpired
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

  const loadSubscription = useCallback(async () => {
    if (!isSub || !topic || subscriptionInventoryMode !== 'paged') return
    const request = ++subscriptionRequest.current
    const superseded = () => request !== subscriptionRequest.current
    setSubscriptionLookup('loading')
    setSubscriptionError('')
    try {
      const current = await findSubscription(topic, name)
      if (superseded()) return
      if (!current) {
        setDeletionAccepted(false)
        setSubscriptionInfo(null)
        setExpr('')
        setSavedExpr('')
        setSubscriptionLookup('missing')
        return
      }
      setSubscriptionInfo(current)
      setExpr(current.expr)
      setSavedExpr(current.expr)
      setSubscriptionLookup('found')
    } catch (cause) {
      if (superseded()) return
      setSubscriptionInfo(null)
      setExpr('')
      setSavedExpr('')
      setSubscriptionLookup('error')
      setSubscriptionError(cause instanceof Error ? cause.message : 'Subscription lifecycle is unavailable.')
    }
  }, [isSub, name, subscriptionInventoryMode, topic])

  const loadMsgs = useCallback(async () => {
    if (blocked) {
      setMsgs([])
      setErr('')
      return
    }
    setMsgs(null)
    try {
      setMsgs(await peek(name, tab, 100))
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'peek failed')
    }
  }, [blocked, name, tab])

  useEffect(() => {
    if (subscriptionInventoryMode !== 'paged') return
    void loadSubscription()
    return () => {
      // Invalidate an in-flight lookup when the target changes or this detail view
      // unmounts. A later same-name view must never receive its stale result.
      subscriptionRequest.current++
    }
  }, [loadSubscription, subscriptionInventoryMode])
  useEffect(() => {
    if (!isSub || subscriptionInventoryMode !== 'legacy') return
    // Capability discovery is broker-scoped. Once the provider selected the
    // legacy inventory, consume that context row instead of probing Page again.
    subscriptionRequest.current++
    setSubscriptionError('')
    setSubscriptionInfo(null)
    if (!topologySubscription) {
      setDeletionAccepted(false)
      setExpr('')
      setSavedExpr('')
      setSubscriptionLookup('missing')
      return
    }
    setExpr(topologySubscription.expr)
    setSavedExpr(topologySubscription.expr)
    setSubscriptionLookup('legacy')
  }, [isSub, subscriptionInventoryMode, topologySubscription])
  useEffect(() => {
    if (lifecycleState === 'deleting') setDeletionAccepted(true)
  }, [lifecycleState])
  useEffect(() => {
    if (blocked && editFilter) {
      setEditFilter(false)
      setExpr(savedExpr ?? '')
    }
  }, [blocked, editFilter, savedExpr])
  useEffect(() => {
    loadMsgs()
  }, [loadMsgs])

  const refreshData = () => {
    reloadObservation()
    loadMsgs()
  }

  const refresh = () => {
    reloadAll()
    if (isSub) {
      // Loading blocks the subscription data plane. Its transition back to found
      // drives the single Peek through the loadMsgs effect, avoiding two racing reads.
      void loadSubscription()
    } else {
      loadMsgs()
    }
  }

  async function act(fn: () => Promise<string>) {
    setBusy(true)
    setNote('')
    setErr('')
    try {
      setNote(await fn())
      refreshData()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'action failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveFilter(next: string) {
    if (!topic || blocked) return
    setBusy(true)
    setErr('')
    setNote('')
    try {
      await subscribe(topic, name, next.trim() || undefined)
      const saved = next.trim()
      setExpr(saved)
      setSavedExpr(saved)
      setSubscriptionInfo((current) => (current ? { ...current, expr: saved } : current))
      setEditFilter(false)
      setNote('filter updated')
      reloadTopology()
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
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← {isSub ? 'topics' : 'queues'}
      </button>

      <div className="mt-1 [&>header]:flex-col [&>header]:items-stretch sm:[&>header]:flex-row sm:[&>header]:items-end">
        <PageHeader
          icon={<span className="text-faint">{isSub ? '◇' : '▸'}</span>}
          title={
            <span className="flex items-center gap-2">
              {isSub && topic && <span className="text-muted-foreground">{topic}</span>}
              {isSub && topic && <span className="text-faint">/</span>}
              {name}
              {isSub && <Badge tone="info">subscription</Badge>}
              {deleting && <Badge tone="warn">deleting</Badge>}
              {subscriptionExpired && <Badge tone="danger">expired</Badge>}
            </span>
          }
          subtitle={
            deleting ? (
              'cleanup in progress · name reserved'
            ) : subscriptionExpired ? (
              'expired at broker time · awaiting lifecycle cleanup'
            ) : m ? (
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
              {!isSub && (
                <DeleteQueue
                  name={name}
                  total={m?.total}
                  state={deleting ? 'deleting' : queueState}
                  onRefresh={reloadAll}
                  onDeleting={() => {
                    setDeletionAccepted(true)
                    reloadAll()
                  }}
                  onDeleted={() => {
                    reloadAll()
                    onBack()
                  }}
                />
              )}
              {isSub && topic && (deleting || !blocked) && (
                <DeleteSubscription
                  topic={topic}
                  name={name}
                  total={m?.total}
                  state={deleting ? 'deleting' : subscriptionState}
                  onRefresh={reloadAll}
                  onDeleting={() => {
                    setDeletionAccepted(true)
                    reloadAll()
                  }}
                  onDeleted={() => {
                    reloadAll()
                    onBack()
                  }}
                />
              )}
              <Button variant="outline" size="sm" onClick={refresh}>
                refresh
              </Button>
              {!blocked && (
                <Button size="sm" onClick={() => setPanel((v) => !v)}>
                  {isSub ? '+ publish' : '+ send'}
                </Button>
              )}
            </>
          }
        />
      </div>

      {deleting && (
        <Card className="mt-4 border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
          Deletion has been accepted. {isSub ? 'Subscription fan-out and work are' : 'Queue work is'} blocked while
          bounded cleanup runs in the background. The {isSub ? 'subscription' : 'queue'} name cannot be reused until
          this row disappears.
        </Card>
      )}

      {subscriptionMissing && (
        <Card
          role="status"
          aria-live="polite"
          className="mt-4 border border-warn/30 bg-warn/5 p-4 text-sm text-warn"
        >
          This subscription was not present in the latest lifecycle scan. It may have expired or been deleted;
          refresh the inventory before acting on the same name.
        </Card>
      )}

      {subscriptionExpired && (
        <Card
          role="status"
          aria-live="polite"
          className="mt-4 border border-warn/30 bg-warn/5 p-4 text-sm text-warn"
        >
          The broker clock has reached this subscription&apos;s fixed expiry. Subscription actions are blocked while
          lifecycle cleanup catches up; refresh the inventory to confirm removal.
        </Card>
      )}

      {isSub && !subscriptionAbsent && (
        <Card className="mt-4 p-4" aria-label="subscription lifecycle">
          <div className="text-xs font-medium uppercase tracking-wide text-faint">lifecycle</div>
          {subscriptionLookup === 'loading' ? (
            <p className="mt-2 text-xs text-faint">loading…</p>
          ) : subscriptionLookup === 'found' && subscriptionInfo ? (
            <dl className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <div>
                <dt className="text-faint">created (UTC)</dt>
                <dd className="mt-0.5 break-all tabular-nums text-foreground/80">
                  <time dateTime={fmtUTC(subscriptionInfo.created_at_ms)}>
                    {fmtUTC(subscriptionInfo.created_at_ms)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-faint">expires (UTC)</dt>
                <dd className="mt-0.5 break-all tabular-nums text-foreground/80">
                  {subscriptionInfo.expires_at_ms === 0 ? (
                    'permanent · no expiry'
                  ) : (
                    <time dateTime={fmtUTC(subscriptionInfo.expires_at_ms)}>
                      {fmtUTC(subscriptionInfo.expires_at_ms)}
                    </time>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-faint">remaining at broker time</dt>
                <dd className="mt-0.5 text-foreground/80">
                  {subscriptionRemaining(subscriptionInfo.expires_at_ms, brokerTime)}
                  {!observationCurrent && brokerTime ? ' · stale broker sample' : ''}
                </dd>
              </div>
            </dl>
          ) : subscriptionLookup === 'legacy' ? (
            <p className="mt-2 text-xs text-faint">
              This broker does not expose subscription lifecycle timestamps.
            </p>
          ) : (
            <ErrorBanner message={subscriptionError || 'Subscription lifecycle is unavailable.'} />
          )}
        </Card>
      )}

      {!blocked && (
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
      )}

      {/* subscription filter — the online editor lives here. */}
      {isSub && !subscriptionAbsent && (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-faint">filter</span>
            {!blocked && !editFilter && (
              <Button variant="ghost" size="sm" onClick={() => setEditFilter(true)}>
                edit filter
              </Button>
            )}
          </div>
          {editFilter && !blocked ? (
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
                    setExpr(savedExpr ?? subscriptionInfo?.expr ?? topologySubscription?.expr ?? '')
                  }}
                >
                  cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              {expr === null ? (
                <span className="text-xs text-faint">loading…</span>
              ) : (
                <FilterCode expr={expr} />
              )}
            </div>
          )}
        </Card>
      )}

      {!blocked && panel &&
        (isSub && topic ? (
          <Card className="mt-4 p-4">
            <div className="mb-3 text-sm font-medium">publish to {topic}</div>
            <PublishPanel topic={topic} bordered={false} onPublished={refreshData} />
          </Card>
        ) : (
          <SendPanel queue={name} onClose={() => setPanel(false)} onSent={refreshData} />
        ))}

      {!blocked && showRecv && <Receiver queue={name} onClose={() => setShowRecv(false)} onChanged={refreshData} />}

      {!blocked && (
        <div className="mt-5 flex flex-wrap items-center gap-1 border-b border-border">
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
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !m?.active}
                onClick={() => setShowRecv((v) => !v)}
              >
                receive
              </Button>
            )}
          </div>
        </div>
      )}

      {!blocked && tab === 'dead_lettered' && <DLQActions queue={name} busy={busy} run={act} />}

      {note && <p className="mt-3 text-xs text-ok">✓ {note}</p>}
      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}

      {!blocked &&
        (!msgs ? (
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
                        {!msg.subject && !msg.message_id && !msg.group_id && (
                          <span className="text-faint">—</span>
                        )}
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
                              <span className="text-[11px] text-faint">
                                removes it before it ever activates
                              </span>
                            </div>
                          )}
                          {msg.state === 'deferred' && msg.seq_number != null && (
                            <div className="border-t border-border bg-surface-2/40 px-4 py-2">
                              <DeferredSettle
                                queue={name}
                                seq={msg.seq_number}
                                onDone={() => {
                                  setOpenSeq(null)
                                  refreshData()
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
        ))}
    </div>
  )
}
