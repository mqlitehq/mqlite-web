import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, discovery, login } from '../lib/api.js'
import { getEndpoint, setEndpoint } from '../lib/auth.js'
import type { Discovery } from '../lib/types.js'
import { Button, ErrorBanner, Input, Label } from './ui.js'
import { Logo } from './Logo.js'

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [endpoint, setEp] = useState(getEndpoint())
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState<Discovery | null>(null)

  // probe whichever broker the endpoint points at (blank = same origin).
  function probe() {
    setEndpoint(endpoint)
    discovery().then(setInfo)
  }
  useEffect(() => {
    discovery().then(setInfo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = token.trim()
    if (!t || busy) return
    setBusy(true)
    setErr('')
    setEndpoint(endpoint) // target this broker before we authenticate
    try {
      await login(t)
      onAuthed()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'could not reach the broker')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid-backdrop relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-[440px] w-[440px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgb(255 144 0 / 9%), transparent 70%)' }}
        />
      </div>

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-xl bg-surface p-6 ring-1 ring-border shadow-[0_0_70px_-24px] shadow-accent/40"
      >
        <div className="flex items-center gap-2">
          <Logo markSize={28} text={20} />
          <span className="text-xs text-muted-foreground">console</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {info
            ? `${info.name ?? 'broker'}${info.version ? ` ${info.version}` : ''} · ${info.status ?? 'online'}`
            : 'connect to any mqlite broker'}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <Label>broker URL</Label>
            <Input
              value={endpoint}
              onChange={(e) => setEp(e.target.value)}
              onBlur={probe}
              placeholder={window.location.origin + '  (blank = this origin)'}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>administrator token</Label>
            <Input
              type="password"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="mqk_…"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>

        {err && (
          <div className="mt-3">
            <ErrorBanner message={err} />
          </div>
        )}

        <Button type="submit" disabled={!token.trim() || busy} className="mt-4 w-full">
          {busy ? 'connecting…' : 'connect'}
        </Button>

        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          Connect with a <span className="text-muted-foreground">manage</span> key or an administrator from{' '}
          <span className="text-muted-foreground">MQLITE_TOKENS</span>. The URL is remembered; the login token stays in
          this tab only.
        </p>
      </form>

      <div className="absolute bottom-4 cursor-blink text-[11px] text-faint">mqlite console</div>
    </div>
  )
}
