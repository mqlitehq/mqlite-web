import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  deleteSubscription,
  listSubscriptionsPage,
  observeUnsupported,
} from '../lib/api.js'
import type { Subscription } from '../lib/types.js'
import { Button, ErrorBanner, Input } from './ui.js'

type DeleteMode = 'ready' | 'pending' | 'reconcile'

async function findSubscription(topic: string, name: string): Promise<Subscription | undefined> {
  let after: string | undefined
  const seen = new Set<string>()
  for (;;) {
    const page = await listSubscriptionsPage({
      topic,
      ...(after ? { after } : {}),
      limit: 1000,
      include_deleting: true,
    })
    const exact = page.subscriptions.find((sub) => sub.topic === topic && sub.name === name)
    if (exact) return exact
    if (!page.next_after) return undefined
    if (seen.has(page.next_after))
      throw new ApiError(502, 'invalid_response', 'Paged subscription inventory repeated a cursor.')
    seen.add(page.next_after)
    after = page.next_after
  }
}

export function DeleteSubscription({
  topic,
  name,
  total,
  state,
  onDeleted,
  onDeleting,
  onRefresh,
}: {
  topic: string
  name: string
  total?: number
  state?: 'active' | 'deleting'
  onDeleted: () => void
  onDeleting: () => void
  onRefresh: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const exactName = `${topic}/${name}`
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [force, setForce] = useState(false)
  const [mode, setMode] = useState<DeleteMode>(state === 'deleting' ? 'pending' : 'ready')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (state === 'deleting') setMode('pending')
  }, [state])

  const reconciling = mode !== 'ready'

  async function remove() {
    if (
      busy ||
      confirmation !== exactName ||
      (!reconciling && (total === undefined || (total > 0 && !force)))
    )
      return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      if (reconciling) {
        // A second DELETE could hit a later same-name subscription. Reconciliation
        // is read-only and scans every page in this exact topic scope.
        const current = await findSubscription(topic, name)
        if (!current) {
          dialog.current?.close()
          onDeleted()
        } else if (current.state === 'deleting') {
          setMode('pending')
          setStatus('Cleanup is still in progress. The subscription name remains reserved.')
          onRefresh()
        } else {
          // Name-only identity cannot tell whether this is the original lifetime
          // whose delete did not commit or a same-name replacement. Keep the
          // destructive action fenced and let the owner resolve that boundary.
          setError(
            'An active subscription currently uses this topic/name. It may be the original lifetime or a replacement; the delete will not be repeated. Coordinate with the subscription owner before taking a new action.',
          )
          onRefresh()
        }
        return
      }
      const result = await deleteSubscription(topic, name, force)
      if (result.deleted) {
        dialog.current?.close()
        onDeleted()
      } else {
        setMode('pending')
        setForce(false)
        setStatus(
          'Deletion was accepted. Publishing and subscription work are blocked while bounded cleanup continues. Check again to confirm completion.',
        )
        onDeleting()
      }
    } catch (cause) {
      if (cause instanceof ApiError && observeUnsupported(cause)) {
        setError('This broker does not support deleting subscriptions. Upgrade the broker to use this action.')
      } else if (!reconciling && cause instanceof ApiError && cause.code === 'not_found') {
        setMode('reconcile')
        setForce(false)
        setError(
          'No subscription matched this exact topic/name. Check the paged subscription inventory before taking another action.',
        )
        onRefresh()
      } else if (
        !reconciling &&
        (!(cause instanceof ApiError) || cause.status >= 500 || cause.code === 'outcome_unknown')
      ) {
        setMode('reconcile')
        setForce(false)
        setError(
          'Deletion could not be confirmed. Check the paged subscription inventory; the delete will not be sent again.',
        )
      } else {
        setError(cause instanceof Error ? cause.message : 'subscription deletion failed')
        onRefresh()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          setConfirmation('')
          setError('')
          setForce(false)
          if (state === 'deleting') setMode('pending')
          setStatus('')
          dialog.current?.showModal()
        }}
      >
        {mode === 'pending' ? 'deletion pending' : mode === 'reconcile' ? 'check delete outcome' : 'delete subscription'}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-subscription-title"
        aria-describedby="delete-subscription-description"
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border border-border bg-surface p-5 text-foreground backdrop:bg-black/70"
      >
        <h2 id="delete-subscription-title" className="break-all text-sm font-semibold">
          Delete {exactName}?
        </h2>
        <p id="delete-subscription-description" className="text-xs leading-relaxed text-muted-foreground">
          {mode === 'pending'
            ? 'This subscription is already deleting. Fan-out and its data plane are unavailable until cleanup finishes.'
            : mode === 'reconcile'
              ? 'The previous result cannot be acted on safely. This check reads the exact topic scope, including deleting subscriptions, and never repeats the delete.'
              : 'Stop publishers and consumers before deleting. The default action succeeds only when every retained message state is empty. Fan-out becomes unavailable as soon as the final active subscription retires. The topic address remains reserved until the deleting mapping is physically cleaned up.'}
        </p>
        {!reconciling && total === undefined ? (
          <p className="text-xs text-warn">Message count is unknown. Refresh before deleting.</p>
        ) : !reconciling && total !== undefined && total > 0 ? (
          <div className="space-y-2 rounded-lg bg-danger/10 p-3 text-xs text-danger">
            <p>This subscription contains {total} message(s). Empty-only deletion is unavailable.</p>
            <label className="flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                checked={force}
                disabled={busy}
                onChange={(event) => setForce(event.target.checked)}
              />
              <span>Force deletion and permanently discard every message state</span>
            </label>
            <p className="leading-relaxed">
              This discards active, locked, scheduled, deferred and dead-letter messages. A locked delivery may
              already have caused an external side effect; deleting the subscription cannot undo it.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor="delete-subscription-name" className="mb-1 block text-xs text-muted-foreground">
            Type {exactName} to confirm
          </label>
          <Input
            id="delete-subscription-name"
            value={confirmation}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        {status && (
          <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            {status}
          </p>
        )}
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button variant="outline" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>
            cancel
          </Button>
          <Button
            variant="danger"
            disabled={
              busy ||
              confirmation !== exactName ||
              (!reconciling && (total === undefined || (total > 0 && !force)))
            }
            onClick={() => void remove()}
          >
            {busy ? 'working…' : reconciling ? 'check outcome' : 'confirm delete'}
          </Button>
        </div>
      </dialog>
    </>
  )
}
