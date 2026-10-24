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

After login, the header keeps a compact `same-origin`, `remote`, or `custom`
connection badge visible. Hover it or focus it from the keyboard to see the broker
origin, identity/version, and observation availability. Remote details contain only
the broker origin (scheme, host and port); URL credentials, paths, query parameters
and fragments are never rendered.

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

Expiry and scheduled-delivery inputs use local time in `yyyy-MM-dd HH:mm` format,
independently of the display mode. Their calendar controls stay in English
regardless of browser language. Displayed timestamps follow the top-bar
`rel` / `local` / `UTC` switch; local and UTC values use
`yyyy-MM-dd HH:mm:ss`, with `Z` marking UTC. Invalid input dates are rejected
rather than silently shifted to a different day or time.

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

## Queue deletion

The queue detail page requires the exact queue name before deletion. The default
action remains empty-only: every retained message state must be empty. When the
latest count is nonzero, the console exposes a separate force checkbox and states
that force permanently discards active, locked, scheduled, deferred and
dead-letter messages. A locked delivery may already have caused an external side
effect; removing its broker record cannot undo that effect.

Current brokers may accept deletion before bounded physical cleanup finishes. The
console recognizes the `{"deleted":false,"state":"deleting"}` response, refreshes
the inventory, marks the queue as **deleting**, and stops offering data-plane
actions. The name remains reserved until the row disappears. **Check deletion**
only refreshes the queue inventory; it never replays the name-only delete against
a possible same-name replacement. The delete request also refuses HTTP redirects;
a redirect, transport failure, or invalid acknowledgement leaves the result
unknown and requires a read-only inventory refresh. Older brokers report the
operation as unsupported.

## Subscription deletion

The create form can set an optional fixed lifetime. The broker stores one
absolute deadline from the first successful creation; publishing, receiving,
filter edits, and ordinary retries never extend it. At the deadline the
subscription becomes unavailable and expiry is treated as prior authorization
to discard any retained messages during bounded cleanup. Leave the field blank
for a permanent subscription. Explicit deletion remains the normal completion
path for request/reply work; the lifetime is a cleanup backstop when a caller is
lost or forgets to delete. The console accepts at most 10 years (3,650 fixed
24-hour days), keeping absolute expiry timestamps practical and exactly
representable even when broker and client clocks differ slightly.

Subscription lifetime displays derive relative `left` / `ago` values from the
broker clock reported by `Observe`, not from the browser clock. If that clock is
unavailable, the console says so instead of inventing a relative value; a stale
sample stays visibly marked. Absolute local and UTC deadlines remain selectable.

The subscription detail page deletes one exact `topic/name` mapping and requires
that full pair as confirmation. Deletion is empty-only by default. The force
choice appears only when the latest retained-message total is greater than zero,
and explicitly discards every message state. Removing the final subscription
also lets its implicit topic disappear; topics have no separate delete action.

An accepted but unfinished delete blocks fan-out and the subscription data plane
while cleanup retains the name. Pending or unknown outcomes are checked only
through bounded `ListSubscriptionsPage` reads scoped to the topic with
`include_deleting=true`. The console follows opaque cursors until it finds the
exact subscription or exhausts the scope. It never reconciles by replaying the
delete, and it refuses HTTP redirects for that destructive POST. Older brokers
continue to list subscriptions normally and show an upgrade message when this
new action is attempted.

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

Managed topology uses the paged subscription lifecycle inventory, including rows
being deleted, on initial connection, explicit refresh, and configuration changes.
On current brokers the five-second poll calls only `Observe`, and message operations
do not rescan the global inventory. Older brokers poll `Stats` for the cached queue
topology without listing it again. Opening or refreshing subscription detail performs
a bounded, topic-scoped lifecycle lookup. If the paged route is absent, older brokers
use the legacy subscription list and the Topics view marks lifecycle details unavailable.
