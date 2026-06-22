# mqlite console

A small admin web console for an [mqlite](https://github.com/mqlitehq/mqlite) broker.
Log in with a broker token, then browse queues, inspect messages, send, and
redrive / purge the dead-letter queue.

Dark, monospace, single-accent (amber) — a terminal-flavored dashboard for a message
queue.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 — proxies /mqlite.v1.* to a broker on :8080
```

Run a broker alongside it and log in with its token:

```bash
MQLITE_TOKENS=mqk_dev MQLITE_DB=file:./mq.db mqlite serve --addr :8080
```

## Build

```bash
npm run build      # → dist/  (static, path-relative, ~75 kB gzipped JS)
```

## Auth

Logging in = holding one of the broker's `MQLITE_TOKENS`. The token is kept in
`sessionStorage` (this tab only) and sent as `Authorization: Bearer …` on every call;
any `401` clears it and bounces back to the login screen.

## Integrating with the broker

`dist/` is static and path-relative (`base: './'`), so it embeds at any mount point.
Two options (pick later — the same artifact works for both):

1. **Go embed** — `go:embed` the built `dist/` into the broker binary and serve it
   (e.g. at `/ui/`). One self-contained binary, no extra assets to ship.
2. **Container stage** — copy `dist/` into the broker image during the docker build.

## Stack

Vite · React · TypeScript · Tailwind CSS v4 · CVA. No backend — a pure client over the
broker's JSON-over-HTTP API (`/mqlite.v1.<Service>/<Method>`).
