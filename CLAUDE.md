# CLAUDE.md

Guidance for working in this repo.

**mqlite console** is a standalone admin web UI for an [mqlite](https://github.com/mqlitehq/mqlite)
broker — a pure client-side SPA over the broker's JSON-over-HTTP API. No backend of its
own. It is developed separately; mqlite embeds the complete `dist/` output at `/ui/`
from its `server/web/` directory, including third-party license notices.

## Stack & layout

Vite + React 19 + TypeScript + Tailwind CSS v4 + class-variance-authority.

```
src/
  lib/
    api.ts      the broker client — one rpc() wrapper (Bearer auth, 401 intercept),
                typed calls (listQueues/stats/peek/send/redrive/purge/…), base64 body
    auth.ts     token in sessionStorage
    types.ts    wire shapes (QueueInfo, Metrics, WireMessage) — mirror mqlite/wire
    format.ts   number / time / byte formatting
    cn.ts       clsx + tailwind-merge
  components/
    ui.tsx      CVA primitives (Button/Input/Badge/Card/Dot/…)
    Login.tsx   token login (broker discovery + token field)
    Shell.tsx   sidebar shell + view routing
  views/
    Overview.tsx     queues table with live stats + create
    QueueDetail.tsx  stat cards, message browser (peek by state), send, DLQ actions
```

## API contract (the broker)

Every op is one JSON `POST /mqlite.v1.<Service>/<Method>` with `Authorization: Bearer
<token>`. Message bodies are **base64** in JSON (decode for display, encode on send).
Times are epoch-ms. Keep `types.ts` in sync with the broker's `wire` package. Validate
new calls against a live broker (`mqlite serve`) before relying on them.

## Design system — make it ours

Dark-first, **monochrome grayscale + a single amber accent** (the mqlite logo's pop).
**Monospace everywhere** (Geist Mono) — it should read as a console. Compact
density, small type. Elevation via hairline **rings, not shadows** (`ring-1 ring-border`).
Semantic state colors are **low-opacity fills** (`bg-danger/12 text-danger`) + status
dots. Theme tokens live in `src/index.css` (`@theme`, OKLCH). This is the project's own
identity — give new screens personality in this same spirit; do not import another
product's branding, names, or copy.

## Conventions

- Single quotes, no semicolons (Prettier-ish), 2-space indent. Named exports.
- Strict TypeScript (`noUnusedLocals`/`noUnusedParameters` on) — `npm run build`
  (= `tsc -b && vite build`) must pass before commit.
- Keep deps light; the dist must stay small (it gets embedded).
