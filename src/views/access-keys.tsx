import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, createAccessKey, listAccessKeys, revokeAccessKey } from '../lib/api.js'
import {
  generateKeyID,
  keyState,
  pendingKeyStorageSlot,
  readPendingKey,
  retainPendingKey,
  type PendingKeyCreation,
} from '../lib/access-keys.js'
import type { AccessKey, CreateKeyResult, KeyPage } from '../lib/types.js'
import { fmtTime } from '../lib/format.js'
import { parseDateTime } from '../lib/date-time.js'
import { DateTimeField } from '../components/date-time-field.js'
import { PermissionSelect } from '../components/permission-select.js'
import { Badge, Button, Card, Empty, ErrorBanner, Input, PageHeader, Spinner } from '../components/ui.js'

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Key management requires a manage key or a configured administrator token, with broker authentication enabled. Your session has been kept.'
  }
  return error instanceof Error ? error.message : 'Could not reach the broker.'
}

export function AccessKeys() {
  const [slot] = useState(pendingKeyStorageSlot)
  const [now, setNow] = useState(Date.now)
  const [page, setPage] = useState<KeyPage>({ keys: [] })
  const [cursors, setCursors] = useState([''])
  const [loading, setLoading] = useState(true)
  const [unsupported, setUnsupported] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState('send')
  const [expiry, setExpiry] = useState('')
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<PendingKeyCreation | null>(null)
  const [storageError, setStorageError] = useState('')
  const [issued, setIssued] = useState<CreateKeyResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [reconcile, setReconcile] = useState('')
  const [checking, setChecking] = useState(false)
  const [found, setFound] = useState<AccessKey | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<AccessKey | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const creatingRef = useRef(false)
  const sequence = useRef(0)
  const cursor = cursors[cursors.length - 1]

  const reload = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const result = await listAccessKeys(cursor, 25, 'created_desc')
      if (request === sequence.current) {
        setPage(result)
        setUnsupported(false)
        setForbidden(false)
      }
    } catch (failure) {
      if (request === sequence.current) {
        if (failure instanceof ApiError && (failure.status === 404 || failure.status === 501)) {
          setUnsupported(true)
          setPage({ keys: [] })
        } else {
          setForbidden(failure instanceof ApiError && failure.status === 403)
          setError(errorMessage(failure))
        }
      }
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [cursor])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      setPending(readPendingKey(slot))
    } catch (failure) {
      setStorageError(errorMessage(failure))
    }
  }, [slot])

  useEffect(() => {
    void reload()
    return () => {
      sequence.current++
    }
  }, [reload])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (creatingRef.current || pending || storageError || unsupported || forbidden) return
    setError('')
    const trimmed = name.trim()
    if (!trimmed || new TextEncoder().encode(trimmed).length > 128 || trimmed.includes('\0')) {
      setError('Use a name of 1–128 UTF-8 bytes, without NUL characters.')
      return
    }
    const expiresAt = parseDateTime(expiry)
    if (expiry && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
      setError('Choose a valid future expiry in yyyy-MM-dd HH:mm format, or leave it empty for no expiry.')
      return
    }
    creatingRef.current = true
    setCreating(true)
    let request: PendingKeyCreation | null = null
    try {
      // Do not overwrite an unresolved request after a remount or fast double click.
      if (readPendingKey(slot)) throw new Error('Resolve the saved creation request before issuing another key.')
      request = { id: generateKeyID(), name: trimmed, started_at_ms: Date.now(), outcome: 'pending' }
      retainPendingKey(slot, request)
      setPending(request)
      setFound(null)
      setReconcile('')
      const result = await createAccessKey({
        id: request.id,
        name: trimmed,
        permissions: permissions.split(','),
        expires_at_ms: expiresAt,
      })
      setIssued(result)
      setCopied(false)
      setCopyError('')
      request = { ...request, outcome: 'created' }
      // The original public ID is already retained if a later storage update fails.
      retainPendingKey(slot, request)
      setPending(request)
      setName('')
      setExpiry('')
      if (cursor) setCursors([''])
      else void reload()
    } catch (failure) {
      if (request) {
        const outcome =
          failure instanceof ApiError && [400, 403, 404, 409, 413, 501].includes(failure.status) ? 'failed' : 'unknown'
        request = { ...request, outcome }
        setPending(request)
        try {
          retainPendingKey(slot, request)
        } catch {
          setStorageError('The public request ID could not be updated in this tab. Copy it before leaving.')
        }
      }
      setError(errorMessage(failure))
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  function dismissPending() {
    try {
      sessionStorage.removeItem(slot)
      setPending(null)
      setIssued(null)
      setFound(null)
      setReconcile('')
      setDiscarding(false)
      setCopyError('')
    } catch (failure) {
      setStorageError(errorMessage(failure))
    }
  }

  async function checkRequest() {
    if (!pending || checking) return
    setChecking(true)
    setError('')
    try {
      // The default ID ordering and its predecessor cursor select this exact ID
      // without downloading every credential or inferring identity from its name.
      const number = BigInt(`0x${pending.id}`)
      const before = number === 0n ? '' : (number - 1n).toString(16).padStart(32, '0')
      const result = await listAccessKeys(before, 1)
      const match = result.keys.find((key) => key.id === pending.id) ?? null
      setFound(match)
      setReconcile(
        match
          ? `Found this exact request ID: ${keyState(match)}. Its secret cannot be recovered.`
          : 'No matching row yet. An outstanding request may still commit later. Keep this ID and check again; do not assume creation failed.',
      )
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setChecking(false)
    }
  }

  async function revoke() {
    if (!confirmRevoke || revoking) return
    setRevoking(true)
    setError('')
    try {
      const id = confirmRevoke.id
      await revokeAccessKey(id)
      setConfirmRevoke(null)
      if (pending?.id === id) {
        setIssued(null)
        setFound({ ...confirmRevoke, revoked_at_ms: Date.now() })
        setReconcile(
          'This key is revoked. You can finish reconciling this request and create a replacement with a new ID.',
        )
      }
      await reload()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRevoking(false)
    }
  }

  async function copySecret() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.token)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopyError('Clipboard access is unavailable. Select and copy the secret below, then store it securely.')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="access keys"
        subtitle="Separate credentials for producers, consumers, and operators."
        actions={
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void reload()}>
            refresh
          </Button>
        }
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Permissions apply across this broker. Manage includes send, listen, and issuing or revoking any managed key.
        Administrator tokens in MQLITE_TOKENS are not listed here; update the configuration and restart the broker
        to change them.
      </p>
      {error && <ErrorBanner message={error} />}
      {storageError && <ErrorBanner message={storageError} />}
      {unsupported && (
        <Card className="p-5 text-sm text-muted-foreground" role="status">
          This broker does not support managed access keys. Upgrade the broker to v0.3.1 or later to create and revoke
          keys here. Existing queue and topic tools remain available.
        </Card>
      )}

      {pending && (
        <Card className="space-y-3 border border-accent/30 p-4" aria-label="retained key request">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {issued ? 'Save this secret now' : creating ? 'Creating key' : 'Retained creation request'}
            </h2>
            <Badge tone={issued ? 'ok' : 'warn'}>{pending.outcome}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{pending.name} · public request ID</p>
          <code className="block break-all text-sm" data-testid="pending-key-id">
            {pending.id}
          </code>
          {issued ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This secret is shown once. Save it in your secret manager before dismissing this card or leaving this
                page. It is never stored by the console. The broker stores only its digest.
              </p>
              <Input
                aria-label="new access key secret"
                value={issued.token}
                readOnly
                autoComplete="off"
                spellCheck={false}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
              {copyError && <ErrorBanner message={copyError} />}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void copySecret()}>
                  {copied ? 'copied' : 'copy secret'}
                </Button>
                <Button variant="outline" size="sm" onClick={dismissPending}>
                  I saved the secret
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Only this public ID is saved in this tab. A missing response cannot recover a secret or prove that
                creation failed. Check this exact ID, revoke an undelivered key, then create a replacement. Never
                identify a key by its name alone.
              </p>
              {reconcile && (
                <p role="status" className="text-xs text-muted-foreground">
                  {reconcile}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={creating || checking} onClick={() => void checkRequest()}>
                  {checking ? 'checking…' : 'check request ID'}
                </Button>
                {found && !found.revoked_at_ms && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmRevoke(found)}>
                    revoke undelivered key
                  </Button>
                )}
                {found?.revoked_at_ms ? (
                  <Button variant="outline" size="sm" onClick={dismissPending}>
                    finish reconciliation
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled={creating} onClick={() => setDiscarding(true)}>
                    dismiss saved request…
                  </Button>
                )}
              </div>
              {discarding && (
                <div
                  role="alertdialog"
                  aria-label="dismiss retained request"
                  className="space-y-2 rounded-lg bg-warn/10 p-3"
                >
                  <p className="text-xs">
                    Copy the public ID first. Dismissing it does not revoke a key or cancel a request that may still
                    commit.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={dismissPending}>
                      I saved the ID; dismiss
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDiscarding(false)}>
                      keep request
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {!unsupported && !forbidden && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">create a key</h2>
          <form onSubmit={create} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                name
                <Input
                  aria-label="key name"
                  placeholder="orders-worker"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="off"
                  required
                  disabled={!!pending || creating}
                />
              </label>
              <div className="space-y-1 text-xs text-muted-foreground">
                <span>permissions</span>
                <PermissionSelect
                  value={permissions}
                  onChange={setPermissions}
                  disabled={!!pending || creating}
                />
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <label htmlFor="key-expiry">expiry (local time, optional)</label>
                <DateTimeField
                  id="key-expiry"
                  aria-label="key expiry"
                  value={expiry}
                  onChange={setExpiry}
                  disabled={!!pending || creating}
                />
              </div>
            </div>
            {permissions === 'manage' && (
              <p className="text-xs text-warn">
                A manage key can issue other administrator keys and revoke any managed key, including yours.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                size="sm"
                disabled={loading || creating || !!pending || !!storageError || !name.trim()}
              >
                {creating ? 'creating…' : 'create key'}
              </Button>
              <span className="text-xs text-faint">mqk_ + 64 random lowercase hexadecimal characters · 256 bits</span>
            </div>
          </form>
        </Card>
      )}

      {!unsupported && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">managed keys</h2>
            <span className="text-xs text-faint">25 per page · newest first</span>
          </div>
          {loading ? (
            <Spinner label="loading keys" />
          ) : page.keys.length === 0 ? (
            <Empty>No keys on this page.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-faint">
                  <tr>
                    <th className="px-4 py-2 font-normal">name / public ID</th>
                    <th className="px-3 py-2 font-normal">permissions</th>
                    <th className="px-3 py-2 font-normal">state</th>
                    <th className="px-3 py-2 font-normal">created / expires</th>
                    <th className="px-4 py-2 font-normal">action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {page.keys.map((key) => {
                    const state = keyState(key, now)
                    return (
                      <tr key={key.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{key.name}</div>
                          <code className="mt-1 block text-[10px] text-faint">{key.id}</code>
                        </td>
                        <td className="px-3 py-3">{key.permissions.join(' + ')}</td>
                        <td className="px-3 py-3">
                          <Badge tone={state === 'active' ? 'ok' : state === 'expired' ? 'warn' : 'neutral'}>
                            {state}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-faint">
                          <div>{fmtTime(key.created_at_ms)}</div>
                          <div>{key.expires_at_ms ? fmtTime(key.expires_at_ms) : 'no expiry'}</div>
                          {!!key.revoked_at_ms && <div>revoked {fmtTime(key.revoked_at_ms)}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!!key.revoked_at_ms || revoking}
                            onClick={() => setConfirmRevoke(key)}
                            aria-label={`revoke ${key.name}`}
                          >
                            revoke
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
            <span className="mr-auto text-xs text-faint">page {cursors.length}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || cursors.length === 1}
              onClick={() => setCursors((old) => old.slice(0, -1))}
            >
              previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !page.next_after_id}
              onClick={() => setCursors((old) => [...old, page.next_after_id!])}
            >
              next
            </Button>
          </div>
        </Card>
      )}

      {confirmRevoke && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="revoke-title"
        >
          <Card className="w-full max-w-md space-y-3 p-5">
            <h2 id="revoke-title" className="font-semibold">
              Revoke {confirmRevoke.name}?
            </h2>
            {error && <ErrorBanner message={error} />}
            <code className="block break-all text-xs text-muted-foreground">{confirmRevoke.id}</code>
            <p className="text-xs leading-relaxed text-muted-foreground">
              New requests with this key will be rejected. Already-authorized operations may finish. This cannot be
              undone; other keys it issued remain active. If this is your sign-in key, the next request will sign you
              out.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" disabled={revoking} onClick={() => void revoke()}>
                {revoking ? 'revoking…' : 'confirm revoke'}
              </Button>
              <Button variant="outline" autoFocus disabled={revoking} onClick={() => setConfirmRevoke(null)}>
                cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
