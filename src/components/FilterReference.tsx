import { useEffect, useState } from 'react'
import { FILTER_INTRO, FILTER_REF, filterRefText } from '../lib/filterRef'
import { Button } from './ui'

// A flip-through reference for the filter language, opened from the editor. Every example
// inserts on click; "copy for AI" yields the whole spec as plain text.
export function FilterReference({
  onInsert,
  onClose,
}: {
  onInsert: (expr: string) => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copyForAI() {
    try {
      await navigator.clipboard.writeText(filterRefText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-surface ring-1 ring-border-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 rounded-t-xl border-b border-border bg-surface px-5 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">filter expression reference</span>
            <span className="text-xs text-faint">click any example to insert</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyForAI}>
              {copied ? '✓ copied' : 'copy for AI'}
            </Button>
            <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
              close ✕
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">{FILTER_INTRO}</p>

          {FILTER_REF.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{s.title}</h3>
              {s.intro && <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{s.intro}</p>}
              <div className="divide-y divide-border/50 rounded-lg ring-1 ring-border">
                {s.rows?.map((r) => (
                  <button
                    key={r.expr}
                    onClick={() => onInsert(r.expr)}
                    title="insert"
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <code className="shrink-0 font-mono text-xs text-foreground/90 group-hover:text-foreground">{r.expr}</code>
                    <span className="text-[11px] text-muted-foreground sm:ml-auto sm:text-right">{r.desc}</span>
                  </button>
                ))}
              </div>
              {s.note && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                  <span className="text-warn">note </span>
                  {s.note}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
