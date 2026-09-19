# mqlite console

A small admin web console for an [mqlite](https://github.com/mqlitehq/mqlite) broker.
Point it at a broker, authenticate with a token, then browse **queues**, **topics**
and their **subscriptions**, inspect messages, publish/send, edit subscription filters
online, redrive / purge the dead-letter queue, and manage **access keys**.

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
npm run dev        # http://localhost:5173 — proxies /mqlite.v1.* to a broker on :6754
```

Run a broker alongside it and log in with its token (leave the URL blank — the dev server
proxies same-origin):

```bash
MQLITE_TOKENS=mqk_dev MQLITE_DB=file:./mq.db mqlite serve --addr :6754
```

## Build

```bash
npm run build      # → dist/  (static, path-relative, ~80 kB gzipped JS)
```

## Auth

Log in with a managed key with `manage` permission or one of the broker's configured
`MQLITE_TOKENS` administrators. Send/listen keys are for applications and receive a
clear administrator requirement at console login. The login token is kept in
`sessionStorage` (this tab only) and sent as `Authorization: Bearer …` on every call;
any `401` clears it and bounces back to the login screen. A `403` reports missing
permission without clearing the session.

## Access keys

The **access keys** navigation entry works with mqlite v0.3.1 and later. Older
brokers show an upgrade message; existing message and entity tools still work.

| Permission      | Intended use                                                      |
| --------------- | ----------------------------------------------------------------- |
| `send`          | Publish, schedule, and cancel scheduled messages                  |
| `listen`        | Browse, receive, settle, and renew messages                       |
| `send + listen` | Processors that consume and publish                               |
| `manage`        | All operations, including issuing and revoking administrator keys |

Create a named key with optional expiry, then save the one-time secret in a secret
manager. New tokens use `mqk_` plus 64 lowercase hexadecimal characters (256 random
bits). The console never persists issued secrets or logs them. The broker stores
only their SHA-256 digests. Configured administrator tokens are not listed and
cannot be revoked through this page.

The **managed keys** list contains access keys created at runtime. Configured
administrator tokens in `MQLITE_TOKENS` are managed through broker configuration;
change the configuration and restart the broker to update or remove them.

Expiry and scheduled delivery use local time in `yyyy-MM-dd HH:mm` format. Their
calendar controls stay in English regardless of browser language, and listed
timestamps use `yyyy-MM-dd HH:mm:ss`. Invalid dates are rejected rather than
silently shifted to a different day or time.

A public 32-hex ID is generated with browser `crypto.getRandomValues` and retained
in this tab **before** creation is sent. If storage or randomness is unavailable,
creation stops. This public ID is scoped to the broker and survives reloads or
re-login in the same tab. A lost response is never retried automatically: check
the exact ID, revoke any undelivered key, and create a replacement with a new ID.
A missing row does not prove an outstanding request cannot commit later. Dismissing
an unresolved ID requires confirmation and does not revoke a key or cancel a call.

Lists are paginated and show active, expired, and revoked records. Revocation
requires confirmation and rejects newly authenticated requests; already-authorized
operations may finish. Revoking an issuer does not revoke other keys it created.
Rotate by creating a replacement, switching clients, and revoking the old key.
Backups contain key state; restoring an older backup can re-enable credentials
revoked afterward, so audit and rotate keys before reopening access.

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

## Browser checks

```bash
npm ci
npm run build
npx playwright install chromium
npm test
```

The browser suite exercises the built console against a deterministic HTTP fixture:
all permission choices, one-time secret handling, retained IDs, lost responses,
pagination, revocation confirmation, login permissions, and older brokers. It does
not import, build, or require the broker repository. Validate API changes against a
live broker separately before embedding the new `dist/`.
