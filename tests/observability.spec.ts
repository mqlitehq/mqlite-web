import { test, expect, type Page } from '@playwright/test'
import { compactSnapshot, isObservation, type Observation } from '../src/lib/observation.js'
import { managedInitialLoadReady } from '../src/lib/observation-context.js'
import { describeBrokerTarget, selectBrokerBaseURL } from '../src/lib/broker-target.js'

function sample(access: Observation['access'] = 'manage'): Observation {
  const snapshot: Observation = {
    version: '0.3.2',
    access,
    backend: 'memory',
    sampled_at_ms: 1800000005000,
    server_time_ms: 1800000006000,
    started_at_ms: 1800000000000,
    runtime: {
      schema_version: '5',
      ping_seconds: 0.001,
      read_available: true,
      db_size_bytes: 0,
      db_size_available: false,
    },
    collection: {
      state: 'available',
      last_success_at_ms: 1800000005000,
      duration_seconds: 0.002,
      error_code: '',
    },
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
          operation: 'read',
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
        {
          rpc: 'QueueService/Stats',
          count: 1,
          sum_seconds: 0.001,
          buckets: [{ upper_bound_seconds: 1, count: 1 }],
        },
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
  for (const queue of ['orders', 'emails']) {
    for (const event of [
      'enqueued',
      'scheduled',
      'deduplicated',
      'dedup_conflict',
      'delivered',
      'redelivered',
      'completed',
      'receive_deleted',
      'abandoned',
      'deferred',
      'rejected',
      'dead_lettered',
      'ttl_discarded',
      'retention_deleted',
      'purged',
      'canceled',
      'redriven',
      'lock_expired',
      'recovered',
      'activated',
    ]) {
      if (!snapshot.messages.some((row) => row.queue === queue && row.event === event))
        snapshot.messages.push({ queue, event, count: 0 })
    }
  }
  for (const operation of ['read', 'write', 'transaction']) {
    const outcomes = [
      ['ok', ''],
      ['rejected', 'application'],
      ['outcome_unknown', 'outcome_unknown'],
      ...['canceled', 'closed', 'busy', 'connection', 'full', 'corrupt', 'io', 'other'].map((code) => [
        'error',
        code,
      ]),
    ]
    for (const [outcome, error_code] of outcomes) {
      if (
        !snapshot.storage.operations.some(
          (r) => r.operation === operation && r.outcome === outcome && r.error_code === error_code,
        )
      )
        snapshot.storage.operations.push({
          operation,
          outcome,
          error_code,
          retries: 0,
          duration: { bounds_seconds: [1], bucket_counts: [0], count: 0, sum_seconds: 0 },
        })
    }
  }
  const services = {
    QueueService: [
      'Send',
      'Receive',
      'Complete',
      'CompleteBatch',
      'RenewBatch',
      'Abandon',
      'Reject',
      'Defer',
      'ReceiveDeferred',
      'Renew',
      'Schedule',
      'Cancel',
      'Peek',
      'Stats',
    ],
    AdminService: [
      'CreateQueue',
      'Subscribe',
      'ListQueues',
      'ListSubscriptions',
      'TestFilter',
      'Redrive',
      'Purge',
      'Status',
      'Observe',
    ],
    AuthService: ['CreateKey', 'ListKeys', 'RevokeKey'],
  }
  for (const [service, methods] of Object.entries(services)) {
    for (const method of methods) {
      const rpc = `${service}/${method}`
      for (const code of [
        'ok',
        'unauthenticated',
        'permission_denied',
        'key_conflict',
        'not_found',
        'already_exists',
        'name_conflict',
        'group_required',
        'invalid_argument',
        'message_too_large',
        'outcome_unknown',
        'canceled',
        'internal',
        'lock_lost',
        'unimplemented',
      ]) {
        if (!snapshot.http.requests.some((r) => r.rpc === rpc && r.code === code))
          snapshot.http.requests.push({ rpc, code, count: 0, duration_seconds: 0 })
      }
    }
  }
  return snapshot
}
interface BrokerFixture {
  observation: unknown
  status: number
  calls: string[]
  legacy: boolean
  failedQueue: string
  queuePresent: boolean
  queueState: 'active' | 'deleting'
}
async function setup(
  page: Page,
  access: Observation['access'] = 'manage',
  loggedIn = true,
): Promise<BrokerFixture> {
  const broker: BrokerFixture = {
    observation: sample(access),
    status: 200,
    calls: [],
    legacy: false,
    failedQueue: '',
    queuePresent: true,
    queueState: 'active',
  }
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
          ...(broker.queuePresent
            ? [{ name: 'orders', kind: 'queue', state: broker.queueState }]
            : []),
          { name: 'emails', kind: 'subscription', state: 'active' },
        ],
      })
    if (path.endsWith('/ListSubscriptionsPage')) {
      if (broker.legacy) return respond({ code: 'not_found', message: 'route missing' }, 404)
      return respond({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: '',
            state: 'active',
            created_at_ms: 1799996406000,
            expires_at_ms: 0,
          },
        ],
        total: 1,
      })
    }
    if (path.endsWith('/ListSubscriptions'))
      return respond({ subscriptions: [{ topic: 'events', name: 'emails', expr: '' }] })
    if (path.endsWith('/Stats')) {
      const queue = route.request().postDataJSON().queue
      if (queue === broker.failedQueue)
        return respond({ code: 'internal', message: 'collection unavailable' }, 500)
      return respond(sample().queues!.find((q) => q.queue === queue))
    }
    if (path.endsWith('/Peek')) return respond({ messages: [] })
    return respond({ code: 'not_found', message: 'no such path' }, 404)
  })
  return broker
}
function stat(page: Page, label: string) {
  return page.locator('main').getByText(label, { exact: true }).filter({ visible: true }).locator('..')
}

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('.000Z', 'Z')
}

async function localStamp(page: Page, ms: number): Promise<string> {
  return page.evaluate((value) => {
    const date = new Date(value)
    const pad = (part: number) => String(part).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }, ms)
}

test('a pending reload cannot finish the initial managed topology gate', () => {
  expect(managedInitialLoadReady('pending', true, true)).toBe(false)
  expect(managedInitialLoadReady('native', true, false)).toBe(false)
  expect(managedInitialLoadReady('native', true, true)).toBe(true)
})

test('broker target labels follow browser origins without exposing endpoint secrets', () => {
  const pageOrigin = 'https://console.example.test'
  expect(selectBrokerBaseURL('https://stored.example', 'https://built.example')).toBe(
    'https://stored.example',
  )
  expect(selectBrokerBaseURL('', 'https://built.example')).toBe('https://built.example')
  expect(selectBrokerBaseURL('')).toBe('')
  expect(describeBrokerTarget('', pageOrigin)).toEqual({ kind: 'same-origin', display: pageOrigin })
  expect(describeBrokerTarget('/broker', pageOrigin)).toEqual({ kind: 'same-origin', display: pageOrigin })
  expect(describeBrokerTarget('https://console.example.test:443/path', pageOrigin)).toEqual({
    kind: 'same-origin',
    display: pageOrigin,
  })

  const remote = describeBrokerTarget(
    'https://alice:secret@broker.example.test:8443/private?token=hidden#fragment',
    pageOrigin,
  )
  expect(remote).toEqual({ kind: 'remote', display: 'https://broker.example.test:8443' })
  expect(JSON.stringify(remote)).not.toMatch(/alice|secret|private|hidden|fragment/)
  expect(describeBrokerTarget('http://console.example.test', pageOrigin).kind).toBe('remote')
  expect(describeBrokerTarget('http://[::1]:6754', 'http://[::1]:5173')).toEqual({
    kind: 'remote',
    display: 'http://[::1]:6754',
  })
  expect(describeBrokerTarget('http://[invalid', pageOrigin)).toEqual({
    kind: 'custom',
    display: 'custom endpoint',
  })
  expect(describeBrokerTarget('data:text/plain,secret', pageOrigin)).toEqual({
    kind: 'custom',
    display: 'custom endpoint',
  })
})

test('message lifecycle help distinguishes claims, renewals, retry backoff, and expiry clocks', async ({
  page,
}) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'docs', exact: true }).click()

  const lifecycle = page
    .getByRole('heading', { name: "A message's life — states & settlement", exact: true })
    .locator('..')
  await expect(lifecycle).toContainText('does not change state, issue a new delivery, or increment the count')
  await expect(lifecycle).toContainText('ordinary Peek-Lock Receive number 10 is a complete final attempt')
  await expect(lifecycle).toContainText('scheduled state as retry backoff')
  await expect(lifecycle).toContainText('does not enforce max_delivery_count')
  await expect(lifecycle).toContainText('lock lease')
  await expect(lifecycle).toContainText('message TTL')
  await expect(lifecycle).toContainText('subscription lifetime')

  const viewport = page.getByLabel("A message's life — states & settlement diagram viewport")
  const dimensions = await viewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.clientWidth).toBeGreaterThan(0)
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const topologyResult of ['success', 'failure'] as const) {
  test(`initial manage view waits for delayed topology ${topologyResult}`, async ({ page }) => {
    const broker = await setup(page)
    let releaseInventory!: () => void
    const inventoryMayFinish = new Promise<void>((resolve) => {
      releaseInventory = resolve
    })
    let inventoryStarted!: () => void
    const inventoryDidStart = new Promise<void>((resolve) => {
      inventoryStarted = resolve
    })
    await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
      inventoryStarted()
      await inventoryMayFinish
      if (topologyResult === 'failure') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"code":"internal","message":"inventory unavailable"}',
        })
        return
      }
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
              created_at_ms: 1,
              expires_at_ms: 0,
            },
          ],
          total: 1,
        }),
      })
    })

    await page.goto('/')
    await inventoryDidStart
    const topicsNav = page.locator('nav').getByRole('button', { name: 'topics', exact: true })
    await expect(topicsNav).toBeVisible()
    await topicsNav.click()
    await expect(page.getByText('loading observation…', { exact: true })).toBeVisible()
    await expect(page.getByText('no topics yet', { exact: false })).toHaveCount(0)
    releaseInventory()

    await expect(page.getByText('loading observation…', { exact: true })).toHaveCount(0)
    if (topologyResult === 'success') {
      await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')
    } else {
      await expect(page.getByText('Administrative topology is unavailable;', { exact: false })).toBeVisible()
      await expect(page.getByText('topic inventory unknown', { exact: true })).toBeVisible()
    }
    expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  })
}

test('canonical queue, anomaly and process measurements share one request and all domains remain inspectable', async ({
  page,
}) => {
  const broker = await setup(page)
  await page.goto('/')
  const system = page.getByLabel('observation status')
  const connection = page.getByLabel('broker connection: remote https://observe.example.test')
  await expect(connection).toBeVisible()
  await expect(connection).toContainText('remote')
  await expect(connection).toContainText('https://observe.example.test')
  await expect(system).toContainText('broker time: 0s ago')
  await expect(system).toContainText('queue sample: 1s ago')
  await expect(page.getByLabel('process observations')).toContainText('Process counters since 6s ago')
  await page.getByRole('button', { name: 'local', exact: true }).click()
  const localBrokerTime = await page.evaluate((ms) => {
    const d = new Date(ms)
    const pad = (value: number) => String(value).padStart(2, '0')
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    )
  }, 1800000006000)
  await expect(system).toContainText(`broker time: ${localBrokerTime}`)
  await page.getByRole('button', { name: 'UTC', exact: true }).click()
  await expect(system).toContainText('broker time: 2027-01-15 08:00:06Z')
  await expect(system).toContainText('queue sample: 2027-01-15 08:00:05Z · 1s old')
  await expect(page.getByLabel('process observations')).toContainText(
    'Process counters since 2027-01-15 08:00:00Z',
  )
  await page.getByRole('button', { name: 'rel', exact: true }).click()
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
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  expect(broker.calls.some((path) => path.endsWith('/Stats') || path.endsWith('/Status'))).toBe(false)
  await page.getByRole('button', { name: 'metrics', exact: true }).click()
  await expect(stat(page, 'total')).toContainText('19')
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
})

test('queue oldest timestamps use the queue snapshot clock in every display mode', async ({ page }) => {
  await page.addInitScript(() => {
    Date.now = () => 1
  })
  await setup(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'queues', exact: true }).click()

  const row = page.getByRole('row').filter({ hasText: 'orders' })
  await expect(row).toContainText('3s ago')
  const oldestAt = sample().sampled_at_ms - 3000

  await page.getByRole('button', { name: 'local', exact: true }).click()
  await expect(row).toContainText(await localStamp(page, oldestAt))
  await page.getByRole('button', { name: 'UTC', exact: true }).click()
  await expect(row).toContainText(utcStamp(oldestAt))

  await row.click()
  const subtitle = page.locator('main h1 + p')
  await expect(subtitle).toContainText(`oldest ${utcStamp(oldestAt)}`)
  await page.getByRole('button', { name: 'rel', exact: true }).click()
  await expect(subtitle).toContainText('oldest 3s ago')
})

test('monitor login, reload and navigation never request administrative or message APIs', async ({
  page,
}) => {
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

test('a manage-to-monitor observation clears management topology without another administrative call', async ({
  page,
}) => {
  const broker = await setup(page)
  await page.goto('/')
  await expect(page.locator('nav').getByRole('button', { name: 'topics', exact: true })).toBeVisible()
  const before = broker.calls.length
  broker.observation = sample('monitor')
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByText('monitor · read only')).toBeVisible()
  await expect(page.locator('nav').getByRole('button', { name: 'topics', exact: true })).toHaveCount(0)
  expect(broker.calls.slice(before)).toEqual(['/mqlite.v1.AdminService/Observe'])
})

test('failed DB collection keeps process counters, shows unknown gauges, and recovers on refresh', async ({
  page,
}) => {
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
  'missing maintenance enabled': (s: Observation) => ({
    ...s,
    maintenance: [{ task: 'locks', runs: 0, failures: 0 }],
  }),
})) {
  test(`malformed successful observation: ${name} is unknown without legacy fallback`, async ({ page }) => {
    const broker = await setup(page)
    broker.observation = mutate(sample())
    await page.goto('/')
    await expect(
      page
        .getByText('The broker returned an invalid observation. Availability is unknown.', { exact: false })
        .first(),
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
    broker.observation = {
      code: status === 403 ? 'permission_denied' : 'internal',
      message: 'observation unavailable',
    }
    await page.getByRole('button', { name: 'refresh', exact: true }).click()
    await expect(stat(page, 'total')).toContainText('unknown')
    await expect(stat(page, 'RPC errors')).toContainText('unknown')
    await expect(
      page.getByText('Last sample is stale; current values are unknown.', { exact: false }),
    ).toBeVisible()
    const refreshCalls = broker.calls.slice(before)
    expect(refreshCalls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
    expect(refreshCalls.filter((path) => path.endsWith('/ListQueues'))).toHaveLength(1)
    expect(refreshCalls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
    expect(refreshCalls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  })
}

test('legacy fallback exposes incomplete queue collection instead of summing successful subsets', async ({
  page,
}) => {
  const broker = await setup(page)
  broker.legacy = true
  broker.failedQueue = 'orders'
  await page.goto('/')
  await expect(stat(page, 'total')).toContainText('unknown')
  await expect(
    page.getByText('Legacy queue collection is partial or unavailable.', { exact: false }),
  ).toBeVisible()
  await expect(page.getByText('dead-letter status unknown')).toBeVisible()
  await page.getByRole('button', { name: 'queues', exact: true }).first().click()
  await expect(page.getByRole('row', { name: /orders/ })).toContainText('unknown')
  await page.getByRole('row', { name: /orders/ }).click()
  await expect(
    page.getByText('Legacy queue collection is partial or unavailable.', { exact: false }),
  ).toBeVisible()
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(1)
})

test('legacy Stats reruns the latest topology after a timer sample already started', async ({ page }) => {
  const broker = await setup(page)
  broker.legacy = true
  await page.clock.install()
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await expect(page.getByRole('row', { name: /orders/ })).toBeVisible()

  await page.route('**/mqlite.v1.AdminService/ListQueues', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queues: [
          { name: 'orders', kind: 'queue', state: 'active' },
          { name: 'billing', kind: 'queue', state: 'active' },
          { name: 'emails', kind: 'subscription', state: 'active' },
        ],
      }),
    }),
  )
  let releaseTimerStats!: () => void
  const timerStatsMayFinish = new Promise<void>((resolve) => {
    releaseTimerStats = resolve
  })
  const statsRequests: string[] = []
  await page.route('**/mqlite.v1.QueueService/Stats', async (route) => {
    const queue = (route.request().postDataJSON() as { queue: string }).queue
    statsRequests.push(queue)
    if (statsRequests.length <= 2) await timerStatsMayFinish
    const total = queue === 'billing' ? 2 : 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queue,
        active: total,
        locked: 0,
        deferred: 0,
        scheduled: 0,
        dead_lettered: 0,
        total,
        oldest_message_age_ms: 0,
      }),
    })
  })

  await page.clock.fastForward(5000)
  await expect.poll(() => statsRequests.length).toBe(2)
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('row', { name: /billing/ })).toBeVisible()
  releaseTimerStats()

  const billing = page.getByRole('row', { name: /billing/ })
  await expect(billing).toContainText('2')
  await expect(billing).not.toContainText('unknown')
  await expect.poll(() => statsRequests.length).toBe(5)
  expect(statsRequests.slice(2).sort()).toEqual(['billing', 'emails', 'orders'])
  await page.locator('nav').getByRole('button', { name: 'overview', exact: true }).click()
  await expect(page.getByLabel('observation status')).toContainText('available')
})

test('slow legacy Stats commits without overlap or starvation across repeated timer ticks', async ({ page }) => {
  const broker = await setup(page)
  broker.legacy = true
  await page.clock.install()
  await page.addInitScript(() => {
    // Keep the fixture request in flight beyond the five-second poll interval;
    // this test exercises coalescing rather than the client's timeout policy.
    AbortSignal.timeout = () => new AbortController().signal
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await expect(page.getByRole('row', { name: /orders/ })).toBeVisible()

  let releaseFirst!: () => void
  const firstRoundMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let releaseSecond!: () => void
  const secondRoundMayFinish = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  let requests = 0
  let inFlight = 0
  let maxInFlight = 0
  await page.route('**/mqlite.v1.QueueService/Stats', async (route) => {
    requests++
    const thisRequest = requests
    const queue = (route.request().postDataJSON() as { queue: string }).queue
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await (thisRequest <= 2 ? firstRoundMayFinish : secondRoundMayFinish)
    inFlight--
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queue,
        active: 7,
        locked: 0,
        deferred: 0,
        scheduled: 0,
        dead_lettered: 0,
        total: 7,
        oldest_message_age_ms: 0,
      }),
    })
  })

  await page.clock.fastForward(5000)
  await expect.poll(() => requests).toBe(2)
  await page.clock.fastForward(5000)
  await page.clock.fastForward(5000)
  await page.clock.fastForward(6000)
  await page.waitForTimeout(25)
  expect(requests, `inFlight=${inFlight} maxInFlight=${maxInFlight}`).toBe(2)
  expect(maxInFlight).toBe(2)
  releaseFirst()
  await expect.poll(() => requests).toBe(4)
  await expect(page.getByRole('row', { name: /orders/ })).toContainText('7')
  expect(maxInFlight).toBe(2)
  await page.locator('nav').getByRole('button', { name: 'overview', exact: true }).click()
  await expect(page.getByLabel('observation status')).toContainText('available')

  releaseSecond()
  await expect.poll(() => inFlight).toBe(0)
  expect(requests).toBe(4)
  expect(maxInFlight).toBe(2)
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
      const optionalBrokerTime = path.length === 0 && key === 'server_time_ms'
      expect(isObservation(copy), `missing ${[...path, key].join('.')}`).toBe(optionalBrokerTime)
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

test('broker time is optional for old brokers, accepts zero as unavailable, and validates timestamps', () => {
  const old = sample()
  delete old.server_time_ms
  expect(isObservation(old)).toBe(true)
  const unavailable = sample()
  unavailable.server_time_ms = 0
  expect(isObservation(unavailable)).toBe(true)
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER, null, '1800000006000']) {
    const snapshot = sample() as unknown as Record<string, unknown>
    snapshot.server_time_ms = invalid
    expect(isObservation(snapshot), `accepted server_time_ms=${String(invalid)}`).toBe(false)
  }
})

test('old broker observation shows unavailable broker time without requesting Status', async ({ page }) => {
  const broker = await setup(page, 'monitor')
  const old = sample('monitor')
  delete old.server_time_ms
  broker.observation = old
  await page.goto('/')
  await expect(page.getByLabel('observation status')).toContainText('broker time: unavailable')
  expect(broker.calls.some((path) => path.endsWith('/Status'))).toBe(false)
})

test('an explicit zero broker time is displayed as unavailable without requesting Status', async ({ page }) => {
  const broker = await setup(page, 'monitor')
  const unavailable = sample('monitor')
  unavailable.server_time_ms = 0
  broker.observation = unavailable
  await page.goto('/')
  await expect(page.getByLabel('observation status')).toContainText('broker time: unavailable')
  expect(broker.calls.some((path) => path.endsWith('/Status'))).toBe(false)
})

test('topics group lifecycle rows and use broker time without per-subscription requests', async ({ page }) => {
  const broker = await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Date.now = () => 1
  })
  const serverTime = 1800000006000
  const expiringAt = serverTime + 30 * 60 * 1000
  const expiredAt = serverTime - 1000
  const lifecycleRequests: Record<string, unknown>[] = []
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    lifecycleRequests.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'zulu',
            name: 'cleanup',
            expr: '',
            state: 'deleting',
            created_at_ms: serverTime - 3_600_000,
            expires_at_ms: expiredAt,
          },
          {
            topic: 'alpha',
            name: 'reply',
            expr: 'subject == "reply"',
            state: 'active',
            created_at_ms: serverTime - 3_600_000,
            expires_at_ms: expiringAt,
          },
          {
            topic: 'alpha',
            name: 'durable',
            expr: '',
            state: 'active',
            created_at_ms: serverTime - 3_600_000,
            expires_at_ms: 0,
          },
        ],
        total: 3,
      }),
    })
  })
  await page.route('**/mqlite.v1.QueueService/Send', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"seq_numbers":[1]}' }),
  )
  let subscriptionsCreated = 0
  await page.route('**/mqlite.v1.AdminService/Subscribe', async (route) => {
    subscriptionsCreated++
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await expect.poll(() => lifecycleRequests.length).toBe(1)
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByText('2 topics · 3 subscriptions', { exact: false })).toBeVisible()
  await expect(page.getByText('alpha', { exact: true }).locator('..')).toContainText('2 sub')
  await expect(page.getByText('zulu', { exact: true }).locator('..')).toContainText('1 sub')
  await expect(page.getByLabel('subscription lifecycle durable')).toHaveText('permanent')
  const replyLifecycle = page.getByLabel('subscription lifecycle reply')
  await expect(replyLifecycle).toHaveText('expiring soon · 30m left')
  await expect(page.getByLabel('subscription lifecycle cleanup')).toHaveText(
    'expired · 1s ago · deleting',
  )
  await page.getByRole('button', { name: 'local', exact: true }).click()
  await expect(replyLifecycle).toHaveText(`expiring soon · expires ${await localStamp(page, expiringAt)}`)
  await page.getByRole('button', { name: 'UTC', exact: true }).click()
  await expect(replyLifecycle).toHaveText(`expiring soon · expires ${utcStamp(expiringAt)}`)
  await page.getByRole('button', { name: 'rel', exact: true }).click()
  await expect(replyLifecycle).toHaveText('expiring soon · 30m left')
  expect(lifecycleRequests).toHaveLength(1)
  await expect(page.getByLabel('broker connection: remote https://observe.example.test')).toBeVisible()
  const zulu = page.getByText('zulu', { exact: true }).locator('../../..')
  await expect(zulu.getByRole('button', { name: 'publish', exact: true })).toBeDisabled()
  await expect(zulu).toContainText('publishing unavailable · all subscriptions are deleting or expired')
  expect(lifecycleRequests).toEqual([{ limit: 1000, include_deleting: true }])
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  expect(broker.calls.some((path) => path.endsWith('/Status'))).toBe(false)
  const alphaPosition = await page.getByText('alpha', { exact: true }).boundingBox()
  const zuluPosition = await page.getByText('zulu', { exact: true }).boundingBox()
  const durablePosition = await page.getByLabel('subscription lifecycle durable').boundingBox()
  const replyPosition = await page.getByLabel('subscription lifecycle reply').boundingBox()
  expect(alphaPosition!.y).toBeLessThan(zuluPosition!.y)
  expect(durablePosition!.y).toBeLessThan(replyPosition!.y)

  const alpha = page.getByText('alpha', { exact: true }).locator('../../..')
  await alpha.getByRole('button', { name: 'publish', exact: true }).click()
  await page.getByRole('button', { name: 'publish to alpha', exact: true }).click()
  await expect(page.getByText('published — routed to matching subscription(s)', { exact: false })).toBeVisible()
  expect(lifecycleRequests).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect.poll(() => lifecycleRequests.length).toBe(2)
  await page.getByRole('button', { name: '+ subscription', exact: true }).click()
  await page.getByPlaceholder('events').fill('beta')
  await page.getByPlaceholder('eu-orders').fill('new-sub')
  await page.getByRole('button', { name: 'create subscription', exact: true }).click()
  await expect.poll(() => subscriptionsCreated).toBe(1)
  await expect.poll(() => lifecycleRequests.length).toBe(3)
})

test('a topic stops offering publish when broker time crosses its last subscription deadline', async ({ page }) => {
  const broker = await setup(page)
  await page.clock.install()
  const expiresAt = 1800000066000
  const before = sample()
  before.server_time_ms = expiresAt - 60_000
  broker.observation = before
  let inventoryRequests = 0
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    inventoryRequests++
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
            created_at_ms: 1,
            expires_at_ms: expiresAt,
          },
        ],
        total: 1,
      }),
    })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  const topic = page.getByText('events', { exact: true }).locator('../../..')
  const publish = topic.getByRole('button', { name: 'publish', exact: true })
  await expect(publish).toBeEnabled()
  await publish.click()
  await expect(page.getByRole('button', { name: 'publish to events', exact: true })).toBeVisible()

  const expired = sample()
  expired.server_time_ms = expiresAt
  broker.observation = expired
  await page.clock.fastForward(5000)
  await expect(publish).toBeDisabled()
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('expired · now')
  await expect(topic).toContainText('publishing unavailable · all subscriptions are deleting or expired')
  await expect(page.getByRole('button', { name: 'publish to events', exact: true })).toHaveCount(0)
  expect(inventoryRequests).toBe(1)
})

test('topics lifecycle pagination is manual while broker clock updates the existing rows', async ({ page }) => {
  const broker = await setup(page)
  await page.clock.install()
  const expiresAt = 1800000066000
  const lifecycleRequests: Record<string, unknown>[] = []
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    topic: 'bulk',
    name: `worker-${String(index).padStart(4, '0')}`,
    expr: '',
    state: 'active',
    created_at_ms: 1800000000000,
    expires_at_ms: index === 0 ? expiresAt : 0,
  }))
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    lifecycleRequests.push(request)
    const body = request.after
      ? {
          subscriptions: [
            {
              topic: 'bulk',
              name: 'worker-1000',
              expr: '',
              state: 'active',
              created_at_ms: 1800000000000,
              expires_at_ms: 0,
            },
          ],
          total: 1001,
        }
      : { subscriptions: firstPage, total: 1001, next_after: 'bulk-next' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByText('1 topic · 1001 subscriptions', { exact: false })).toBeVisible()
  await expect(page.getByText('bulk', { exact: true }).locator('..')).toContainText('1001 sub')
  await expect(page.getByLabel('subscription lifecycle worker-0000')).toContainText('1m left')
  expect(lifecycleRequests).toEqual([
    { limit: 1000, include_deleting: true },
    { after: 'bulk-next', limit: 1000, include_deleting: true },
  ])

  const expired = sample()
  expired.server_time_ms = expiresAt
  broker.observation = expired
  const callsBefore = broker.calls.length
  await page.clock.fastForward(15_000)
  await expect(page.getByLabel('subscription lifecycle worker-0000')).toContainText('expired')
  expect(lifecycleRequests).toHaveLength(2)
  const timerCalls = broker.calls.slice(callsBefore)
  expect(timerCalls.length).toBeGreaterThan(0)
  expect(timerCalls.every((path) => path.endsWith('/Observe'))).toBe(true)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)

  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect.poll(() => lifecycleRequests.length).toBe(4)
  expect(lifecycleRequests.slice(2)).toEqual([
    { limit: 1000, include_deleting: true },
    { after: 'bulk-next', limit: 1000, include_deleting: true },
  ])
})

test('topics fall back once to legacy rows when lifecycle inventory is unsupported', async ({ page }) => {
  const broker = await setup(page)
  broker.legacy = true
  await page.clock.install()
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByRole('button', { name: /emails/ })).toBeVisible()
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('lifecycle unavailable')
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(1)
  await page.clock.fastForward(10_000)
  await expect(page.getByRole('button', { name: /emails/ })).toBeVisible()
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(1)
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect.poll(() => broker.calls.filter((path) => path.endsWith('/ListSubscriptions')).length).toBe(2)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptionsPage'))).toHaveLength(1)
})

test('a newer topics lifecycle refresh wins over an older in-flight inventory', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')

  let observationRequests = 0
  let releaseSecondObservation!: () => void
  const secondObservationMayFinish = new Promise<void>((resolve) => {
    releaseSecondObservation = resolve
  })
  let secondObservationDidFinish!: () => void
  const secondObservationFinished = new Promise<void>((resolve) => {
    secondObservationDidFinish = resolve
  })
  await page.route('**/mqlite.v1.AdminService/Observe', async (route) => {
    observationRequests++
    if (observationRequests === 2) await secondObservationMayFinish
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sample()),
    })
    if (observationRequests === 2) secondObservationDidFinish()
  })

  let requests = 0
  let releaseFirst!: () => void
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    requests++
    const thisRequest = requests
    if (thisRequest === 1) await firstMayFinish
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
            created_at_ms: 1,
            expires_at_ms: thisRequest === 1 ? 1800007206000 : 0,
          },
        ],
        total: 1,
      }),
    })
  })

  const refresh = page.getByRole('button', { name: 'refresh', exact: true })
  await refresh.click()
  await expect.poll(() => requests).toBe(1)
  await refresh.click()
  await expect.poll(() => observationRequests).toBe(2)
  await refresh.click()
  releaseSecondObservation()
  await secondObservationFinished
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(requests).toBe(1)
  releaseFirst()
  await expect.poll(() => requests).toBe(2)
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')
  expect(requests).toBe(2)
})

for (const failure of ['server error', 'invalid response', 'cross-topic duplicate name'] as const) {
  test(`a ${failure} never falls back and retains the last successful lifecycle inventory`, async ({ page }) => {
    const broker = await setup(page)
    await page.goto('/')
    await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
    await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')

    let failedRequests = 0
    await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
      failedRequests++
      if (failure === 'server error') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: '{"code":"internal","message":"inventory unavailable"}',
        })
        return
      }
      const body =
        failure === 'invalid response'
          ? { subscriptions: [{ topic: 'events', name: 'broken' }], total: 1 }
          : {
              subscriptions: [
                { topic: 'alpha', name: 'shared', expr: '', state: 'active', created_at_ms: 1, expires_at_ms: 0 },
                { topic: 'beta', name: 'shared', expr: '', state: 'active', created_at_ms: 1, expires_at_ms: 0 },
              ],
              total: 2,
            }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })

    await page.getByRole('button', { name: 'refresh', exact: true }).click()
    await expect(page.getByText('Administrative topology is unavailable;', { exact: false })).toBeVisible()
    await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')
    expect(failedRequests).toBe(1)
    expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  })
}

for (const malformed of ['repeated cursor', 'cross-page duplicate'] as const) {
  test(`global lifecycle inventory rejects a ${malformed} and retains the prior topology`, async ({ page }) => {
    const broker = await setup(page)
    await page.goto('/')
    await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
    await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')

    let requests = 0
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      topic: 'bulk',
      name: `first-${String(index).padStart(4, '0')}`,
      expr: '',
      state: 'active',
      created_at_ms: 1,
      expires_at_ms: 0,
    }))
    const secondPage = Array.from({ length: 1000 }, (_, index) => ({
      topic: 'bulk',
      name: `second-${String(index).padStart(4, '0')}`,
      expr: '',
      state: 'active',
      created_at_ms: 1,
      expires_at_ms: 0,
    }))
    await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
      requests++
      const after = (route.request().postDataJSON() as Record<string, unknown>).after
      const body = !after
        ? { subscriptions: firstPage, total: 2000, next_after: 'same-cursor' }
        : malformed === 'repeated cursor'
          ? { subscriptions: secondPage, total: 2000, next_after: 'same-cursor' }
          : { subscriptions: [{ ...firstPage[999], topic: 'other-topic' }], total: 1001 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })

    await page.getByRole('button', { name: 'refresh', exact: true }).click()
    await expect(page.getByText('Administrative topology is unavailable;', { exact: false })).toBeVisible()
    await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')
    expect(requests).toBe(2)
    expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
  })
}

test('global lifecycle inventory rejects a cursor after exhausting the first-page scan budget', async ({ page }) => {
  const broker = await setup(page)
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')

  let requests = 0
  const fullBudget = Array.from({ length: 1000 }, (_, index) => ({
    topic: 'churn',
    name: `worker-${String(index).padStart(4, '0')}`,
    expr: '',
    state: 'active',
    created_at_ms: 1,
    expires_at_ms: 0,
  }))
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    requests++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ subscriptions: fullBudget, total: 1000, next_after: `cursor-${requests}` }),
    })
  })

  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByText('Administrative topology is unavailable;', { exact: false })).toBeVisible()
  await expect(page.getByLabel('subscription lifecycle emails')).toHaveText('permanent')
  expect(requests).toBe(1)
  expect(broker.calls.filter((path) => path.endsWith('/ListSubscriptions'))).toHaveLength(0)
})

test('topics use broker time for remaining life and mark stale or zero clock samples explicitly', async ({ page }) => {
  const broker = await setup(page)
  const expiresAt = 1800003606000
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: '',
            state: 'active',
            created_at_ms: 1,
            expires_at_ms: expiresAt,
          },
        ],
        total: 1,
      }),
    }),
  )

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await expect(page.getByLabel('subscription lifecycle emails')).toContainText('1h left')
  broker.status = 500
  broker.observation = { code: 'internal', message: 'observation unavailable' }
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByLabel('subscription lifecycle emails')).toContainText('stale broker sample')

  const zeroClock = sample()
  zeroClock.server_time_ms = 0
  broker.status = 200
  broker.observation = zeroClock
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByLabel('subscription lifecycle emails')).toContainText('remaining unavailable')
  await expect(page.getByLabel('subscription lifecycle emails')).not.toContainText('stale broker sample')
  expect(broker.calls.some((path) => path.endsWith('/Status'))).toBe(false)
})

test('subscription detail uses a paged lifecycle row and broker time despite browser clock skew', async ({ page }) => {
  const broker = await setup(page)
  await page.addInitScript(() => {
    Date.now = () => 1
  })
  const requests: Record<string, unknown>[] = []
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    topic: 'events',
    name: `archive-${String(index).padStart(4, '0')}`,
    expr: '',
    state: 'active',
    created_at_ms: 1,
    expires_at_ms: 0,
  }))
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    requests.push(request)
    const email = {
      topic: 'events',
      name: 'emails',
      expr: 'subject == "receipt"',
      state: 'active',
      created_at_ms: 1799996406000,
      expires_at_ms: 1800007206000,
    }
    const body = !request.topic
      ? { subscriptions: [email], total: 1 }
      : request.after
        ? { subscriptions: [email], total: 1001 }
        : { subscriptions: firstPage, total: 1001, next_after: 'opaque-next' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  const lifecycle = page.getByLabel('subscription lifecycle')
  const created = lifecycle.getByText('created', { exact: true }).locator('..')
  const expires = lifecycle.getByText('expires', { exact: true }).locator('..')
  await expect(created).toContainText('1h ago')
  await expect(expires).toContainText('2h left')
  await page.getByRole('button', { name: 'local', exact: true }).click()
  await expect(created).toContainText(await localStamp(page, 1799996406000))
  await expect(expires).toContainText(await localStamp(page, 1800007206000))
  await page.getByRole('button', { name: 'UTC', exact: true }).click()
  await expect(created).toContainText(utcStamp(1799996406000))
  await expect(expires).toContainText(utcStamp(1800007206000))
  await page.getByRole('button', { name: 'rel', exact: true }).click()
  await expect(expires).toContainText('2h left')
  await expect(page.getByText('subject == "receipt"', { exact: true })).toBeVisible()
  expect(requests.filter((request) => request.topic === undefined)).toEqual([
    { limit: 1000, include_deleting: true },
  ])
  expect(requests.filter((request) => request.topic === 'events')).toEqual([
    { topic: 'events', limit: 1000, include_deleting: true },
    { topic: 'events', after: 'opaque-next', limit: 1000, include_deleting: true },
  ])
  expect(broker.calls.some((path) => path.endsWith('/Status'))).toBe(false)
})

test('a broker observation crossing the fixed deadline blocks subscription actions without rescanning lifecycle', async ({
  page,
}) => {
  const broker = await setup(page)
  await page.clock.install()
  const expiresAt = 1800000066000
  const before = sample()
  before.server_time_ms = expiresAt - 60_000
  broker.observation = before
  let globalScans = 0
  let exactScans = 0
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (request.topic) exactScans++
    else globalScans++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: 'subject == "saved"',
            state: 'active',
            created_at_ms: 1800000000000,
            expires_at_ms: expiresAt,
          },
        ],
        total: 1,
      }),
    })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByLabel('subscription lifecycle')).toContainText('1m')
  await expect(page.getByRole('button', { name: '+ publish', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'edit filter', exact: true }).click()
  await page
    .getByPlaceholder('properties["tier"] == "gold" && body_json.amount > 100')
    .fill('subject == "draft"')
  expect(globalScans).toBe(1)
  expect(exactScans).toBe(1)

  const after = sample()
  after.server_time_ms = expiresAt
  broker.observation = after
  await page.clock.fastForward(5000)
  await expect(page.getByRole('heading').getByText('expired', { exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Subscription actions are blocked')
  await expect(page.getByRole('button', { name: '+ publish', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'delete subscription', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'edit filter', exact: true })).toHaveCount(0)
  await expect(page.getByText('subject == "saved"', { exact: true })).toBeVisible()
  await expect(page.getByText('subject == "draft"', { exact: true })).toHaveCount(0)
  expect(globalScans).toBe(1)
  expect(exactScans).toBe(1)
})

test('publishing refreshes message data without rescanning subscription lifecycle', async ({ page }) => {
  const broker = await setup(page)
  let globalScans = 0
  let exactScans = 0
  let sends = 0
  let receives = 0
  let completes = 0
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (request.topic) exactScans++
    else globalScans++
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
            created_at_ms: 1,
            expires_at_ms: 0,
          },
        ],
        total: 1,
      }),
    })
  })
  await page.route('**/mqlite.v1.QueueService/Send', async (route) => {
    sends++
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"seq_numbers":[1]}' })
  })
  await page.route('**/mqlite.v1.QueueService/Receive', async (route) => {
    receives++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          { seq_number: 1, state: 'locked', body: 'aGk=', lock_token: 'lock-1', delivery_count: 1 },
        ],
      }),
    })
  })
  await page.route('**/mqlite.v1.QueueService/Complete', async (route) => {
    completes++
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByLabel('subscription lifecycle')).toContainText('permanent')
  expect(globalScans).toBe(1)
  expect(exactScans).toBe(1)
  const observationsBefore = broker.calls.filter((path) => path.endsWith('/Observe')).length
  await page.getByRole('button', { name: '+ publish', exact: true }).click()
  await page.getByRole('button', { name: 'publish to events', exact: true }).click()
  await expect(page.getByText('published — routed to matching subscription(s)', { exact: false })).toBeVisible()
  await expect.poll(() => sends).toBe(1)
  await expect
    .poll(() => broker.calls.filter((path) => path.endsWith('/Observe')).length)
    .toBeGreaterThan(observationsBefore)
  expect(globalScans).toBe(1)
  expect(exactScans).toBe(1)

  const observationsBeforeSettle = broker.calls.filter((path) => path.endsWith('/Observe')).length
  await page.getByRole('button', { name: 'receive', exact: true }).click()
  await page.getByRole('button', { name: 'receive next (peek-lock)', exact: true }).click()
  await expect.poll(() => receives).toBe(1)
  await expect(page.getByRole('button', { name: 'abandon — retry / DLQ at limit', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'complete', exact: true }).click()
  await expect(page.getByText('completed seq 1', { exact: false })).toBeVisible()
  expect(completes).toBe(1)
  await expect
    .poll(() => broker.calls.filter((path) => path.endsWith('/Observe')).length)
    .toBeGreaterThan(observationsBeforeSettle)
  expect(globalScans).toBe(1)
  expect(exactScans).toBe(1)
})

test('a saved filter refreshes global topology without repeating the exact lifecycle lookup', async ({ page }) => {
  const broker = await setup(page)
  let globalScans = 0
  let exactScans = 0
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (request.topic) exactScans++
    else globalScans++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: 'subject == "original"',
            state: 'active',
            created_at_ms: 1,
            expires_at_ms: 0,
          },
        ],
        total: 1,
      }),
    })
  })
  await page.route('**/mqlite.v1.AdminService/TestFilter', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"valid":true,"ran":false,"matched":false}',
    })
  })
  await page.route('**/mqlite.v1.AdminService/Subscribe', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect(page.getByText('subject == "original"', { exact: true })).toBeVisible()
  const observationsBefore = broker.calls.filter((path) => path.endsWith('/Observe')).length
  await page.getByRole('button', { name: 'edit filter', exact: true }).click()
  const editor = page.getByPlaceholder('properties["tier"] == "gold" && body_json.amount > 100')
  await editor.fill('subject == "saved"')
  await page.getByRole('button', { name: 'update filter', exact: true }).click()
  await expect(page.getByText('subject == "saved"', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'edit filter', exact: true }).click()
  await editor.fill('subject == "unsaved"')
  await page.getByRole('button', { name: 'cancel', exact: true }).click()
  await expect(page.getByText('subject == "saved"', { exact: true })).toBeVisible()
  await expect(page.getByText('subject == "unsaved"', { exact: true })).toHaveCount(0)
  expect(globalScans).toBe(2)
  expect(exactScans).toBe(1)
  expect(broker.calls.filter((path) => path.endsWith('/Observe'))).toHaveLength(observationsBefore)
})

test('a newer manual lifecycle refresh wins over an older in-flight lookup', async ({ page }) => {
  const broker = await setup(page)
  let globalRequests = 0
  let exactRequests = 0
  let releaseFirst!: () => void
  const firstMayFinish = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let firstDidFinish!: () => void
  const firstFinished = new Promise<void>((resolve) => {
    firstDidFinish = resolve
  })
  await page.route('**/mqlite.v1.AdminService/ListSubscriptionsPage', async (route) => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    if (!request.topic) {
      globalRequests++
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
              created_at_ms: 1,
              expires_at_ms: 0,
            },
          ],
          total: 1,
        }),
      })
      return
    }
    exactRequests++
    const thisRequest = exactRequests
    if (thisRequest === 1) await firstMayFinish
    const newer = thisRequest > 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscriptions: [
          {
            topic: 'events',
            name: 'emails',
            expr: newer ? 'subject == "new"' : 'subject == "old"',
            state: 'active',
            created_at_ms: newer ? 2000 : 1000,
            expires_at_ms: 0,
          },
        ],
        total: 1,
      }),
    })
    if (thisRequest === 1) firstDidFinish()
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'topics', exact: true }).click()
  await page.getByRole('button', { name: /emails/ }).click()
  await expect.poll(() => exactRequests).toBe(1)
  await expect(page.getByLabel('subscription lifecycle')).toContainText('loading…')
  await expect(page.getByRole('button', { name: '+ publish', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'delete subscription', exact: true })).toHaveCount(0)
  expect(broker.calls.filter((path) => path.endsWith('/Peek'))).toHaveLength(0)

  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByText('subject == "new"', { exact: true })).toBeVisible()
  await expect.poll(() => broker.calls.filter((path) => path.endsWith('/Peek')).length).toBe(1)
  releaseFirst()
  await firstFinished
  // The response is delivered; one animation frame lets the fetch continuation
  // and React update queue run without relying on an arbitrary wall-clock delay.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  expect(exactRequests).toBe(2)
  await expect(page.getByText('subject == "new"', { exact: true })).toBeVisible()
  await expect(page.getByText('subject == "old"', { exact: true })).toHaveCount(0)
  expect(broker.calls.filter((path) => path.endsWith('/Peek'))).toHaveLength(1)
  expect(globalRequests).toBe(2)
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
  snapshot.messages.push({ queue: 'orders', event: 'future-event', count: 0 })
  snapshot.storage.operations.push({ ...snapshot.storage.operations[0], operation: 'future-operation' })
  snapshot.http.requests.push({
    rpc: 'FutureService/Read',
    code: 'future-code',
    count: 0,
    duration_seconds: 0,
  })
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

test('retired message counters retain their complete event domain', () => {
  const valid = sample()
  const retired = valid.messages
    .filter((row) => row.queue === 'orders')
    .map((row) => ({ ...row, queue: '' }))
  valid.messages.push(...retired)
  expect(isObservation(valid)).toBe(true)

  for (const index of retired.keys()) {
    const partial = structuredClone(valid)
    partial.messages.splice(valid.messages.length - retired.length + index, 1)
    expect(isObservation(partial)).toBe(false)
  }

  const duplicate = structuredClone(valid)
  duplicate.messages.push(retired[0])
  expect(isObservation(duplicate)).toBe(false)

  const emptyEvent = structuredClone(valid)
  emptyEvent.messages[valid.messages.length - retired.length].event = ''
  expect(isObservation(emptyEvent)).toBe(false)
})

test('login accepts a complete retired message aggregate', async ({ page }) => {
  const broker = await setup(page, 'manage', false)
  const snapshot = sample()
  snapshot.messages.push(
    ...snapshot.messages
      .filter((row) => row.queue === 'orders')
      .map((row) => ({ ...row, queue: '' })),
  )
  broker.observation = snapshot

  await page.goto('/')
  await page.locator('input[type=password]').fill('fixture-manage')
  await page.getByRole('button', { name: 'connect', exact: true }).click()

  await expect(page.getByRole('button', { name: 'sign out', exact: false })).toBeVisible()
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await expect(stat(page, 'total')).toContainText('19')
  expect(broker.calls.some((path) => path.endsWith('/Observe'))).toBe(true)
})

test('every required counter row is present before zero can be interpreted', () => {
  const valid = sample()
  expect(valid.storage.operations).toHaveLength(33)
  expect(valid.http.requests).toHaveLength(390)
  expect(valid.messages).toHaveLength(40)
  const domains = (s: Observation) => [
    s.storage.operations,
    s.http.requests,
    s.messages,
    s.maintenance,
    s.filters,
    s.http.authentication,
  ]
  for (const [domain, rows] of domains(valid).entries()) {
    for (const index of rows.keys()) {
      const copy = structuredClone(valid)
      domains(copy)[domain].splice(index, 1)
      expect(isObservation(copy), `missing domain ${domain} row ${index}`).toBe(false)
    }
  }
  const withoutEvents = sample()
  withoutEvents.messages = withoutEvents.messages.filter((r) => r.queue !== 'emails')
  expect(isObservation(withoutEvents)).toBe(false)
  const empty = sample('embedded')
  empty.queues = []
  empty.queue_count = 0
  empty.subscription_count = 0
  empty.messages = []
  empty.http = { state: 'not_applicable', requests: [], authentication: [], handler_latency: [] }
  expect(isObservation(empty)).toBe(true)
  empty.http.requests.push(valid.http.requests[0])
  expect(isObservation(empty)).toBe(false)
  const partial = sample()
  partial.queues = null
  partial.collection.state = 'unavailable'
  partial.collection.error_code = 'connection'
  expect(isObservation(partial)).toBe(true)
  partial.messages.splice(0, 1)
  expect(isObservation(partial)).toBe(false)
})

for (const domain of ['storage', 'requests', 'messages'] as const) {
  test(`empty ${domain} counters show unknown instead of a healthy zero`, async ({ page }) => {
    const broker = await setup(page)
    const snapshot = sample()
    if (domain === 'storage') snapshot.storage.operations = []
    else if (domain === 'requests') snapshot.http.requests = []
    else snapshot.messages = []
    broker.observation = snapshot
    await page.goto('/')
    await expect(stat(page, 'total')).toContainText('unknown')
    await expect(page.getByText('Process counters are unknown.')).toBeVisible()
    expect(broker.calls.some((path) => path.endsWith('/Stats'))).toBe(false)
  })
}

test('application rejections do not count as storage failures; errors and unknown outcomes do', async ({
  page,
}) => {
  const broker = await setup(page)
  const snapshot = sample()
  for (const row of snapshot.storage.operations) {
    const count = row.outcome === 'rejected' ? 7 : 0
    row.duration = { bounds_seconds: [1], bucket_counts: [count], count, sum_seconds: count / 100 }
  }
  broker.observation = snapshot
  await page.goto('/')
  await expect(stat(page, 'storage errors')).toContainText('0')
  snapshot.storage.operations.find((r) => r.operation === 'read' && r.error_code === 'connection')!.duration =
    {
      bounds_seconds: [1],
      bucket_counts: [2],
      count: 2,
      sum_seconds: 0.02,
    }
  snapshot.storage.operations.find(
    (r) => r.operation === 'write' && r.outcome === 'outcome_unknown',
  )!.duration = {
    bounds_seconds: [1],
    bucket_counts: [3],
    count: 3,
    sum_seconds: 0.03,
  }
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(stat(page, 'storage errors')).toContainText('5')
})

test('historical failures show available diagnostics without inventing a cause or current outage', async ({
  page,
}) => {
  const broker = await setup(page)
  const snapshot = sample()
  snapshot.storage.operations.find((row) => row.error_code === 'connection')!.duration.count = 0
  snapshot.storage.operations.find((row) => row.error_code === 'connection')!.duration.bucket_counts = [0]
  const other = snapshot.storage.operations.find(
    (row) => row.operation === 'read' && row.error_code === 'other',
  )!
  other.duration.count = 6
  other.duration.bucket_counts = [6]
  broker.observation = snapshot
  await page.goto('/')
  await expect(page.getByText('Error counts are historical totals', { exact: false })).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'maintenance tasks' }).getByRole('row', { name: /^locks/ }),
  ).toContainText('4')
  await expect(page.getByRole('table', { name: 'storage error details' })).toContainText(
    'Unclassified database/provider error',
  )
  await expect(page.getByRole('table', { name: 'RPC error details' })).toContainText('permission_denied')
  await expect(
    page.getByText('no failure timestamps or per-task error reasons', { exact: false }),
  ).toBeVisible()
  await page.getByText('canonical snapshot · all domains', { exact: true }).click()
  const pre = page.locator('pre[aria-label="canonical snapshot JSON"]')
  expect(JSON.parse(await pre.innerText())).toEqual(snapshot)
  expect((await pre.innerText()).split('\n').length).toBeLessThan(
    JSON.stringify(snapshot, null, 2).split('\n').length / 2,
  )
  await page.getByLabel('domain', { exact: true }).selectOption('maintenance')
  expect(JSON.parse(await pre.innerText())).toEqual(snapshot.maintenance)
  await page.getByLabel('domain', { exact: true }).selectOption('storage')
  expect(JSON.parse(await pre.innerText())).toEqual(snapshot.storage)
  broker.status = 500
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('table', { name: 'storage error details' })).toContainText('unknown')
  await expect(page.getByText('recorded error details · stale', { exact: true })).toBeVisible()
})

test('compact snapshot preserves arrays, nested objects and escaped text', () => {
  const value = { ...sample(), note: 'line 1\nline 2 "quoted"', empty: [], nil: null }
  expect(JSON.parse(compactSnapshot(value))).toEqual(value)
})

function diagnosticSample(): Observation {
  const snapshot = sample()
  const error = {
    at_ms: 1800000003000,
    category: 'provider_unavailable',
    message: 'Database provider returned HTTP 503 (Service Unavailable).',
    fingerprint: '0123456789abcdef01234567',
    http_status: 503,
    sqlite_code: 0,
  }
  snapshot.maintenance[0].diagnostics = {
    last_outcome: 'failed',
    last_run_at_ms: error.at_ms,
    consecutive_failures: 1,
    recovered_at_ms: 0,
    recent_failures: [{ stage: 'reclaim_locks', error }],
  }
  snapshot.storage.operations.find((row) => row.error_code === 'connection')!.last_error = error
  return snapshot
}

test('diagnostics identify the failed step and recovery while retaining historical counts', async ({
  page,
}) => {
  const broker = await setup(page)
  const snapshot = diagnosticSample()
  broker.observation = snapshot
  await page.goto('/')
  const task = page.getByRole('table', { name: 'maintenance tasks' }).getByRole('row', { name: /^locks/ })
  await expect(task).toContainText('failed · 1 consecutive')
  await expect(page.getByLabel('maintenance failure history')).toContainText('locks / reclaim_locks')
  await expect(page.getByLabel('maintenance failure history')).toContainText('HTTP 503')
  await expect(page.getByLabel('maintenance failure history')).toContainText('0123456789abcdef01234567')
  await expect(page.getByRole('table', { name: 'storage error details' })).toContainText(
    'provider_unavailable',
  )
  snapshot.maintenance[0].diagnostics!.last_outcome = 'ok'
  snapshot.maintenance[0].diagnostics!.consecutive_failures = 0
  snapshot.maintenance[0].diagnostics!.recovered_at_ms = snapshot.sampled_at_ms
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(task).toContainText('recovered')
  await expect(stat(page, 'maintenance failures')).toContainText('1')
  await expect(page.getByLabel('maintenance failure history')).toContainText('HTTP 503')
  broker.status = 500
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(task).toContainText('unknown · stale')
  await expect(task).not.toContainText('recovered')
})

test('diagnostics remain optional for old brokers but validate all present fields', () => {
  expect(isObservation(sample())).toBe(true)
  const valid = diagnosticSample()
  expect(isObservation(valid)).toBe(true)
  const objects = (s: Observation) => [
    s.maintenance[0].diagnostics!,
    s.maintenance[0].diagnostics!.recent_failures[0],
    s.maintenance[0].diagnostics!.recent_failures[0].error,
    s.storage.operations.find((row) => row.last_error)!.last_error!,
  ]
  for (const [index, object] of objects(valid).entries()) {
    for (const key of Object.keys(object)) {
      const invalid = diagnosticSample()
      delete (objects(invalid)[index] as unknown as Record<string, unknown>)[key]
      expect(isObservation(invalid), `missing diagnostic ${index}.${key}`).toBe(false)
    }
  }
  for (const mutate of [
    (s: Observation) => {
      s.maintenance[0].diagnostics = null as never
    },
    (s: Observation) => {
      s.maintenance[0].diagnostics!.consecutive_failures = 999
    },
    (s: Observation) => {
      s.maintenance[0].diagnostics!.recent_failures = Array(9).fill(
        s.maintenance[0].diagnostics!.recent_failures[0],
      )
    },
    (s: Observation) => {
      s.maintenance[0].diagnostics!.recent_failures[0].error.http_status = 999
    },
    (s: Observation) => {
      s.maintenance[0].diagnostics!.recent_failures[0].error.fingerprint = 'invalid'
    },
  ]) {
    const invalid = diagnosticSample()
    mutate(invalid)
    expect(isObservation(invalid)).toBe(false)
  }
})

// Queue lifecycle actions require exact confirmation and never infer force from a snapshot.
test('empty queue deletion requires its exact name and returns to refreshed inventory', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const broker = await setup(page)
  const snapshot = sample()
  Object.assign(snapshot.queues![0], {
    active: 0,
    locked: 0,
    scheduled: 0,
    deferred: 0,
    dead_lettered: 0,
    unexpected: 0,
    total: 0,
    oldest_message_age_ms: 0,
  })
  broker.observation = snapshot
  let deleted = 0
  await page.route('**/mqlite.v1.AdminService/DeleteQueue', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ name: 'orders' })
    deleted++
    broker.queuePresent = false
    snapshot.queues = snapshot.queues!.filter((q) => q.queue !== 'orders')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":true,"state":"deleted"}',
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'orders' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const confirm = dialog.getByRole('button', { name: 'confirm delete', exact: true })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Type the queue name to confirm').fill('order')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('button', { name: 'cancel', exact: true }).click()
  expect(deleted).toBe(0)
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  await dialog.getByLabel('Type the queue name to confirm').fill('orders')
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'orders' })).toHaveCount(0)
  expect(deleted).toBe(1)
})

for (const reply of [
  'queue_not_empty',
  'unsupported',
  'outcome_unknown',
  'malformed_success',
]) {
  test(`queue deletion reports ${reply} without dismissing the action`, async ({ page }) => {
    const broker = await setup(page)
    const snapshot = sample()
    Object.assign(snapshot.queues![0], {
      active: 0,
      locked: 0,
      scheduled: 0,
      deferred: 0,
      dead_lettered: 0,
      unexpected: 0,
      total: 0,
      oldest_message_age_ms: 0,
    })
    broker.observation = snapshot
    await page.route('**/mqlite.v1.AdminService/DeleteQueue', (route) =>
      route.fulfill({
        status:
          reply === 'malformed_success'
            ? 200
            : reply === 'queue_not_empty'
              ? 409
              : reply === 'unsupported'
                ? 404
                : 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: reply === 'unsupported' ? 'not_found' : reply,
          message:
            reply === 'unsupported'
              ? 'no such path: DeleteQueue'
              : reply === 'queue_not_empty'
                ? 'Queue now contains messages.'
                : 'commit result unknown',
        }),
      }),
    )
    await page.goto('/')
    await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
    await page.getByRole('row').filter({ hasText: 'orders' }).click()
    await page.getByRole('button', { name: 'delete queue', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Type the queue name to confirm').fill('orders')
    await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText(
      reply === 'queue_not_empty'
        ? 'Queue now contains messages'
        : reply === 'unsupported'
          ? 'does not support'
          : 'could not be confirmed',
    )
    await expect(dialog).toBeVisible()
    if (reply === 'outcome_unknown' || reply === 'malformed_success')
      await expect(dialog.getByRole('button', { name: 'confirm delete', exact: true })).toBeDisabled()
  })
}

test('nonempty queue deletion requires explicit force and warns about locked external effects', async ({ page }) => {
  const broker = await setup(page)
  let deleted = 0
  await page.route('**/mqlite.v1.AdminService/DeleteQueue', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ name: 'orders', force: true })
    deleted++
    broker.queuePresent = false
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":true,"state":"deleted"}',
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'orders' }).click()
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Type the queue name to confirm').fill('orders')
  await expect(dialog.getByRole('button', { name: 'confirm delete', exact: true })).toBeDisabled()
  await expect(dialog).toContainText('Empty-only deletion is unavailable')
  await expect(dialog).toContainText('locked')
  await expect(dialog).toContainText('external side effect')
  await dialog.getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' }).check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(deleted).toBe(1)
})

test('accepted deletion checks completion by refreshing inventory without replaying delete', async ({ page }) => {
  const broker = await setup(page)
  const snapshot = broker.observation as Observation
  const requests: unknown[] = []
  await page.route('**/mqlite.v1.AdminService/DeleteQueue', async (route) => {
    requests.push(route.request().postDataJSON())
    expect(requests).toHaveLength(1)
    broker.queueState = 'deleting'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":false,"state":"deleting"}',
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'orders' }).click()
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Type the queue name to confirm').fill('orders')
  await dialog.getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' }).check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Deletion was accepted')
  await expect(page.getByText('cleanup in progress · name reserved')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ send', exact: true })).toHaveCount(0)
  broker.queuePresent = false
  snapshot.queues = snapshot.queues!.filter((q) => q.queue !== 'orders')
  await dialog.getByRole('button', { name: 'check deletion', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'orders' })).toHaveCount(0)
  expect(requests).toEqual([{ name: 'orders', force: true }])
})

test('pending check cannot delete a same-name replacement', async ({ page }) => {
  const broker = await setup(page)
  const requests: unknown[] = []
  await page.route('**/mqlite.v1.AdminService/DeleteQueue', async (route) => {
    requests.push(route.request().postDataJSON())
    expect(requests).toHaveLength(1)
    broker.queueState = 'deleting'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":false,"state":"deleting"}',
    })
  })
  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'orders' }).click()
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Type the queue name to confirm').fill('orders')
  await dialog.getByRole('checkbox', { name: 'Force deletion and permanently discard every message state' }).check()
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Deletion was accepted')
  broker.queueState = 'active'
  await dialog.getByRole('button', { name: 'check deletion', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'orders' })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: 'orders' }).getByText('deleting')).toHaveCount(0)
  expect(requests).toEqual([{ name: 'orders', force: true }])
})

test('queue deletion does not follow a redirect or issue a second POST', async ({ page }) => {
  const broker = await setup(page)
  const snapshot = sample()
  Object.assign(snapshot.queues![0], {
    active: 0,
    locked: 0,
    scheduled: 0,
    deferred: 0,
    dead_lettered: 0,
    unexpected: 0,
    total: 0,
    oldest_message_age_ms: 0,
  })
  broker.observation = snapshot
  let sourceRequests = 0
  let redirectRequests = 0
  await page.route('**/mqlite.v1.AdminService/DeleteQueue', (route) => {
    sourceRequests++
    return route.fulfill({ status: 307, headers: { location: '/delete-redirect-target' } })
  })
  await page.route('**/delete-redirect-target', (route) => {
    redirectRequests++
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"deleted":true,"state":"deleted"}',
    })
  })

  await page.goto('/')
  await page.locator('nav').getByRole('button', { name: 'queues', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'orders' }).click()
  await page.getByRole('button', { name: 'delete queue', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Type the queue name to confirm').fill('orders')
  await dialog.getByRole('button', { name: 'confirm delete', exact: true }).click()

  await expect(dialog.getByRole('alert')).toContainText('could not be confirmed')
  await expect(dialog.getByRole('button', { name: 'confirm delete', exact: true })).toBeDisabled()
  expect(sourceRequests).toBe(1)
  expect(redirectRequests).toBe(0)
})
