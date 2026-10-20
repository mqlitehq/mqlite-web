import { useRef, useState } from 'react'
import { ApiError, deleteQueue, observeUnsupported } from '../lib/api.js'
import { Button, ErrorBanner, Input } from './ui.js'

export function DeleteQueue({
  name,
  total,
  generation,
  onDeleted,
  onRefresh,
  topic,
}: {
  name: string
  total?: number
  generation?: string
  onDeleted: () => void
  onRefresh: () => void
  topic?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirmation, setConfirmation] = useState('')
  const [expectedGeneration, setExpectedGeneration] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [force, setForce] = useState(false)
  const [pending, setPending] = useState(false)
  const kind = topic === undefined ? 'queue' : 'subscription'

  async function remove() {
    if (busy || uncertain || !expectedGeneration || confirmation !== name || (!force && !pending && total !== 0)) return
    setBusy(true)
    setError('')
    try {
      const result = await deleteQueue(name, expectedGeneration, force, topic)
      if (result.deleted) {
        dialog.current?.close()
        onDeleted()
      } else {
        setPending(true)
        onRefresh()
      }
    } catch (e) {
      if (e instanceof ApiError && observeUnsupported(e)) {
        setError(`This broker does not support deleting ${kind}s. Upgrade the broker to use this action.`)
      } else if (e instanceof ApiError && e.code === 'queue_changed') {
        setUncertain(true)
        setError('This queue was replaced. Close this dialog and refresh before choosing the new queue.')
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
          setExpectedGeneration(generation ?? '')
          setConfirmation('')
          setError('')
          setUncertain(false)
          setForce(false)
          setPending(false)
          dialog.current?.showModal()
        }}
      >
        delete {kind}
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
          Stop producers and consumers before deleting. By default every message state must be empty.
          Deletion removes this {kind}{topic === undefined ? '' : ' and its backing queue'}, configuration,
          deduplication and replay history.
        </p>
        {!expectedGeneration && (
          <p className="text-xs text-warn">
            Queue identity is unavailable. Refresh or upgrade the broker before deleting.
          </p>
        )}
        {!pending && (total === undefined ? (
          <p className="text-xs text-warn">Message count is unknown. Refresh before deleting.</p>
        ) : total > 0 ? (
          <p className="text-xs text-warn">
            This {kind} still contains {total} message(s). Clear them first or explicitly force deletion.
          </p>
        ) : null)}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={force} disabled={busy || pending || uncertain} onChange={(event) => setForce(event.target.checked)} />
          <span>Force delete: discard all messages, including locked, scheduled, deferred and dead-letter work.
            Consumer side effects cannot be undone.</span>
        </label>
        {pending && <p role="status" className="text-xs text-warn">Deletion accepted. New work is blocked; the name remains reserved while cleanup finishes. You can check again using the same identity.</p>}
        <div>
          <label htmlFor="delete-queue-name" className="mb-1 block text-xs text-muted-foreground">
            Type the {kind} name to confirm
          </label>
          <Input
            id="delete-queue-name"
            value={confirmation}
            disabled={busy || uncertain}
            autoComplete="off"
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        {error && <ErrorBanner message={error} />}
        <div className="flex gap-2">
          <Button variant="outline" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>
            cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy || uncertain || !expectedGeneration || (!force && !pending && total !== 0) || confirmation !== name}
            onClick={() => void remove()}
          >
            {busy ? 'deleting…' : pending ? 'check deletion' : 'confirm delete'}
          </Button>
        </div>
      </dialog>
    </>
  )
}
