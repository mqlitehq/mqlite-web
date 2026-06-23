import { useCallback, useEffect, useState } from 'react'
import { listQueues, listSubscriptions, stats } from './api'
import type { Metrics, QueueInfo, Subscription } from './types'

export interface Topic {
  name: string
  subscriptions: Subscription[]
}

export interface Topology {
  queues: QueueInfo[] // real queues only (kind === 'queue')
  subscriptions: Subscription[] // topic + name + expr
  topics: Topic[] // subscriptions grouped by topic
  metrics: Record<string, Metrics> // by queue/subscription name
  loading: boolean
  err: string
  reload: () => void
}

// One source of truth for the topology. ListQueues returns both real queues and the
// backing queues of subscriptions (kind === 'subscription'); we split them and pull the
// topic + filter for the latter from ListSubscriptions. Stats are fetched for every name.
export function useTopology(pollMs = 5000): Topology {
  const [queues, setQueues] = useState<QueueInfo[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    try {
      const [qs, subs] = await Promise.all([listQueues(), listSubscriptions()])
      setQueues(qs.filter((q) => q.kind !== 'subscription'))
      setSubscriptions(subs)
      const entries = await Promise.all(
        qs.map(async (q) => [q.name, await stats(q.name).catch(() => undefined)] as const),
      )
      const m: Record<string, Metrics> = {}
      for (const [n, s] of entries) if (s) m[n] = s
      setMetrics(m)
      setErr('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load topology')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
    const t = setInterval(reload, pollMs)
    return () => clearInterval(t)
  }, [reload, pollMs])

  const topics = groupTopics(subscriptions)
  return { queues, subscriptions, topics, metrics, loading, err, reload }
}

export function groupTopics(subs: Subscription[]): Topic[] {
  const m = new Map<string, Subscription[]>()
  for (const s of subs) {
    const arr = m.get(s.topic) ?? []
    arr.push(s)
    m.set(s.topic, arr)
  }
  return [...m.entries()]
    .map(([name, subscriptions]) => ({
      name,
      subscriptions: subscriptions.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
