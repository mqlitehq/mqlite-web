import { useEffect, useRef, useState } from 'react'
import { ApiError, deleteQueue, observeUnsupported } from '../lib/api.js'
import { Button, ErrorBanner, Input } from './ui.js'

export function DeleteQueue({
  name,
  total,
  state,
  onDeleted,
  onDeleting,
  onRefresh,
}: {
  name: string
  total?: number
  state?: 'active' | 'deleting'
  onDeleted: () => void
  onDeleting: () => void
  onRefresh: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [force, setForce] = useState(false)
  const [pending, setPending] = useState(state === 'deleting')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (state === 'deleting') setPending(true)
  }, [state])

  async function remove() {
    if (
      busy ||
      uncertain ||
      confirmation !== name ||
      (!pending && (total === undefined || (total > 0 && !force)))
    )
      return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const result = await deleteQueue(name, !pending && force)
      if (result.deleted) {
        dialog.current?.close()
        onDeleted()
      } else {
        setPending(true)
        setForce(false)
        setStatus(
          'Deletion was accepted. New work is blocked and the name stays reserved while bounded cleanup continues. Check again to confirm completion.',
        )
        onDeleting()
      }
    } catch (e) {
      if (e instanceof ApiError && observeUnsupported(e)) {
        setError('This broker does not support deleting queues. Upgrade the broker to use this action.')
      } else if (e instanceof ApiError && e.code === 'not_found') {
        dialog.current?.close()
        onDeleted()
      } else if (!(e instanceof ApiError) || e.status >= 500 || e.code === 'outcome_unknown') {
        setUncertain(true)
        setError(
          'Deletion could not be confirmed. Close this dialog and refresh the queue list before trying again.',
        )
      } else {
        setError(e.message)
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
          setUncertain(false)
          setForce(false)
          setPending(state === 'deleting')
          setStatus('')
          dialog.current?.showModal()
        }}
      >
        {state === 'deleting' ? 'deletion pending' : 'delete queue'}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="delete-queue-title"
        aria-describedby="delete-queue-description"
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border border-border bg-surface p-5 text-foreground backdrop:bg-black/70"
      >
        <h2 id="delete-queue-title" className="break-all text-sm font-semibold">
          Delete {name}?
        </h2>
        <p id="delete-queue-description" className="text-xs leading-relaxed text-muted-foreground">
          {pending
            ? 'This queue is already deleting. Its data plane is unavailable and its name stays reserved until cleanup finishes.'
            : 'Stop producers and consumers before deleting. The default action succeeds only when every message state is empty. Deletion also removes queue configuration, deduplication and replay history.'}
        </p>
        {!pending && total === undefined ? (
          <p className="text-xs text-warn">Message count is unknown. Refresh before deleting.</p>
        ) : !pending && total !== undefined && total > 0 ? (
          <div className="space-y-2 rounded-lg bg-danger/10 p-3 text-xs text-danger">
            <p>This queue contains {total} message(s). Empty-only deletion is unavailable.</p>
            <label className="flex items-start gap-2 font-medium">
              <input
                type="checkbox"
                checked={force}
                disabled={busy || uncertain}
                onChange={(event) => setForce(event.target.checked)}
              />
              <span>Force deletion and permanently discard every message state</span>
            </label>
            <p className="leading-relaxed">
              This discards active, locked, scheduled, deferred and dead-letter messages. A locked delivery may
              already have caused an external side effect; deleting the queue cannot undo it.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor="delete-queue-name" className="mb-1 block text-xs text-muted-foreground">
            Type the queue name to confirm
          </label>
          <Input
            id="delete-queue-name"
            value={confirmation}
            disabled={busy || uncertain}
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
              uncertain ||
              confirmation !== name ||
              (!pending && (total === undefined || (total > 0 && !force)))
            }
            onClick={() => void remove()}
          >
            {busy ? 'deleting…' : pending ? 'check deletion' : 'confirm delete'}
          </Button>
        </div>
      </dialog>
    </>
  )
}
