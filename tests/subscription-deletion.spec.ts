import { expect, test, type Page, type Route } from '@playwright/test'
import { formatStamp } from '../src/lib/time.js'

interface Broker {
  active: boolean
  total: number
  calls: string[]
}

async function setup(page: Page): Promise<Broker> {
  const broker: Broker = { active: true, total: 4, calls: [] }
  await page.addInitScript(() => {
    localStorage.setItem('mqlite_endpoint', 'https://subscription.example.test')
    sessionStorage.setItem('mqlite_token', 'fixture-admin')
  })
  await page.route('https://subscription.example.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    broker.calls.push(path)
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/') return respond({ name: 'mqlite', version: '0.4.0', status: 'ok' })
    if (path.endsWith('/Observe'))
      return respond({ code: 'unimplemented', message: 'no such path: Observe' }, 404)
    if (path.endsWith('/ListQueues'))
      return respond({
        queues: broker.active ? [{ name: 'emails', kind: 'subscription', state: 'active' }] : [],
      })
    if (path.endsWith('/ListSubscriptions'))
      // Omitting state pins compatibility with brokers predating subscription lifecycle.
      return respond({
        subscriptions: broker.active ? [{ topic: 'events', name: 'emails', expr: '' }] : [],
      })
    if (path.endsWith('/ListSubscriptionsPage'))
      return respond({ code: 'unimplemented', message: 'no such path' }, 404)
    if (path.endsWith('/Stats'))
      return respond({
        queue: 'emails',
        active: broker.total,
        locked: 0,
        deferred: 0,
        scheduled: 0,
        dead_lettered: 0,
        total: broker.total,
        oldest_message_age_ms: 0,
      })
    if (path.endsWith('/Peek')) return respond({ messages: [] })
    return respond({ code: 'not_found', message: `no such path: ${path}` }, 404)
  })
  return broker
}

async function openDelete(page: Page) {
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await page.getByRole('button', { name: 'delete subscription', exact: true }).click()
  return page.getByRole('dialog')
}

async function confirmExact(dialog: ReturnType<Page['getByRole']>) {
  await dialog.getByLabel('Type events/emails to confirm').fill('events/emails')
}

function fullSubscriptionPage() {
  return Array.from({ length: 1000 }, (_, index) => ({
    topic: 'events',
    name: `archive-${String(index).padStart(4, '0')}`,
    expr: '',
    state: 'active',
    created_at_ms: 1,
    expires_at_ms: 0,
  }))
}

function activeSubscriptionPage(state: 'active' | 'deleting' = 'active') {
  return {
    subscriptions: [
      { topic: 'events', name: 'emails', expr: '', state, created_at_ms: 1, expires_at_ms: 0 },
    ],
    total: 1,
  }
}

async function fulfillGlobalInventory(route: Route, broker: Broker): Promise<boolean> {
  const request = route.request().postDataJSON() as Record<string, unknown>
  if (request.topic !== undefined) return false
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(broker.active ? activeSubscriptionPage() : { subscriptions: [], total: 0 }),
  })
  return true
}

test('empty subscription deletion requires the exact topic/name and never sends force', async ({ page }) => {
  const broker = await setup(page)
  broker.total = 0
  let deletes = 0
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ topic: 'events', name: 'emails' })
    deletes++
    broker.active = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":true,"state":"deleted"}',
    })
  })

  const dialog = await openDelete(page)
  const confirm = dialog.getByRole('button', { name: 'confirm delete', exact: true })
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await dialog.getByLabel('Type events/emails to confirm').fill('events/email')
  await expect(confirm).toBeDisabled()
  await confirmExact(dialog)
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: /emails/ })).toHaveCount(0)
  expect(deletes).toBe(1)
})

test('nonempty subscription deletion exposes force only after an explicit warning', async ({ page }) => {
  const broker = await setup(page)
  let deletes = 0
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ topic: 'events', name: 'emails', force: true })
    deletes++
    broker.active = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":true,"state":"deleted"}',
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  const confirm = dialog.getByRole('button', { name: 'confirm delete', exact: true })
  await expect(confirm).toBeDisabled()
  await expect(dialog).toContainText('Empty-only deletion is unavailable')
  await expect(dialog).toContainText('locked delivery')
  const force = dialog.getByRole('checkbox', {
    name: 'Force deletion and permanently discard every message state',
  })
  await force.check()
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  expect(deletes).toBe(1)
})

test('wrong-topic not_found becomes read-only reconciliation instead of another delete', async ({ page }) => {
  const broker = await setup(page)
  broker.total = 0
  let deletes = 0
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    deletes++
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'not_found', message: 'subscription not found under topic' }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('No subscription matched this exact topic/name')
  await expect(dialog.getByRole('button', { name: 'check outcome', exact: true })).toBeVisible()
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          { topic: 'events', name: 'emails', expr: '', state: 'active', created_at_ms: 1, expires_at_ms: 0 },
        ],
        total: 1,
      }),
    })
  })
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('original lifetime or a replacement')
  await expect(dialog).toBeVisible()
  expect(deletes).toBe(1)
})

test('a stale empty count surfaces subscription_not_empty and refreshes before force is offered', async ({
  page,
}) => {
  const broker = await setup(page)
  broker.total = 0
  let deletes = 0
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ topic: 'events', name: 'emails' })
    deletes++
    broker.total = 1
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'subscription_not_empty', message: 'Subscription now contains messages.' }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Subscription now contains messages')
  await expect(
    dialog.getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' }),
  ).toBeVisible()
  expect(deletes).toBe(1)
})

test('pending subscription deletion scans scoped pages and never replays delete', async ({ page }) => {
  const broker = await setup(page)
  let deletes = 0
  const pageRequests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    deletes++
    broker.active = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":false,"state":"deleting"}',
    })
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (deletes === 0)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeSubscriptionPage()),
      })
    pageRequests.push(request)
    if (pageRequests.length === 1)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriptions: fullSubscriptionPage(),
          total: 1001,
          next_after: 'opaque-next',
        }),
      })
    if (pageRequests.length === 2)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriptions: [
            { topic: 'events', name: 'emails', expr: '', state: 'deleting', created_at_ms: 1, expires_at_ms: 0 },
          ],
          total: 1001,
        }),
      })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subscriptions: [], total: 0 }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog
    .getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' })
    .check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Deletion was accepted')
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Cleanup is still in progress')
  expect(pageRequests).toEqual([
    { topic: 'events', limit: 1000, include_deleting: true },
    { topic: 'events', after: 'opaque-next', limit: 1000, include_deleting: true },
  ])
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(deletes).toBe(1)
  expect(pageRequests[2]).toEqual({ topic: 'events', limit: 1000, include_deleting: true })
})

for (const outcome of ['server error', 'redirect', 'transport', 'malformed acknowledgement'] as const) {
  test(`${outcome} becomes outcome_unknown and reconciles without replay`, async ({ page }) => {
    const broker = await setup(page)
    let deletes = 0
    let redirectTargets = 0
    const pageRequests: unknown[] = []
    await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
      deletes++
      if (outcome === 'server error')
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'internal', message: 'delete state unavailable' }),
        })
      if (outcome === 'redirect')
        return route.fulfill({ status: 307, headers: { location: '/subscription-delete-redirect' } })
      if (outcome === 'transport') return route.abort('failed')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"deleted":true,"state":"deleting"}',
      })
    })
    await page.route('**/subscription-delete-redirect', async (route) => {
      redirectTargets++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"deleted":true,"state":"deleted"}',
      })
    })
    await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
      if (await fulfillGlobalInventory(route, broker)) return
      if (deletes === 0)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(activeSubscriptionPage()),
        })
      pageRequests.push(route.request().postDataJSON())
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subscriptions: [
            { topic: 'events', name: 'emails', expr: '', state: 'deleting', created_at_ms: 1, expires_at_ms: 0 },
          ],
          total: 1,
        }),
      })
    })

    let dialog = await openDelete(page)
    await confirmExact(dialog)
    await dialog
      .getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' })
      .check()
    await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Deletion could not be confirmed')
    await dialog.getByRole('button', { name: 'cancel', exact: true }).click()
    await page.getByRole('button', { name: 'check delete outcome', exact: true }).click()
    dialog = page.getByRole('dialog')
    await confirmExact(dialog)
    await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Cleanup is still in progress')
    expect(deletes).toBe(1)
    expect(redirectTargets).toBe(0)
    expect(pageRequests).toEqual([{ topic: 'events', limit: 1000, include_deleting: true }])
  })
}

test('reconciliation rejects a repeated cursor and never replays delete', async ({ page }) => {
  const broker = await setup(page)
  let deletes = 0
  const pageRequests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    deletes++
    broker.active = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":false,"state":"deleting"}',
    })
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    if (deletes === 0)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeSubscriptionPage()),
      })
    pageRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: fullSubscriptionPage(),
        total: 1001,
        next_after: 'repeated-cursor',
      }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog
    .getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' })
    .check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Deletion was accepted')
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('repeated a cursor')
  expect(deletes).toBe(1)
  expect(pageRequests).toEqual([
    { topic: 'events', limit: 1000, include_deleting: true },
    { topic: 'events', after: 'repeated-cursor', limit: 1000, include_deleting: true },
  ])
})

test('reconciliation rejects a first page missing its required cursor and never replays delete', async ({
  page,
}) => {
  const broker = await setup(page)
  let deletes = 0
  const pageRequests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    deletes++
    broker.active = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":false,"state":"deleting"}',
    })
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    if (deletes === 0)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(activeSubscriptionPage()),
      })
    pageRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: fullSubscriptionPage(),
        total: 1001,
      }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog
    .getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' })
    .check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Deletion was accepted')
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Paged subscription inventory is unavailable')
  await expect(dialog).toBeVisible()
  expect(deletes).toBe(1)
  expect(pageRequests).toEqual([{ topic: 'events', limit: 1000, include_deleting: true }])
})

test('subscription creation sends an optional fixed TTL and omits it for a permanent subscription', async ({ page }) => {
  await setup(page)
  const requests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/Subscribe', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: '+ subscription', exact: true }).click()
  await page.getByPlaceholder('events').fill('requests')
  await page.getByPlaceholder('eu-orders').fill('reply-worker')
  await page.getByLabel('subscription lifetime', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({ topic: 'requests', name: 'reply-worker', ttl_ms: 120_000 })

  await page.getByRole('button', { name: '+ subscription', exact: true }).click()
  await page.getByPlaceholder('events').fill('events')
  await page.getByPlaceholder('eu-orders').fill('durable-worker')
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual({ topic: 'events', name: 'durable-worker' })
})

test('subscription creation refuses a non-positive or fractional-millisecond TTL before sending', async ({ page }) => {
  await setup(page)
  let requests = 0
  await page.route('**/mqlite.v1.AdminService/Subscribe', async (route) => {
    requests++
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: '+ subscription', exact: true }).click()
  await page.getByPlaceholder('events').fill('requests')
  await page.getByPlaceholder('eu-orders').fill('reply-worker')
  await page.getByLabel('subscription lifetime unit').selectOption('1000')
  await page.getByLabel('subscription lifetime', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('positive whole-millisecond')
  expect(requests).toBe(0)

  await page.getByLabel('subscription lifetime', { exact: true }).fill('0.0001')
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('positive whole-millisecond')
  expect(requests).toBe(0)
})

test('subscription creation accepts exactly 10 years and rejects one millisecond more regardless of client time', async ({
  page,
}) => {
  const maxTTL = 3650 * 86_400_000
  await setup(page)
  await page.addInitScript(() => {
    Date.now = () => Number.MAX_SAFE_INTEGER - 1
  })
  const requests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/Subscribe', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: '+ subscription', exact: true }).click()
  await page.getByPlaceholder('events').fill('requests')
  await page.getByPlaceholder('eu-orders').fill('reply-worker')
  await page.getByLabel('subscription lifetime unit').selectOption('1000')

  await page.getByLabel('subscription lifetime', { exact: true }).fill(String(maxTTL / 1000 + 0.001))
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('no longer than 10 years')
  expect(requests).toHaveLength(0)

  await page.getByLabel('subscription lifetime', { exact: true }).fill(String(maxTTL / 1000))
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({ topic: 'requests', name: 'reply-worker', ttl_ms: maxTTL })
})

test('reconciliation rejects lifecycle rows without explicit fixed-lifetime fields', async ({ page }) => {
  const broker = await setup(page)
  broker.total = 0
  let deletes = 0
  await page.route('**/mqlite.v1.AdminService/DeleteSubscription', async (route) => {
    deletes++
    broker.active = false
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"deleted":false,"state":"deleting"}' })
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [{ topic: 'events', name: 'emails', expr: '', state: 'deleting' }],
        total: 1,
      }),
    })
  })

  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await dialog.getByRole('button', { name: 'check outcome', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Paged subscription inventory is unavailable')
  expect(deletes).toBe(1)
})

test('subscription detail shows a permanent lifetime without inventing a browser-clock deadline', async ({ page }) => {
  await setup(page)
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          { topic: 'events', name: 'emails', expr: '', state: 'active', created_at_ms: 1000, expires_at_ms: 0 },
        ],
        total: 1,
      }),
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  const lifecycle = page.getByLabel('subscription lifecycle')
  await expect(lifecycle).toContainText('permanent · no expiry')
})

test('subscription detail reports a lifecycle row that has expired or been deleted', async ({ page }) => {
  const broker = await setup(page)
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subscriptions: [], total: 0 }),
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByRole('status')).toContainText('It may have expired or been deleted')
  await expect(page.getByRole('button', { name: 'delete subscription', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ publish', exact: true })).toHaveCount(0)
})

test('an authoritative missing lifecycle scan replaces a stale deleting state', async ({ page }) => {
  await setup(page)
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(request.topic ? { subscriptions: [], total: 0 } : activeSubscriptionPage('deleting')),
    })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByRole('status')).toContainText('not present in the latest lifecycle scan')
  await expect(page.getByText('Deletion has been accepted', { exact: false })).toHaveCount(0)
  await expect(page.getByText('deleting', { exact: true })).toHaveCount(0)
})

test('subscription detail rejects an undisplayable lifecycle timestamp instead of crashing', async ({ page }) => {
  const broker = await setup(page)
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    if (await fulfillGlobalInventory(route, broker)) return
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: '',
            state: 'active',
            created_at_ms: 1000,
            expires_at_ms: Number.MAX_SAFE_INTEGER,
          },
        ],
        total: 1,
      }),
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByLabel('subscription lifecycle').getByRole('alert')).toContainText(
    'Paged subscription inventory is unavailable',
  )
})

test('remaining timestamp formatting honors an explicit reference clock', () => {
  expect(formatStamp(2000, 'relative', 1000, 'remaining')).toBe('1s left')
  expect(formatStamp(2000, 'relative', 2000, 'remaining')).toBe('now')
  expect(formatStamp(1000, 'relative', 2000, 'remaining')).toBe('1s ago')
  expect(formatStamp(2000, 'relative', null, 'remaining')).toBe('unavailable')
})

test('older brokers keep the subscription visible and explain that deletion is unsupported', async ({ page }) => {
  const broker = await setup(page)
  broker.total = 0
  const dialog = await openDelete(page)
  await confirmExact(dialog)
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('does not support deleting subscriptions')
  await expect(dialog).toBeVisible()
  expect(broker.calls.filter((path) => path.endsWith('/DeleteSubscription'))).toHaveLength(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(1)
})
