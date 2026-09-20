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
npm run build      # → dist/  (static, path-relative, ~100 kB gzipped JS)
```

## Auth

Log in with a managed key with `manage` permission or one of the broker's configured
`MQLITE_TOKENS` administrators. Configured `MQLITE_MONITOR_TOKENS` credentials
open read-only overview and metrics views. Send/listen keys are for applications and receive a
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

Lists show active, expired, and revoked records, newest created first across all
pages. The broker orders by creation time and then public ID, both descending;
cursor pagination keeps existing records in order when another key is created.
Creating a key returns the list to the first page. Exact-ID reconciliation uses
the API's default ID order independently of the displayed list. Revocation
requires confirmation and rejects newly authenticated requests; already-authorized
operations may finish. Revoking an issuer does not revoke other keys it created.
Rotate by creating a replacement, switching clients, and revoking the old key.
Backups contain key state; restoring an older backup can re-enable credentials
revoked afterward, so audit and rotate keys before reopening access.

## Integrating with the broker

The broker embeds the built console at `/ui/`. This repository remains the source
of the console; the broker repository tracks a copy of the complete `dist/` output
in `server/web/` for `go:embed`.

After console changes are merged, build that revision and replace the broker's
`server/web/` contents with the complete `dist/` output, including
`THIRD_PARTY_NOTICES.txt`. Remove obsolete hashed assets, then build and test the
broker before merging its asset update. Do not edit generated assets directly.

The build is static and path-relative (`base: './'`), so the same output also works
on a static host or in a container. Keep its directory structure and license
notices intact.

## License

The console is released under the [MIT license](LICENSE). Bundled libraries and
the Geist Mono font retain their own licenses; their full notices are in
[`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt), which Vite copies
into every build. The font is licensed under SIL OFL 1.1.

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

## Unified observation

Brokers with `Observe` support supply one canonical snapshot to the overview, metrics
view, and queue detail counters. Queue collection failures show unknown gauges,
while available process counters remain visible. The view includes collection
freshness, storage availability, committed message effects, errors, maintenance,
and an expandable full snapshot. Process counters reset when the broker restarts.

A token configured in `MQLITE_MONITOR_TOKENS` opens only the read-only overview and
metrics views. The console does not call administrative or message APIs with that
credential. Managed `send` and `listen` keys retain their existing API permissions.

Older brokers use the existing List/Stats endpoints only when Observe reports an
unsupported route. Missing per-queue data makes aggregate counts unknown; auth,
network, invalid-response and server errors never trigger this fallback.
