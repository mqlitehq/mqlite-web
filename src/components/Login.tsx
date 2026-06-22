import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, discovery, login } from '../lib/api'
import type { Discovery } from '../lib/types'
import { Button, ErrorBanner, Input } from './ui'

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState<Discovery | null>(null)

  useEffect(() => {
    discovery().then(setInfo)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = token.trim()
    if (!t || busy) return
    setBusy(true)
    setErr('')
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
    <div className="grid-backdrop relative min-h-screen flex items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className="h-[440px] w-[440px] rounded-full"
          style={{ background: 'radial-gradient(circle, oklch(0.84 0.16 84 / 9%), transparent 70%)' }}
        />
      </div>

      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-xl bg-surface p-6 ring-1 ring-border shadow-[0_0_70px_-24px] shadow-accent/40"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-accent">▸</span>
          <h1 className="text-xl font-semibold tracking-tight">mqlite</h1>
          <span className="text-xs text-muted-foreground">console</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {info
            ? `${info.name ?? 'broker'}${info.version ? ` ${info.version}` : ''} · ${info.status ?? 'online'}`
            : 'connect to a broker'}
        </p>

        <div className="mt-6">
          <div className="mb-1.5 text-xs text-muted-foreground">
            auth <span className="text-faint">▸</span> paste a broker token
          </div>
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

        {err && (
          <div className="mt-3">
            <ErrorBanner message={err} />
          </div>
        )}

        <Button type="submit" disabled={!token.trim() || busy} className="mt-4 w-full">
          {busy ? 'connecting…' : 'connect'}
        </Button>

        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          the token is one of the broker's <span className="text-muted-foreground">MQLITE_TOKENS</span>. it stays in
          this tab only.
        </p>
      </form>

      <div className="absolute bottom-4 text-[11px] text-faint cursor-blink">mqlite console</div>
    </div>
  )
}
