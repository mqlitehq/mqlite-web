import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  listQueues,
  listSubscriptionInventory,
  listSubscriptions,
  observe,
  observeUnsupported,
  stats,
} from './api.js'
import type { Observation } from './observation.js'
import type { Metrics, QueueInfo, Subscription } from './types.js'

export type SubscriptionInventoryMode = 'unknown' | 'paged' | 'legacy'

interface ObservationView {
  observation: Observation | null
  queues: QueueInfo[]
  subscriptions: Subscription[]
  subscriptionInventoryMode: SubscriptionInventoryMode
  metrics: Record<string, Metrics>
  complete: boolean
  current: boolean
  legacy: boolean
  canManage: boolean
  loading: boolean
  err: string
  metadataError: string
  // Explicit full refresh: current measurements plus administrative topology.
  reload: () => void
  // Measurement-only refresh. This is the only action used by the five-second timer
  // and by message data-plane operations.
  reloadObservation: () => void
  // Administrative metadata only. Used after configuration-only mutations.
  reloadTopology: () => void
}

const noop = () => {}
const initial: ObservationView = {
  observation: null,
  queues: [],
  subscriptions: [],
  subscriptionInventoryMode: 'unknown',
  metrics: {},
  complete: false,
  current: false,
  legacy: false,
  canManage: false,
  loading: true,
  err: '',
  metadataError: '',
  reload: noop,
  reloadObservation: noop,
  reloadTopology: noop,
}
const ObservationContext = createContext<ObservationView>(initial)

interface SubscriptionInventoryResult {
  subscriptions: Subscription[]
  mode: Exclude<SubscriptionInventoryMode, 'unknown'>
}

interface TopologyResult {
  queues: QueueInfo[]
  available: boolean
}

interface LegacyStatsWork {
  topologyRevision: number
  queues: QueueInfo[]
  metadataAvailable: boolean
}

type ObservationResult = 'native' | 'legacy' | 'error' | 'pending'

export function managedInitialLoadReady(
  result: ObservationResult,
  canManage: boolean,
  topologyFinished: boolean,
): boolean {
  return result === 'native' && canManage && topologyFinished
}

function inventoryUnsupported(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.code === 'unimplemented')
}

export function ObservationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState(initial)
  const viewRef = useRef(view)
  const observationPending = useRef(false)
  const receivedAt = useRef(0)
  const legacyObservation = useRef(false)
  const canManage = useRef(false)
  const mounted = useRef(false)
  const topologyRequest = useRef(0)
  const topologyRevision = useRef(0)
  const topologyFlight = useRef<Promise<TopologyResult | undefined> | null>(null)
  const subscriptionInventoryMode = useRef<SubscriptionInventoryMode>('unknown')
  const legacyStatsQueued = useRef<LegacyStatsWork | null>(null)

  const updateView = useCallback((update: (previous: ObservationView) => ObservationView) => {
    if (!mounted.current) return
    setView((previous) => {
      const next = update(previous)
      viewRef.current = next
      return next
    })
  }, [])

  const loadSubscriptions = useCallback(async (): Promise<SubscriptionInventoryResult> => {
    if (subscriptionInventoryMode.current === 'legacy') {
      return { subscriptions: await listSubscriptions(), mode: 'legacy' }
    }
    if (subscriptionInventoryMode.current === 'paged') {
      return { subscriptions: await listSubscriptionInventory(), mode: 'paged' }
    }
    try {
      const subscriptions = await listSubscriptionInventory()
      subscriptionInventoryMode.current = 'paged'
      return { subscriptions, mode: 'paged' }
    } catch (error) {
      if (!inventoryUnsupported(error)) throw error
      // Capability is broker-wide. Once the lifecycle route is known to be absent,
      // never probe it again during this console session.
      subscriptionInventoryMode.current = 'legacy'
      return { subscriptions: await listSubscriptions(), mode: 'legacy' }
    }
  }, [])

  const readTopology = useCallback(
    async (request: number): Promise<TopologyResult | undefined> => {
      if (!mounted.current) return undefined
      if (!canManage.current) {
        if (request !== topologyRequest.current) return undefined
        topologyRevision.current++
        updateView((previous) => ({
          ...previous,
          queues: [],
          subscriptions: [],
          subscriptionInventoryMode: 'unknown',
          metadataError: '',
        }))
        return { queues: [], available: true }
      }
      try {
        const [queues, inventory] = await Promise.all([listQueues(), loadSubscriptions()])
        if (request !== topologyRequest.current) return undefined
        topologyRevision.current++
        updateView((previous) => ({
          ...previous,
          queues,
          subscriptions: inventory.subscriptions,
          subscriptionInventoryMode: inventory.mode,
          metadataError: '',
        }))
        return { queues, available: true }
      } catch {
        if (request !== topologyRequest.current) return undefined
        // A failed refresh is not evidence that the last successful topology vanished.
        topologyRevision.current++
        updateView((previous) => ({
          ...previous,
          metadataError: 'Administrative topology is unavailable; the last successful inventory is retained.',
        }))
        return { queues: viewRef.current.queues, available: false }
      }
    },
    [loadSubscriptions, updateView],
  )

  const loadTopology = useCallback(async (): Promise<TopologyResult | undefined> => {
    const request = ++topologyRequest.current
    if (!topologyFlight.current) {
      let flight!: Promise<TopologyResult | undefined>
      flight = (async () => {
        let result: TopologyResult | undefined
        for (;;) {
          const runRequest = topologyRequest.current
          result = await readTopology(runRequest)
          if (runRequest === topologyRequest.current) break
        }
        if (topologyFlight.current === flight) topologyFlight.current = null
        return result
      })()
      topologyFlight.current = flight
    }
    const result = await topologyFlight.current
    return request === topologyRequest.current ? result : undefined
  }, [readTopology])

  const loadNativeObservation = useCallback(async (): Promise<ObservationResult> => {
    if (legacyObservation.current) return 'legacy'
    if (observationPending.current) return 'pending'
    observationPending.current = true
    try {
      const observation = await observe()
      const mayManage = observation.access === 'manage' || observation.access === 'anonymous'
      canManage.current = mayManage
      if (!mayManage) {
        topologyRequest.current++
        topologyRevision.current++
      }
      const metrics: Record<string, Metrics> = {}
      for (const queue of observation.queues ?? []) metrics[queue.queue] = queue
      const complete = observation.collection.state === 'available'
      const err = complete
        ? ''
        : `Queue collection ${observation.collection.state}: ${observation.collection.error_code || 'incomplete sample'}. Aggregate counts are unknown.`
      receivedAt.current = Date.now()
      updateView((previous) => ({
        ...previous,
        observation,
        ...(mayManage
          ? {}
          : {
              queues: [],
              subscriptions: [],
              subscriptionInventoryMode: 'unknown' as const,
              metadataError: '',
            }),
        metrics,
        complete,
        current: true,
        legacy: false,
        canManage: mayManage,
        // A manage view is not ready until its initial topology load has
        // either succeeded or failed explicitly. Monitor views have no
        // administrative topology to wait for.
        loading: mayManage ? previous.loading : false,
        err,
      }))
      return 'native'
    } catch (error) {
      if (observeUnsupported(error)) {
        legacyObservation.current = true
        canManage.current = true
        updateView((previous) => ({
          ...previous,
          observation: null,
          legacy: true,
          canManage: true,
        }))
        return 'legacy'
      }
      updateView((previous) => ({
        ...previous,
        metrics: {},
        complete: false,
        current: false,
        // A transient observation failure is not an access-mode transition.
        // Only a successful monitor observation may revoke the management view.
        canManage: canManage.current,
        loading: false,
        err: error instanceof Error ? error.message : 'Observation unavailable',
      }))
      return 'error'
    } finally {
      observationPending.current = false
    }
  }, [updateView])

  const loadLegacyObservation = useCallback(
    async (queues = viewRef.current.queues, metadataAvailable = !viewRef.current.metadataError) => {
      legacyStatsQueued.current = {
        topologyRevision: topologyRevision.current,
        queues,
        metadataAvailable,
      }
      if (observationPending.current) return
      observationPending.current = true
      try {
        while (legacyStatsQueued.current) {
          const work = legacyStatsQueued.current
          legacyStatsQueued.current = null
          const results = await Promise.allSettled(work.queues.map((queue) => stats(queue.name)))
          // A changed topology supersedes this queue set. A timer tick on the
          // same topology may queue one follow-up, but cannot starve this result.
          if (work.topologyRevision !== topologyRevision.current) continue
          const metrics: Record<string, Metrics> = {}
          results.forEach((result, index) => {
            if (result.status === 'fulfilled') metrics[work.queues[index].name] = result.value
          })
          const complete = work.metadataAvailable && results.every((result) => result.status === 'fulfilled')
          receivedAt.current = Date.now()
          updateView((previous) => ({
            ...previous,
            observation: null,
            metrics,
            complete,
            current: true,
            legacy: true,
            canManage: true,
            loading: false,
            err: complete ? '' : 'Legacy queue collection is partial or unavailable. Aggregate counts are unknown.',
          }))
        }
      } finally {
        observationPending.current = false
      }
    },
    [updateView],
  )

  const reloadObservation = useCallback(async () => {
    if (legacyObservation.current) {
      await loadLegacyObservation()
      return
    }
    const result = await loadNativeObservation()
    if (result === 'legacy') await loadLegacyObservation()
  }, [loadLegacyObservation, loadNativeObservation])

  const reloadTopology = useCallback(async () => {
    await loadTopology()
  }, [loadTopology])

  const reload = useCallback(async () => {
    const result = legacyObservation.current ? 'legacy' : await loadNativeObservation()
    const topology = await loadTopology()
    if (result === 'legacy' && topology !== undefined) {
      await loadLegacyObservation(topology.queues, topology.available)
    } else if (managedInitialLoadReady(result, canManage.current, topology !== undefined)) {
      updateView((previous) => ({ ...previous, loading: false }))
    }
  }, [loadLegacyObservation, loadNativeObservation, loadTopology, updateView])

  useEffect(() => {
    mounted.current = true
    viewRef.current = initial
    void reload()
    const timer = setInterval(() => {
      if (receivedAt.current && Date.now() - receivedAt.current > 15000) {
        updateView((previous) => ({
          ...previous,
          current: false,
          complete: false,
          metrics: {},
          err: 'The last observation is stale. Current measurements are unknown.',
        }))
      }
      void reloadObservation()
    }, 5000)
    return () => {
      mounted.current = false
      topologyRequest.current++
      topologyRevision.current++
      clearInterval(timer)
    }
  }, [reload, reloadObservation, updateView])

  return (
    <ObservationContext.Provider value={{ ...view, reload, reloadObservation, reloadTopology }}>
      {children}
    </ObservationContext.Provider>
  )
}

export function useObservation(): ObservationView {
  return useContext(ObservationContext)
}
