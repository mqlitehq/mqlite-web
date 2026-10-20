import { useRef, useState } from 'react'
import { ApiError, listSubscriptionsPage, subscribe } from '../lib/api.js'
import { getEndpoint } from '../lib/auth.js'
import { formatDateTime } from '../lib/date-time.js'
import { useTopology, type Topic } from '../lib/useTopology.js'
import type { Metrics, SubscriptionOptions, SubscriptionPage } from '../lib/types.js'
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBanner,
  FilterCode,
  Input,
  Label,
  PageHeader,
  Spinner,
} from '../components/ui.js'
import { FilterEditor } from '../components/FilterEditor.js'
import { PublishPanel } from '../components/Composer.js'

export function Topics({ onOpenSub }: { onOpenSub: (topic: string, name: string) => void }) {
  const { topics, subscriptionTotal, subscriptionsPartial, metrics, observation, loading, err, reload } = useTopology()
  const lifecycle = Number(observation?.runtime.schema_version) >= 6
  const [creating, setCreating] = useState(false)
  const [publishTo, setPublishTo] = useState<string | null>(null)
  const [topicFilter, setTopicFilter] = useState('')
  const [page, setPage] = useState<SubscriptionPage | null>(null)
  const [pageTopic, setPageTopic] = useState('')
  const [pageBusy, setPageBusy] = useState(false)
  const [pageError, setPageError] = useState('')
  const pageRequest = useRef(0)

  async function loadPage(after?: string) {
    const topic = after ? pageTopic : topicFilter.trim()
    const request = ++pageRequest.current
    setPageBusy(true)
    setPageError('')
    try {
      const result = await listSubscriptionsPage({ ...(topic ? { topic } : {}), after, limit: 100, include_deleting: true })
      if (request !== pageRequest.current) return
      setPage(result)
      setPageTopic(topic)
    } catch (error) {
      if (request === pageRequest.current) setPageError(error instanceof Error ? error.message : 'Unable to load subscriptions.')
    } finally {
      if (request === pageRequest.current) setPageBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="topics"
        subtitle={
          loading
            ? '…'
            : `${topics.length} topic${topics.length === 1 ? '' : 's'}${subscriptionsPartial ? ' shown' : ''} · ${subscriptionTotal} subscription${subscriptionTotal === 1 ? '' : 's'} · publish/subscribe fan-out`
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={reload}>
              refresh
            </Button>
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              + subscription
            </Button>
          </>
        }
      />

      {creating && (
        <div className="mt-4">
          <NewSubscription
            topics={topics.map((t) => t.name)}
            lifecycle={lifecycle}
            onClose={() => setCreating(false)}
            onDone={() => {
              setCreating(false)
              reload()
            }}
          />
        </div>
      )}

      {lifecycle && <Card className="mt-4 space-y-3 p-4">
        <Label>subscription pages · optional topic name</Label>
        <div className="flex gap-2">
          <Input aria-label="filter subscriptions by topic" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} placeholder="all topics" />
          <Button size="sm" disabled={pageBusy} onClick={() => void loadPage()}>load subscriptions</Button>
        </div>
        {subscriptionsPartial && <p className="text-xs text-warn">Overview shows the first 1000 subscriptions. Search a topic or browse pages to reach the rest.</p>}
        {pageError && <ErrorBanner message={pageError} />}
        {page && <>
          <p className="text-xs text-muted-foreground">{page.total} total {pageTopic ? `under ${pageTopic}` : 'across all topics'} · {page.subscriptions.length} on this page · includes pending deletion</p>
          <div className="divide-y divide-border">
            {page.subscriptions.map((sub) => <button key={sub.name} onClick={() => onOpenSub(sub.topic, sub.name)} className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-xs">
              <span className="break-all">{sub.topic} / {sub.name}</span>
              <Badge tone={sub.state === 'deleting' ? 'warn' : 'neutral'}>{sub.state ?? 'active'}</Badge>
              {!!sub.expires_at_ms && <span className="text-muted-foreground">expires {formatDateTime(new Date(sub.expires_at_ms))}</span>}
            </button>)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pageBusy} onClick={() => void loadPage()}>first page</Button>
            <Button variant="outline" size="sm" disabled={pageBusy || !page.next_after} onClick={() => void loadPage(page.next_after)}>next page</Button>
          </div>
        </>}
      </Card>}

      {err && (
        <div className="mt-4">
          <ErrorBanner message={err} />
        </div>
      )}

      {loading ? (
        <Spinner label="loading topics" />
      ) : topics.length === 0 ? (
        <Empty>{err ? 'topic inventory unknown' : 'no topics yet — add a subscription to create one'}</Empty>
      ) : (
        <div className="mt-4 space-y-4">
          {topics.map((t) => (
            <TopicCard
              key={t.name}
              topic={t}
              metrics={metrics}
              onOpenSub={onOpenSub}
              publishing={publishTo === t.name}
              onTogglePublish={() => setPublishTo((p) => (p === t.name ? null : t.name))}
              onPublished={reload}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TopicCard({
  topic,
  metrics,
  onOpenSub,
  publishing,
  onTogglePublish,
  onPublished,
}: {
  topic: Topic
  metrics: Record<string, Metrics>
  onOpenSub: (topic: string, name: string) => void
  publishing: boolean
  onTogglePublish: () => void
  onPublished: () => void
}) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-faint">◇</span>
          <span className="font-semibold">{topic.name}</span>
          <Badge tone="neutral">{topic.subscriptions.length} sub</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onTogglePublish}>
          {publishing ? 'close' : 'publish'}
        </Button>
      </div>

      {publishing && <PublishPanel topic={topic.name} onPublished={onPublished} />}

      <div className="divide-y divide-border/60">
        {topic.subscriptions.map((s) => {
          const m = metrics[s.name]
          return (
            <button
              key={s.name}
              onClick={() => onOpenSub(topic.name, s.name)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="w-32 shrink-0 truncate font-medium text-foreground">{s.name}</span>
              {s.state === 'deleting' && <Badge tone="warn">deleting</Badge>}
              {!!s.expires_at_ms && <span className="text-xs text-faint" title={formatDateTime(new Date(s.expires_at_ms))}>temporary</span>}
              <span className="min-w-0 flex-1 truncate">
                <FilterCode expr={s.expr} />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {m?.active ?? 'unknown'} active
              </span>
              {m && m.dead_lettered > 0 && <Badge tone="danger">{m.dead_lettered} dlq</Badge>}
              <span className="shrink-0 text-faint">→</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

interface PendingCreation {
  topic: string
  name: string
  expr: string
  ttl: string
  options: SubscriptionOptions
}
function creationStorageKey() { return `mqlite.pending-subscription:${getEndpoint() || location.origin}` }
function savedCreation(): PendingCreation | null {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(creationStorageKey()) || 'null')
    if (!saved || typeof saved !== 'object') return null
    const value = saved as PendingCreation
    return typeof value.topic === 'string' && typeof value.name === 'string' && typeof value.expr === 'string' &&
      typeof value.ttl === 'string' && typeof value.options?.request_id === 'string' &&
      typeof value.options.request_expires_at_ms === 'number' ? value : null
  } catch { return null }
}

function NewSubscription({ topics, lifecycle, onClose, onDone }: { topics: string[]; lifecycle: boolean; onClose: () => void; onDone: () => void }) {
  const [attempt, setAttempt] = useState<PendingCreation | null>(savedCreation)
  const [topic, setTopic] = useState(attempt?.topic ?? '')
  const [name, setName] = useState(attempt?.name ?? '')
  const [expr, setExpr] = useState(attempt?.expr ?? '')
  const [ttl, setTtl] = useState(attempt?.ttl ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [reconciled, setReconciled] = useState(false)
  const [acknowledgePending, setAcknowledgePending] = useState(false)

  async function reconcile() {
    if (!attempt || busy) return
    setBusy(true)
    setAcknowledgePending(false)
    try {
      let after: string | undefined
      do {
        const result = await listSubscriptionsPage({ topic: attempt.topic, after, limit: 1000, include_deleting: true })
        const found = result.subscriptions.find((sub) => sub.name === attempt.name)
        if (found) {
          setErr(`Inventory contains ${found.name} (${found.state ?? 'active'}). Inspect it before starting another creation. This check does not create or renew it.`)
          setReconciled(true)
          return
        }
        after = result.next_after
      } while (after)
      setErr('The subscription is absent from current inventory. An outstanding creation may still complete. Checking inventory does not cancel it; a new creation is a separate attempt.')
      setReconciled(true)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not reconcile subscription inventory.')
    } finally { setBusy(false) }
  }

  async function save() {
    if (!topic.trim() || !name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      let request = attempt
      if (!request && ttl !== '' && Number(ttl) !== 0) {
        const ttlMs = Number(ttl) * 1000
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Enter a positive subscription lifetime in seconds, or leave it empty for durable.')
        request = {
          topic: topic.trim(), name: name.trim(), expr: expr.trim(), ttl,
          options: { ttl_ms: ttlMs, request_id: crypto.randomUUID(), request_expires_at_ms: Date.now() + 4 * 60_000 },
        }
        // Persist before submission: a lost response or page reload must reuse the
        // same request ID, deadline, name, filter and fixed TTL.
        sessionStorage.setItem(creationStorageKey(), JSON.stringify(request))
        setAttempt(request)
      }
      await subscribe(request?.topic ?? topic.trim(), request?.name ?? name.trim(), request?.expr || expr.trim() || undefined, request?.options)
      sessionStorage.removeItem(creationStorageKey())
      setAttempt(null)
      onDone()
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'queue_changed'
        ? 'This creation refers to a retired or replaced subscription. Check inventory; retrying must not recreate it.'
        : e instanceof Error ? e.message : 'subscribe failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">new subscription</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          close ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>topic</Label>
          <Input aria-label="subscription topic" disabled={busy || !!attempt} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="events" list="topic-list" />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>subscription name</Label>
          <Input aria-label="subscription name" disabled={busy || !!attempt} value={name} onChange={(e) => setName(e.target.value)} placeholder="eu-orders" />
        </div>
      </div>
      <div className="mt-3">
        {attempt ? <FilterCode expr={expr} /> : <FilterEditor expr={expr} onChange={setExpr} />}
      </div>
      {lifecycle && <div className="mt-3">
        <Label>subscription lifetime in seconds · empty or 0 = durable</Label>
        <Input aria-label="subscription lifetime in seconds" type="number" min="0" disabled={busy || !!attempt} value={ttl} onChange={(event) => setTtl(event.target.value)} placeholder="durable" />
        {Number(ttl) > 0 && <p className="mt-2 text-xs text-warn">Expiry is fixed at creation. It discards all remaining messages, including in-flight work. Traffic and retries do not extend it.</p>}
      </div>}
      {attempt && <p role="status" className="mt-3 text-xs text-muted-foreground">A creation request is saved in this browser session. Retry uses its original lifetime and deadline; closing this form does not discard it.</p>}
      {attempt && reconciled && <label className="mt-3 flex items-start gap-2 text-xs text-warn">
        <input type="checkbox" checked={acknowledgePending} disabled={busy} onChange={(event) => setAcknowledgePending(event.target.checked)} />
        <span>I understand that finishing this attempt does not cancel a pending request or delete a subscription it created.</span>
      </label>}
      {err && (
        <div className="mt-3">
          <ErrorBanner message={err} />
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {attempt && <Button variant="outline" size="sm" disabled={busy} onClick={() => void reconcile()}>check inventory</Button>}
        {attempt && reconciled && <Button variant="outline" size="sm" disabled={busy || !acknowledgePending} onClick={() => {
          sessionStorage.removeItem(creationStorageKey())
          setAttempt(null)
          setReconciled(false)
          setAcknowledgePending(false)
          setErr('')
          setName('')
        }}>finish this attempt</Button>}
        <Button variant="ghost" size="sm" onClick={onClose}>
          cancel
        </Button>
        <Button size="sm" disabled={!topic.trim() || !name.trim() || busy} onClick={save}>
          {busy ? 'creating…' : attempt ? 'retry saved creation' : 'create subscription'}
        </Button>
      </div>
    </Card>
  )
}
