# mqlite console

A small admin web console for an [mqlite](https://github.com/mqlitehq/mqlite) broker.
Point it at a broker, authenticate with a token, then browse **queues**, **topics**
and their **subscriptions**, inspect messages, publish/send, edit subscription filters
online, and redrive / purge the dead-letter queue.

True-black, monospace (Geist Mono), one scarce warm accent — a terminal-flavored,
density-first dashboard for a message queue.

## Standalone connector

The console is a pure client of the broker's HTTP API — it isn't tied to any one broker.
The login screen takes a **broker URL** (blank = same origin, the embedded case) and a
**token**; the URL is remembered (localStorage) and the token stays per-tab. So the same
console can connect to **any reachable mqlite broker** you hold a token for.

Cross-origin (console and broker on different origins) needs the broker to allow it —
run it with `MQLITE_CORS` set (the `mqlite serve` binary defaults to `*`, which is safe
because every RPC still requires a Bearer token).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 — proxies /mqlite.v1.* to a broker on :8080
```

Run a broker alongside it and log in with its token (leave the URL blank — the dev server
proxies same-origin):

```bash
MQLITE_TOKENS=mqk_dev MQLITE_DB=file:./mq.db mqlite serve --addr :8080
```

## Build

```bash
npm run build      # → dist/  (static, path-relative, ~80 kB gzipped JS)
```

## Auth

Logging in = holding one of the broker's `MQLITE_TOKENS`. The token is kept in
`sessionStorage` (this tab only) and sent as `Authorization: Bearer …` on every call;
any `401` clears it and bounces back to the login screen.

## Integrating with the broker (deferred)

`dist/` is static and path-relative (`base: './'`), so it embeds at any mount point.
Two options (the same artifact works for both):

1. **Go embed** — `go:embed` the built `dist/` into the broker binary and serve it
   (e.g. at `/ui/`). One self-contained binary, no extra assets to ship.
2. **Container stage** — copy `dist/` into the broker image during the docker build.

Embedding is intentionally **not wired yet** — the standalone console is finalized first,
then merged into the broker.

## Stack

Vite · React · TypeScript · Tailwind CSS v4 · CVA · Geist Mono. No backend — a pure
client over the broker's JSON-over-HTTP API (`/mqlite.v1.<Service>/<Method>`).
