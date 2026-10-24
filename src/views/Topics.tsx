import { useState } from 'react'
import { subscribe } from '../lib/api.js'
import { useTopology, type Topic } from '../lib/useTopology.js'
import type { Metrics, Subscription, SubscriptionPageItem } from '../lib/types.js'
import { fmtMs, fmtUTC } from '../lib/format.js'
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
  Select,
  Spinner,
} from '../components/ui.js'
import { FilterEditor } from '../components/FilterEditor.js'
import { PublishPanel } from '../components/Composer.js'

const TTL_UNITS = [
  { label: 'seconds', ms: 1000 },
  { label: 'minutes', ms: 60_000 },
  { label: 'hours', ms: 3_600_000 },
  { label: 'days', ms: 86_400_000 },
]

const MAX_SUBSCRIPTION_TTL_MS = 3650 * 86_400_000
const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000

type LifecycleInventoryState = 'loading' | 'ready' | 'legacy' | 'error'

export function Topics({ onOpenSub }: { onOpenSub: (topic: string, name: string) => void }) {
  const {
    topics,
    subscriptions,
    subscriptionInventoryMode,
    metrics,
    loading,
    err,
    reload,
    reloadObservation,
    observation,
    current: observationCurrent,
  } = useTopology()
  const [creating, setCreating] = useState(false)
  const [publishTo, setPublishTo] = useState<string | null>(null)
  const lifecycleDisplayState: LifecycleInventoryState =
    subscriptionInventoryMode === 'paged'
      ? 'ready'
      : subscriptionInventoryMode === 'legacy'
        ? 'legacy'
        : err
          ? 'error'
          : 'loading'
  const brokerTime = observation?.server_time_ms || undefined

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="topics"
        subtitle={
          loading
            ? '…'
            : `${topics.length} topic${topics.length === 1 ? '' : 's'} · ${subscriptions.length} subscription${subscriptions.length === 1 ? '' : 's'} · publish/subscribe fan-out`
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
            onClose={() => setCreating(false)}
            onDone={() => {
              setCreating(false)
              reload()
            }}
          />
        </div>
      )}

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
              lifecycleState={lifecycleDisplayState}
              brokerTime={brokerTime}
              observationCurrent={observationCurrent}
              publishing={publishTo === t.name}
              onTogglePublish={() => setPublishTo((p) => (p === t.name ? null : t.name))}
              onPublished={reloadObservation}
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
  lifecycleState,
  brokerTime,
  observationCurrent,
  publishing,
  onTogglePublish,
  onPublished,
}: {
  topic: Topic
  metrics: Record<string, Metrics>
  onOpenSub: (topic: string, name: string) => void
  lifecycleState: LifecycleInventoryState
  brokerTime?: number
  observationCurrent: boolean
  publishing: boolean
  onTogglePublish: () => void
  onPublished: () => void
}) {
  const canPublish = topic.subscriptions.some((subscription) =>
    subscriptionAcceptsPublish(subscription, brokerTime),
  )
  const publishOpen = publishing && canPublish
  return (
    <Card>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-faint">◇</span>
            <span className="truncate font-semibold">{topic.name}</span>
            <Badge tone="neutral">{topic.subscriptions.length} sub</Badge>
          </div>
          {!canPublish && (
            <div className="mt-1 text-[11px] text-warn">
              publishing unavailable · all subscriptions are deleting or expired
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!canPublish}
          title={canPublish ? undefined : 'All subscriptions are deleting or expired.'}
          onClick={onTogglePublish}
        >
          {publishOpen ? 'close' : 'publish'}
        </Button>
      </div>

      {publishOpen && <PublishPanel topic={topic.name} onPublished={onPublished} />}

      <div className="divide-y divide-border/60">
        {topic.subscriptions.map((s) => {
          const m = metrics[s.name]
          return (
            <button
              key={s.name}
              onClick={() => onOpenSub(topic.name, s.name)}
              className="flex w-full min-w-0 items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 sm:items-center"
            >
              <span className="min-w-0 flex-1 sm:grid sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-3">
                <span className="block truncate font-medium text-foreground">{s.name}</span>
                <span className="mt-0.5 block min-w-0 truncate sm:mt-0">
                  <FilterCode expr={s.expr} />
                </span>
                <SubscriptionLifecycle
                  subscription={s}
                  inventoryState={lifecycleState}
                  brokerTime={brokerTime}
                  observationCurrent={observationCurrent}
                />
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{m?.active ?? 'unknown'} active</span>
                {m && m.dead_lettered > 0 && <Badge tone="danger">{m.dead_lettered} dlq</Badge>}
                <span className="text-faint">→</span>
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function lifecycleSubscription(subscription: Subscription): subscription is SubscriptionPageItem {
  return 'created_at_ms' in subscription && 'expires_at_ms' in subscription
}

function subscriptionAcceptsPublish(subscription: Subscription, brokerTime?: number): boolean {
  if (subscription.state === 'deleting') return false
  return !(
    brokerTime !== undefined &&
    lifecycleSubscription(subscription) &&
    subscription.expires_at_ms !== 0 &&
    brokerTime >= subscription.expires_at_ms
  )
}

function SubscriptionLifecycle({
  subscription,
  inventoryState,
  brokerTime,
  observationCurrent,
}: {
  subscription: Subscription
  inventoryState: LifecycleInventoryState
  brokerTime?: number
  observationCurrent: boolean
}) {
  let text = inventoryState === 'loading' ? 'lifecycle loading…' : 'lifecycle unavailable'
  let className = 'text-faint'
  let title: string | undefined
  if (lifecycleSubscription(subscription)) {
    const deleting = subscription.state === 'deleting'
    const expiresAt = subscription.expires_at_ms
    if (expiresAt === 0) {
      text = deleting ? 'permanent · deleting' : 'permanent'
      className = deleting ? 'text-danger' : 'text-muted-foreground'
    } else {
      const exact = fmtUTC(expiresAt)
      const remaining = brokerTime === undefined ? undefined : expiresAt - brokerTime
      const expired = remaining !== undefined && remaining <= 0
      title = fmtUTC(expiresAt)
      if (deleting) {
        text = expired ? `expired ${exact} · deleting` : `expires ${exact} · deleting`
        className = 'text-danger'
      } else if (expired) {
        text = `expired ${exact}`
        className = 'text-danger'
      } else if (remaining === undefined) {
        text = `expires ${exact} · remaining unavailable`
        className = 'text-muted-foreground'
      } else {
        text = `${remaining <= EXPIRING_SOON_MS ? 'expiring soon · ' : ''}expires ${exact} · ${fmtMs(remaining)} left`
        className = remaining <= EXPIRING_SOON_MS ? 'text-warn' : 'text-muted-foreground'
      }
      if (!observationCurrent && brokerTime !== undefined) text += ' · stale broker sample'
    }
  }
  return (
    <span
      aria-label={`subscription lifecycle ${subscription.name}`}
      className={`mt-1 block min-w-0 break-words text-[11px] tabular-nums sm:col-span-2 ${className}`}
      title={title}
    >
      {text}
    </span>
  )
}

function NewSubscription({ topics, onClose, onDone }: { topics: string[]; onClose: () => void; onDone: () => void }) {
  const [topic, setTopic] = useState('')
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const [ttl, setTTL] = useState('')
  const [ttlUnit, setTTLUnit] = useState(String(TTL_UNITS[1].ms))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!topic.trim() || !name.trim() || busy) return
    const ttlMs = ttl === '' ? undefined : Number(ttl) * Number(ttlUnit)
    if (
      ttlMs !== undefined &&
      (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_SUBSCRIPTION_TTL_MS)
    ) {
      setErr(
        'TTL must be a positive whole-millisecond duration no longer than 10 years, or left blank for a permanent subscription.',
      )
      return
    }
    setBusy(true)
    setErr('')
    try {
      await subscribe(topic.trim(), name.trim(), expr.trim() || undefined, ttlMs)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'subscribe failed')
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
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="events" list="topic-list" />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>subscription name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="eu-orders" />
        </div>
      </div>
      <div className="mt-3">
        <FilterEditor expr={expr} onChange={setExpr} />
      </div>
      <div className="mt-3">
        <Label>fixed lifetime (optional)</Label>
        <div className="flex gap-2">
          <Input
            aria-label="subscription lifetime"
            type="number"
            min="1"
            step="1"
            className="w-28"
            value={ttl}
            onChange={(e) => setTTL(e.target.value)}
            placeholder="permanent"
          />
          <Select aria-label="subscription lifetime unit" value={ttlUnit} onChange={(e) => setTTLUnit(e.target.value)}>
            {TTL_UNITS.map((unit) => (
              <option key={unit.ms} value={unit.ms}>
                {unit.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Starts at first creation and never renews. At expiry it becomes unavailable; cleanup discards retained messages
          and removes it. The console maximum is 10 years (3,650 fixed 24-hour days). Delete explicitly when normal work
          finishes.
        </p>
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
        <Button size="sm" disabled={!topic.trim() || !name.trim() || busy} onClick={save}>
          {busy ? 'creating…' : 'create subscription'}
        </Button>
      </div>
    </Card>
  )
}
