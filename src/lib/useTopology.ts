import { useObservation } from './observation-context.js'
import type { Subscription } from './types.js'

export interface Topic {
  name: string
  subscriptions: Subscription[]
}

export function useTopology() {
  const view = useObservation()
  return {
    ...view,
    queues: view.queues.filter((q) => q.kind !== 'subscription'),
    topics: groupTopics(view.subscriptions),
    err: [view.err, view.metadataError].filter(Boolean).join(' '),
  }
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
