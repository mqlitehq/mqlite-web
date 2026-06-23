import { useState } from 'react'
import { subscribe } from '../lib/api'
import { useTopology, type Topic } from '../lib/useTopology'
import type { Metrics } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorBanner, FilterCode, Input, Label, PageHeader, Spinner } from '../components/ui'
import { FilterEditor } from '../components/FilterEditor'
import { PublishPanel } from '../components/Composer'

export function Topics({ onOpenSub }: { onOpenSub: (topic: string, name: string) => void }) {
  const { topics, subscriptions, metrics, loading, err, reload } = useTopology()
  const [creating, setCreating] = useState(false)
  const [publishTo, setPublishTo] = useState<string | null>(null)

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
        <Empty>no topics yet — add a subscription to create one</Empty>
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
              <span className="min-w-0 flex-1 truncate">
                <FilterCode expr={s.expr} />
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m?.active ?? '·'} active</span>
              {m && m.dead_lettered > 0 && <Badge tone="danger">{m.dead_lettered} dlq</Badge>}
              <span className="shrink-0 text-faint">→</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function NewSubscription({
  topics,
  onClose,
  onDone,
}: {
  topics: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [topic, setTopic] = useState(topics[0] ?? 'events')
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!topic.trim() || !name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      await subscribe(topic.trim(), name.trim(), expr.trim() || undefined)
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
