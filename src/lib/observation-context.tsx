import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { listQueues, listSubscriptions, observe, observeUnsupported, stats } from './api.js'
import type { Observation } from './observation.js'
import type { Metrics, QueueInfo, Subscription } from './types.js'

interface ObservationView {
  observation: Observation | null
  queues: QueueInfo[]
  subscriptions: Subscription[]
  metrics: Record<string, Metrics>
  complete: boolean
  current: boolean
  legacy: boolean
  canManage: boolean
  loading: boolean
  err: string
  metadataError: string
  reload: () => void
}
const initial: ObservationView = {
  observation: null,
  queues: [],
  subscriptions: [],
  metrics: {},
  complete: false,
  current: false,
  legacy: false,
  canManage: false,
  loading: true,
  err: '',
  metadataError: '',
  reload: () => {},
}
const ObservationContext = createContext<ObservationView>(initial)

export function ObservationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState(initial)
  const pending = useRef(false)
  const receivedAt = useRef(0)
  const legacy = useRef(false)
  const mounted = useRef(false)
  const reload = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    try {
      let observation: Observation | null = null
      if (!legacy.current) {
        try {
          observation = await observe()
        } catch (error) {
          if (!observeUnsupported(error)) throw error
          legacy.current = true
        }
      }
      const canManage = legacy.current || observation?.access === 'manage' || observation?.access === 'anonymous'
      let queues: QueueInfo[] = []
      let subscriptions: Subscription[] = []
      let metadataError = ''
      if (canManage) {
        try {
          ;[queues, subscriptions] = await Promise.all([listQueues(), listSubscriptions()])
        } catch {
          metadataError = 'Administrative topology is unavailable; queue observations remain independent.'
        }
      }
      const metrics: Record<string, Metrics> = {}
      let complete = observation?.collection.state === 'available'
      let err = ''
      if (legacy.current) {
        const results = await Promise.allSettled(queues.map((q) => stats(q.name)))
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') metrics[queues[index].name] = result.value
        })
        complete = !metadataError && results.every((r) => r.status === 'fulfilled')
        if (!complete) err = 'Legacy queue collection is partial or unavailable. Aggregate counts are unknown.'
      } else {
        for (const q of observation?.queues ?? []) metrics[q.queue] = q
        if (!complete)
          err = `Queue collection ${observation?.collection.state}: ${observation?.collection.error_code || 'incomplete sample'}. Aggregate counts are unknown.`
      }
      if (!canManage) {
        // Observation contains queue names/kinds, but no administrative configuration.
        queues = (observation?.queues ?? []).map((q) => ({ name: q.queue, kind: q.kind }) as QueueInfo)
      }
      receivedAt.current = Date.now()
      if (mounted.current)
        setView({
          observation,
          queues,
          subscriptions,
          metrics,
          complete,
          current: true,
          legacy: legacy.current,
          canManage,
          loading: false,
          err,
          metadataError,
          reload: () => {},
        })
    } catch (error) {
      if (mounted.current)
        setView((previous) => ({
          ...previous,
          metrics: {},
          complete: false,
          current: false,
          canManage: false,
          loading: false,
          err: error instanceof Error ? error.message : 'Observation unavailable',
        }))
    } finally {
      pending.current = false
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void reload()
    const timer = setInterval(() => {
      if (receivedAt.current && Date.now() - receivedAt.current > 15000) {
        setView((previous) => ({
          ...previous,
          current: false,
          complete: false,
          metrics: {},
          canManage: false,
          err: 'The last observation is stale. Current measurements are unknown.',
        }))
      }
      void reload()
    }, 5000)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [reload])
  return <ObservationContext.Provider value={{ ...view, reload }}>{children}</ObservationContext.Provider>
}

export function useObservation(): ObservationView {
  return useContext(ObservationContext)
}
