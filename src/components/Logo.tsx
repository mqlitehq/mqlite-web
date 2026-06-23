// The mqlite mark — the project's own logo: a queue draining, message dots flowing into
// the amber exit, on a blue badge. Kept pixel-faithful to docs/logo.svg (the canonical
// project/doc-site logo); the badge carries its own brand colors on any background.
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="mqlite">
      <defs>
        <linearGradient id="mqlite-mark-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="15" fill="url(#mqlite-mark-bg)" />
      <circle cx="17" cy="32" r="3.2" fill="#ffffff" opacity=".5" />
      <circle cx="27" cy="32" r="3.2" fill="#ffffff" opacity=".75" />
      <circle cx="37" cy="32" r="3.2" fill="#ffffff" />
      <path d="M43 32 h3" stroke="#facc15" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="50" cy="32" r="4" fill="#facc15" />
    </svg>
  )
}

// The lockup: the mark + the "mqlite" wordmark. The wordmark takes the console's own ink
// (the doc-site renders it in blue, which is too dark on this canvas) — mq heavier, lite
// lighter, matching the lockup's weight rhythm.
export function Logo({ markSize = 26, text = 16 }: { markSize?: number; text?: number }) {
  return (
    <div className="flex select-none items-center gap-2" title="mqlite console">
      <LogoMark size={markSize} />
      <span style={{ fontSize: text }} className="tracking-tight">
        <span className="font-extrabold text-foreground">mq</span>
        <span className="font-semibold text-muted-foreground">lite</span>
      </span>
    </div>
  )
}
