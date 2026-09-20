import { test, expect, type Page } from '@playwright/test'
import { isObservation, type Observation } from '../src/lib/observation.js'

function sample(access: Observation['access'] = 'manage'): Observation {
  const snapshot: Observation = {
    version: '0.3.2',
    access,
    backend: 'memory',
    sampled_at_ms: 1800000005000,
    started_at_ms: 1800000000000,
    runtime: {
      schema_version: '5',
      ping_seconds: 0.001,
      read_available: true,
      db_size_bytes: 0,
      db_size_available: false,
    },
    collection: { state: 'available', last_success_at_ms: 1800000005000, duration_seconds: 0.002, error_code: '' },
    queue_count: 1,
    subscription_count: 1,
    queues: [
      {
        queue: 'orders',
        kind: 'queue',
        active: 7,
        locked: 2,
        scheduled: 0,
        deferred: 1,
        dead_lettered: 3,
        total: 15,
        unexpected: 2,
        oldest_message_age_ms: 3000,
      },
      {
        queue: 'emails',
        kind: 'subscription',
        active: 4,
        locked: 0,
        scheduled: 0,
        deferred: 0,
        dead_lettered: 0,
        total: 4,
        unexpected: 0,
        oldest_message_age_ms: 1000,
      },
    ],
    messages: [
      { queue: 'orders', event: 'enqueued', count: 20 },
      { queue: 'orders', event: 'completed', count: 5 },
    ],
    storage: {
      operations: [
        {
          operation: 'query',
          outcome: 'error',
          error_code: 'connection',
          retries: 2,
          duration: { bounds_seconds: [1], bucket_counts: [2], count: 2, sum_seconds: 0.03 },
        },
      ],
      pool: { max_open: 1, open: 1, in_use: 0, idle: 1, wait_count: 2, wait_duration_seconds: 0.004 },
    },
    maintenance: [
      {
        task: 'locks',
        enabled: true,
        runs: 4,
        failures: 1,
        interrupted: 0,
        last_success_at_ms: 1800000004000,
        duration: { bounds_seconds: [1], bucket_counts: [4], count: 4, sum_seconds: 0.005 },
      },
      {
        task: 'reclaim',
        enabled: false,
        runs: 0,
        failures: 0,
        interrupted: 0,
        last_success_at_ms: 0,
        duration: { bounds_seconds: [1], bucket_counts: [0], count: 0, sum_seconds: 0 },
      },
    ],
    filters: [
      { stage: 'compile', count: 0 },
      { stage: 'evaluate', count: 3 },
    ],
    http: {
      state: 'available',
      requests: [{ rpc: 'QueueService/Send', code: 'permission_denied', count: 6, duration_seconds: 0.03 }],
      authentication: [{ outcome: 'permission_denied', count: 6 }],
      handler_latency: [
        { rpc: 'QueueService/Stats', count: 1, sum_seconds: 0.001, buckets: [{ upper_bound_seconds: 1, count: 1 }] },
      ],
    },
  }
  for (const task of ['scheduled', 'ttl', 'dedup', 'receipts', 'retention']) {
    snapshot.maintenance.push({
      task,
      enabled: true,
      runs: 0,
      failures: 0,
      interrupted: 0,
      last_success_at_ms: 0,
      duration: { bounds_seconds: [1], bucket_counts: [0], count: 0, sum_seconds: 0 },
    })
  }
  for (const outcome of ['success', 'missing', 'invalid', 'expired', 'revoked', 'backend_error']) {
    snapshot.http.authentication.push({ outcome, count: 0 })
  }
  return snapshot
}
interface BrokerFixture {
  observation: unknown
  status: number
  calls: string[]
  legacy: boolean
  failedQueue: string
}
async function setup(page: Page, access: Observation['access'] = 'manage', loggedIn = true): Promise<BrokerFixture> {
  const broker: BrokerFixture = { observation: sample(access), status: 200, calls: [], legacy: false, failedQueue: '' }
  await page.addInitScript((loggedIn) => {
    localStorage.setItem('mqlite_endpoint', 'https://observe.example.test')
    if (loggedIn) sessionStorage.setItem('mqlite_token', 'fixture')
  }, loggedIn)
  await page.route('https://observe.example.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    broker.calls.push(path)
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/') return respond({ name: 'mqlite', version: '0.3.2', status: 'ok' })
    if (path.endsWith('/Observe')) {
      if (broker.legacy) return respond({ code: 'unimplemented', message: 'no such path' }, 404)
      return respond(broker.observation, broker.status)
    }
    if (access === 'monitor') return respond({ code: 'permission_denied', message: 'permission denied' }, 403)
    if (path.endsWith('/ListQueues'))
      return respond({
        queues: [
          { name: 'orders', kind: 'queue' },
          { name: 'emails', kind: 'subscription' },
        ],
      })
    if (path.endsWith('/ListSubscriptions'))
      return respond({ subscriptions: [{ topic: 'events', name: 'emails', expr: '' }] })
    if (path.endsWith('/Stats')) {
      const queue = route.request().postDataJSON().queue
      if (queue === broker.failedQueue) return respond({ code: 'internal', message: 'collection unavailable' }, 500)
      return respond(sample().queues!.find((q) => q.queue === queue))
    }
    if (path.endsWith('/Peek')) return respond({ messages: [] })
    return respond({ code: 'not_found', message: 'no such path' }, 404)
  })
  return broker
}
function stat(page: Page, label: string) {
  return page.locator('main').getByText(label, { exact: true }).locator('..')
}

test('canonical queue, anomaly and process measurements share one request and all domains remain inspectable', async ({
  page,
}) => {
  const broker = await setup(page)
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('19')
  await expect(stat(page, 'active')).toContainText('11')
  await expect(stat(page, 'unexpected states')).toContainText('2')
  await expect(stat(page, 'RPC errors')).toContainText('6')
  await expect(stat(page, 'storage errors')).toContainText('2')
  await expect(stat(page, 'maintenance failures')).toContainText('1')
  await expect(stat(page, 'filter errors')).toContainText('3')
  await expect(page.getByText('disabled / not applicable', { exact: false })).toBeVisible()
  await page.getByText('canonical snapshot · all domains', { exact: true }).click()
  const raw = JSON.parse(await page.locator('pre').innerText())
  expect(raw).toEqual(broker.observation)
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
  expect(broker.calls.some((path) => path.endsWith('/Stats') || path.endsWith('/Status'))).toBe(false)
  await page.getByRole('button', { name: 'metrics', exact: true }).click()
  await expect(stat(page, 'total')).toContainText('19')
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
})

test('monitor login, reload and navigation never request administrative or message APIs', async ({ page }) => {
  const broker = await setup(page, 'monitor', false)
  await page.goto('/')
  await page.locator('input[type=password]').fill('fixture-monitor')
  await page.getByRole('button', { name: 'connect', exact: true }).click()
  await expect(page.getByText('monitor · read only')).toBeVisible()
  for (const name of ['queues', 'topics', 'access keys', 'docs'])
    await expect(page.locator('nav').getByRole('button', { name, exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'metrics', exact: true }).click()
  await expect(page.getByRole('button', { name: /orders/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: /emails/ })).toBeDisabled()
  await page.reload()
  await expect(page.getByText('monitor · read only')).toBeVisible()
  expect(broker.calls.every((path) => path === '/' || path.endsWith('/Observe'))).toBe(true)
})

test('failed DB collection keeps process counters, shows unknown gauges, and recovers on refresh', async ({ page }) => {
  const broker = await setup(page, 'monitor')
  const partial = sample('monitor')
  partial.queues = null
  partial.collection = {
    state: 'unavailable',
    error_code: 'connection',
    last_success_at_ms: 1800000001000,
    duration_seconds: 0.01,
  }
  partial.runtime.read_available = false
  broker.observation = partial
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('unknown')
  await expect(stat(page, 'queues')).toContainText('unknown')
  await expect(stat(page, 'RPC errors')).toContainText('6')
  await expect(page.getByText('read latency: unknown')).toBeVisible()
  await expect(page.getByText('dead-letter status unknown')).toBeVisible()
  await expect(page.getByText('partial', { exact: true })).toBeVisible()
  broker.observation = sample('monitor')
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(stat(page, 'total')).toContainText('19')
  await expect(page.getByText('available', { exact: true })).toBeVisible()
})

for (const [name, mutate] of Object.entries({
  'missing domains': () => ({}),
  'null queues with available collection': (s: Observation) => ({ ...s, queues: null }),
  'missing runtime flags': (s: Observation) => ({ ...s, runtime: {} }),
  'wrong queue sum': (s: Observation) => ({ ...s, queues: s.queues!.map((q) => ({ ...q, total: 0 })) }),
  'unknown queue kind': (s: Observation) => ({
    ...s,
    queues: s.queues!.map((q) => ({ ...q, kind: 'unrecognized-kind' })),
  }),
  'missing maintenance enabled': (s: Observation) => ({ ...s, maintenance: [{ task: 'locks', runs: 0, failures: 0 }] }),
})) {
  test(`malformed successful observation: ${name} is unknown without legacy fallback`, async ({ page }) => {
    const broker = await setup(page)
    broker.observation = mutate(sample())
    await page.goto('/')
    await expect(
      page.getByText('The broker returned an invalid observation. Availability is unknown.', { exact: false }).first(),
    ).toBeVisible()
    await expect(stat(page, 'total')).toContainText('unknown')
    expect(broker.calls.some((path) => path.endsWith('/Stats') || path.endsWith('/ListQueues'))).toBe(false)
  })
}

for (const status of [403, 500]) {
  test(`HTTP ${status} clears current gauges and never falls back to older APIs`, async ({ page }) => {
    const broker = await setup(page)
    await page.goto('/')
    await expect(stat(page, 'total')).toContainText('19')
    const before = broker.calls.length
    broker.status = status
    broker.observation = { code: status === 403 ? 'permission_denied' : 'internal', message: 'observation unavailable' }
    await page.getByRole('button', { name: 'refresh', exact: true }).click()
    await expect(stat(page, 'total')).toContainText('unknown')
    await expect(stat(page, 'RPC errors')).toContainText('unknown')
    await expect(page.getByText('Last sample is stale; current values are unknown.', { exact: false })).toBeVisible()
    expect(broker.calls.slice(before).every((path) => path.endsWith('/Observe'))).toBe(true)
  })
}

test('legacy fallback exposes incomplete queue collection instead of summing successful subsets', async ({ page }) => {
  const broker = await setup(page)
  broker.legacy = true
  broker.failedQueue = 'orders'
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('unknown')
  await expect(page.getByText('Legacy queue collection is partial or unavailable.', { exact: false })).toBeVisible()
  await expect(page.getByText('dead-letter status unknown')).toBeVisible()
  await page.getByRole('button', { name: 'queues', exact: true }).first().click()
  await expect(page.getByRole('row', { name: /orders/ })).toContainText('unknown')
  await page.getByRole('row', { name: /orders/ }).click()
  await expect(page.getByText('Legacy queue collection is partial or unavailable.', { exact: false })).toBeVisible()
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
})

test('expired observation credential returns to login', async ({ page }) => {
  const broker = await setup(page, 'monitor')
  await page.goto('/')
  await expect(page.getByText('monitor · read only')).toBeVisible()
  broker.status = 401
  broker.observation = { code: 'unauthenticated', message: 'invalid token' }
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'connect', exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('mqlite_token'))).toBeNull()
})

// Every required field in the canonical fixture is checked, including nested rows.
// Unknown additions remain forward compatible, but removing any known measurement
// must fail rather than manufacture an apparently healthy zero.
test('every canonical field is required and histogram/quantity invariants reject malformed data', () => {
  const valid = sample()
  expect(isObservation(valid)).toBe(true)
  function walk(value: unknown, path: (string | number)[] = []) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, index]))
      return
    }
    for (const [key, child] of Object.entries(value)) {
      const copy = structuredClone(valid) as unknown as Record<string, unknown>
      let target: Record<string | number, unknown> = copy
      for (const part of path) target = target[part] as Record<string | number, unknown>
      delete target[key]
      expect(isObservation(copy), `missing ${[...path, key].join('.')}`).toBe(false)
      walk(child, [...path, key])
    }
  }
  walk(valid)
  for (const corrupt of [
    (s: Observation) => {
      s.queue_count = 0
    },
    (s: Observation) => {
      s.messages[0].count = 0.5
    },
    (s: Observation) => {
      s.messages[0].count = Number.MAX_SAFE_INTEGER + 1
    },
    (s: Observation) => {
      s.storage.operations[0].duration.bucket_counts = [3]
    },
    (s: Observation) => {
      s.storage.operations[0].duration.bounds_seconds = []
    },
    (s: Observation) => {
      s.maintenance[0].failures = 5
    },
    (s: Observation) => {
      s.http.handler_latency[0].buckets[0].count = 2
    },
  ]) {
    const copy = sample()
    corrupt(copy)
    expect(isObservation(copy)).toBe(false)
  }
  expect(isObservation({ ...valid, future_domain: { available: true } })).toBe(true)
})

test('a stalled poll expires freshness without overlapping requests', async ({ page }) => {
  await setup(page, 'monitor')
  await page.clock.install()
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('19')
  let calls = 0
  await page.route('**/mqlite.v1.AdminService/Observe', async () => {
    calls++
  })
  await page.clock.fastForward(21000)
  await expect(stat(page, 'total')).toContainText('unknown')
  await expect(page.getByText('The last observation is stale.', { exact: false }).first()).toBeVisible()
  expect(calls).toBe(1)
})

test('malformed legacy queue measurements never become a healthy zero or NaN', async ({ page }) => {
  const broker = await setup(page)
  broker.legacy = true
  await page.route('**/mqlite.v1.QueueService/Stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('unknown')
  await expect(page.locator('main')).not.toContainText('NaN')
  await expect(page.getByText('dead-letter status unknown')).toBeVisible()
})

for (const domain of ['maintenance', 'filters', 'authentication'] as const) {
  for (const mutation of ['empty', 'duplicate', 'missing known label'] as const) {
    test(`missing-data guard: ${domain} ${mutation} is not a healthy zero`, async ({ page }) => {
      const broker = await setup(page)
      const snapshot = sample()
      const rows = domain === 'authentication' ? snapshot.http.authentication : snapshot[domain]
      if (mutation === 'empty') rows.splice(0)
      else if (mutation === 'duplicate') rows.splice(1, 0, rows[0] as never)
      else rows.splice(0, 1)
      broker.observation = snapshot
      await page.goto('/')
      await expect(stat(page, 'total')).toContainText('unknown')
      await expect(
        page.getByText('The broker returned an invalid observation.', { exact: false }).first(),
      ).toBeVisible()
    })
  }
}

test('canonical domain labels stay unique, nonempty and forward compatible', () => {
  const snapshot = sample()
  snapshot.maintenance.push({ ...snapshot.maintenance[0], task: 'future-task' })
  snapshot.filters.push({ stage: 'future-stage', count: 0 })
  snapshot.http.authentication.push({ outcome: 'future-outcome', count: 0 })
  expect(isObservation(snapshot)).toBe(true)
  for (const corrupt of [
    (s: Observation) => {
      s.messages.push(s.messages[0])
    },
    (s: Observation) => {
      s.storage.operations.push(s.storage.operations[0])
    },
    (s: Observation) => {
      s.http.requests.push(s.http.requests[0])
    },
    (s: Observation) => {
      s.http.handler_latency.push(s.http.handler_latency[0])
    },
    (s: Observation) => {
      s.filters[0].stage = ''
    },
    (s: Observation) => {
      s.messages[0].queue = ''
    },
  ]) {
    const copy = sample()
    corrupt(copy)
    expect(isObservation(copy)).toBe(false)
  }
})
