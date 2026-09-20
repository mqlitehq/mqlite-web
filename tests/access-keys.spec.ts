import { test, expect, type Page } from '@playwright/test'

interface Key {
  id: string
  name: string
  permissions: string[]
  created_at_ms: number
  expires_at_ms: number
  revoked_at_ms: number
}
interface CreatedKey {
  key: Key
  token: string
}
interface SendRequest {
  queue: string
  messages: { body: string }[]
  scheduled_enqueue_time_ms?: number
}
interface KeyListRequest {
  after_id?: string
  limit?: number
  sort?: string
}
interface Broker {
  keys: Key[]
  lists: KeyListRequest[]
  queues: string[]
  sends: SendRequest[]
  creates: number
  revokes: number
  unsupported: boolean
  forbidden: boolean
  authOff?: boolean
  unauthorized: boolean
  loseResponse: boolean
  retainedBeforeSend: boolean
  lastSecret: string
  malformed?: (path: string, response: unknown) => unknown
}

async function setup(page: Page, initial: Key[] = []): Promise<Broker> {
  const broker: Broker = {
    keys: initial,
    lists: [],
    queues: [],
    sends: [],
    creates: 0,
    revokes: 0,
    unsupported: false,
    forbidden: false,
    unauthorized: false,
    loseResponse: false,
    retainedBeforeSend: false,
    lastSecret: '',
  }
  await page.addInitScript(() => {
    localStorage.setItem('mqlite_endpoint', 'https://broker.example.test')
    sessionStorage.setItem('mqlite_token', 'fixture-admin')
  })
  await page.route('https://broker.example.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const respond = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(status === 200 && broker.malformed ? broker.malformed(path, body) : body),
      })
    if (path === '/') return respond({ name: 'mqlite', version: broker.unsupported ? '0.3.0' : '0.3.1', status: 'ok' })
    if (broker.unauthorized) return respond({ code: 'unauthenticated', message: 'invalid token' }, 401)
    if (broker.forbidden) return respond({ code: 'permission_denied', message: 'permission denied' }, 403)
    if (path.includes('AuthService') && broker.authOff)
      return respond({ code: 'permission_denied', message: 'key management requires authentication' }, 403)
    if (path.includes('AuthService') && broker.unsupported)
      return respond({ code: 'not_found', message: 'no such path' }, 404)
    if (path.endsWith('/Observe')) return respond({ code: 'unimplemented', message: 'no such path' }, 404)
    const body = route.request().postDataJSON()
    if (path.endsWith('/ListKeys')) {
      broker.lists.push(body as KeyListRequest)
      const sort = body.sort || 'id_asc'
      if (sort !== 'id_asc' && sort !== 'created_desc') return respond({ code: 'invalid_argument', message: 'invalid sort' }, 400)
      const cursor = body.after_id ? broker.keys.find((key) => key.id === body.after_id) : undefined
      if (sort === 'created_desc' && body.after_id && !cursor) {
        return respond({ code: 'invalid_argument', message: 'unknown key cursor' }, 400)
      }
      const all = broker.keys.filter((key) => sort === 'created_desc'
        ? !cursor || key.created_at_ms < cursor.created_at_ms ||
          (key.created_at_ms === cursor.created_at_ms && key.id < cursor.id)
        : key.id > (body.after_id ?? ''),
      ).sort((a, b) => sort === 'created_desc'
        ? b.created_at_ms - a.created_at_ms || b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id),
      )
      const keys = all.slice(0, body.limit || 100)
      return respond({ keys, ...(all.length > keys.length ? { next_after_id: keys[keys.length - 1].id } : {}) })
    }
    if (path.endsWith('/CreateKey')) {
      broker.creates++
      broker.retainedBeforeSend = await page.evaluate((id) => {
        const stored = sessionStorage.getItem('mqlite_pending_key:https://broker.example.test')
        return stored !== null && JSON.parse(stored).id === id
      }, body.id)
      const key: Key = { ...body, created_at_ms: Date.now(), expires_at_ms: body.expires_at_ms || 0, revoked_at_ms: 0 }
      broker.keys.push(key)
      broker.lastSecret = 'mqk_' + body.id.repeat(2)
      if (broker.loseResponse) return route.abort('failed')
      return respond({ key, token: broker.lastSecret })
    }
    if (path.endsWith('/RevokeKey')) {
      broker.revokes++
      const key = broker.keys.find((item) => item.id === body.id)
      if (!key) return respond({ code: 'not_found', message: 'key not found' }, 404)
      key.revoked_at_ms = Date.now()
      return respond({ ok: true })
    }
    if (path.endsWith('/ListQueues')) return respond({ queues: broker.queues.map((name) => ({ name, kind: 'queue' })) })
    if (path.endsWith('/ListSubscriptions')) return respond({ subscriptions: [] })
    if (path.endsWith('/Stats')) {
      return respond({ queue: body.queue, active: 0, locked: 0, deferred: 0, scheduled: 0, dead_lettered: 0, total: 0, oldest_message_age_ms: 0 })
    }
    if (path.endsWith('/Peek')) return respond({ messages: [] })
    if (path.endsWith('/Send')) {
      broker.sends.push(body as SendRequest)
      return respond({ seq_numbers: [broker.sends.length] })
    }
    return respond({
      version: '0.3.1',
      backend: 'memory',
      location: ':memory:',
      remote: false,
      schema_version: '5',
      ping_ms: 1,
      db_size_bytes: 0,
      queues: 0,
      subscriptions: 0,
      uptime_ms: 1000,
      auth: true,
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'access keys', exact: true }).click()
  await expect(page.getByText('loading keys…')).toHaveCount(0)
  return broker
}

const permissionLabels: Record<string, string> = {
  send: 'send',
  listen: 'listen',
  'send,listen': 'send + listen',
  manage: 'manage',
}

async function create(page: Page, name: string, permission = 'send') {
  await page.getByRole('textbox', { name: 'key name', exact: true }).fill(name)
  await page.getByRole('combobox', { name: 'key permissions', exact: true }).click()
  await page.getByRole('option', { name: permissionLabels[permission], exact: true }).click()
  await page.getByRole('button', { name: 'create key', exact: true }).click()
}

async function expectNoStoredSecret(page: Page, secret: string) {
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  )
  expect(storage).not.toContain(secret)
}

test('creates each permission with a retained ID and a one-time secret', async ({ page }) => {
  const broker = await setup(page)
  for (const permission of ['send', 'listen', 'send,listen', 'manage']) {
    await create(page, `fixture-${permission}`, permission)
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toHaveValue(/^mqk_[0-9a-f]{64}$/)
    await expect(page.getByRole('combobox', { name: 'key permissions', exact: true })).toBeDisabled()
    expect(broker.retainedBeforeSend).toBe(true)
    expect(broker.keys.at(-1)?.permissions).toEqual(permission.split(','))
    expect(broker.keys.at(-1)?.id).toMatch(/^[0-9a-f]{32}$/)
    await expectNoStoredSecret(page, broker.lastSecret)
    await page.getByRole('button', { name: 'I saved the secret', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toHaveCount(0)
  }
  expect(broker.creates).toBe(4)
})

test('permission keyboard selection commits all four values without submitting the form', async ({ page }) => {
  const broker = await setup(page)
  const select = page.getByRole('combobox', { name: 'key permissions', exact: true })
  const list = page.getByRole('listbox', { name: 'Key permissions', exact: true })
  for (const [index, permission] of ['send', 'listen', 'send,listen', 'manage'].entries()) {
    await page.getByRole('textbox', { name: 'key name', exact: true }).fill(`keyboard-${index}`)
    await select.focus()
    await page.keyboard.press('Home')
    await expect(list).toBeVisible()
    if (index === 3) {
      await page.keyboard.press('End')
    } else {
      for (let step = 0; step < index; step++) await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)
    await expect(select).toBeFocused()
    expect(broker.creates).toBe(index)
    await page.getByRole('button', { name: 'create key', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
    expect(broker.keys.at(-1)?.permissions).toEqual(permission.split(','))
    await expect(select).toBeDisabled()
    await page.getByRole('button', { name: 'I saved the secret', exact: true }).click()
    await expect(select).toBeEnabled()
  }
})

test('permission menu has a dark surface, fits mobile, and dismisses uncommitted choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const broker = await setup(page)
  const select = page.getByRole('combobox', { name: 'key permissions', exact: true })
  const list = page.getByRole('listbox', { name: 'Key permissions', exact: true })
  await expect(page.locator('select[aria-label="key permissions"]')).toHaveCount(0)
  await select.click()
  await expect(list.getByRole('option')).toHaveCount(4)
  for (const label of Object.values(permissionLabels)) {
    await expect(list.getByRole('option', { name: label, exact: true })).toBeVisible()
  }
  const surface = await list.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = getComputedStyle(node).backgroundColor
    context.fillRect(0, 0, 1, 1)
    return [...context.getImageData(0, 0, 1, 1).data]
  })
  expect(surface[3]).toBe(255)
  expect(Math.max(...surface.slice(0, 3))).toBeLessThan(100)
  const bounds = await list.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
  await page.keyboard.press('End')
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(select).toBeFocused()
  await select.click()
  await expect(list.getByRole('option', { name: 'send', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await page.getByRole('heading', { name: 'access keys', exact: true }).click()
  await expect(list).toHaveCount(0)
  await select.click()
  await expect(list.getByRole('option', { name: 'send', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Tab')
  await expect(list).toHaveCount(0)
  expect(broker.creates).toBe(0)
})

test('reload loses the secret but preserves its public ID for exact reconciliation', async ({ page }) => {
  const broker = await setup(page)
  await create(page, 'same-name')
  await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
  const id = broker.keys[0].id
  await page.reload()
  await page.getByRole('button', { name: 'access keys', exact: true }).click()
  await expect(page.getByTestId('pending-key-id')).toHaveText(id)
  await expect(page.getByRole('textbox', { name: 'new access key secret' })).toHaveCount(0)
  await expectNoStoredSecret(page, broker.lastSecret)
  await page.getByRole('button', { name: 'check request ID' }).click()
  await expect(page.getByText(/Found this exact request ID: active/)).toBeVisible()
  expect(broker.lists.at(-1)).toEqual({ after_id: (BigInt(`0x${id}`) - 1n).toString(16).padStart(32, '0'), limit: 1, sort: 'id_asc' })
  await page.getByRole('button', { name: 'revoke undelivered key' }).click()
  await page.getByRole('button', { name: 'cancel', exact: true }).click()
  expect(broker.revokes).toBe(0)
  await page.getByRole('button', { name: 'revoke undelivered key' }).click()
  await page.getByRole('button', { name: 'confirm revoke', exact: true }).click()
  await expect(page.getByRole('button', { name: 'finish reconciliation' })).toBeVisible()
  expect(broker.revokes).toBe(1)
  await page.getByRole('button', { name: 'finish reconciliation' }).click()
  await expect(page.getByTestId('pending-key-id')).toHaveCount(0)
})

test('lost creation response is not retried and keeps the exact public ID', async ({ page }) => {
  const broker = await setup(page)
  broker.loseResponse = true
  await create(page, 'lost-response')
  await expect(page.getByText('unknown', { exact: true })).toBeVisible()
  expect(broker.creates).toBe(1)
  await expect(page.getByRole('button', { name: 'create key', exact: true })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'key permissions', exact: true })).toBeDisabled()
  await expect(page.getByTestId('pending-key-id')).toHaveText(broker.keys[0].id)
  await page.getByRole('button', { name: 'check request ID' }).click()
  await expect(page.getByText(/Found this exact request ID: active/)).toBeVisible()
  expect(broker.creates).toBe(1)
  await expectNoStoredSecret(page, broker.lastSecret)
})

test('pending creation with no row warns that it can still commit', async ({ page }) => {
  await setup(page)
  await page.evaluate(() =>
    sessionStorage.setItem(
      'mqlite_pending_key:https://broker.example.test',
      JSON.stringify({
        id: '1'.padStart(32, '0'),
        name: 'pending',
        started_at_ms: Date.now(),
        outcome: 'unknown',
      }),
    ),
  )
  await page.reload()
  await page.getByRole('button', { name: 'access keys', exact: true }).click()
  await page.getByRole('button', { name: 'check request ID' }).click()
  await expect(page.getByText(/An outstanding request may still commit later/)).toBeVisible()
  await page.getByRole('button', { name: 'dismiss saved request…' }).click()
  await expect(page.getByRole('alertdialog', { name: 'dismiss retained request' })).toBeVisible()
  await page.getByRole('button', { name: 'keep request' }).click()
  await expect(page.getByTestId('pending-key-id')).toBeVisible()
})

test('lists all states, paginates, and requires confirmation to revoke', async ({ page }) => {
  const now = Date.now()
  const keys: Key[] = Array.from({ length: 27 }, (_, i) => ({
    id: (i + 1).toString(16).padStart(32, '0'),
    name: `key-${i + 1}`,
    permissions: ['send'],
    created_at_ms: now - 10000 - i,
    expires_at_ms: i === 1 ? now - 1000 : 0,
    revoked_at_ms: i === 2 ? now - 500 : 0,
  }))
  const broker = await setup(page, keys)
  await expect(page.getByRole('row')).toHaveCount(26)
  await expect(page.getByText('expired', { exact: true })).toBeVisible()
  await expect(page.getByText('revoked', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'revoke key-3', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'next', exact: true }).click()
  await expect(page.getByRole('row')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'next', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'previous', exact: true }).click()
  await page.getByRole('button', { name: 'revoke key-1', exact: true }).click()
  expect(broker.revokes).toBe(0)
  await page.getByRole('button', { name: 'confirm revoke', exact: true }).click()
  await expect(page.getByRole('button', { name: 'revoke key-1', exact: true })).toBeDisabled()
  expect(broker.revokes).toBe(1)
})

// A known newest-first sequence: IDs deliberately vary independently of time,
// and every three records share a timestamp, including across a page boundary.
function historyKeys(): Key[] {
  const created = Date.now() - 60_000
  const keys: Key[] = []
  for (let group = 0; group < 20; group++) {
    const ids = Array.from({ length: group === 19 ? 1 : 3 }, (_, index) =>
      (((group * 3 + index) * 29) % 61 + 1).toString(16).padStart(32, '0'),
    ).sort().reverse()
    for (const id of ids) {
      keys.push({
        id,
        name: `history-${id}`,
        permissions: ['send'],
        created_at_ms: created - group * 1000,
        expires_at_ms: group % 5 === 0 ? created + 10_000 : 0,
        revoked_at_ms: group % 7 === 0 ? created + 20_000 : 0,
      })
    }
  }
  return keys
}

test('managed keys use global newest-first ordering across more than two pages', async ({ page }) => {
  const expected = historyKeys()
  const broker = await setup(page, [...expected].reverse())
  const ids = page.locator('tbody tr td:first-child code')
  await expect(page.getByText('25 per page · newest first', { exact: true })).toBeVisible()
  await expect(ids).toHaveText(expected.slice(0, 25).map((key) => key.id))
  await expect(page.getByText('revoked', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('expired', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'next', exact: true }).click()
  await expect(ids).toHaveText(expected.slice(25, 50).map((key) => key.id))
  await page.getByRole('button', { name: 'next', exact: true }).click()
  await expect(ids).toHaveText(expected.slice(50).map((key) => key.id))
  await expect(page.getByRole('button', { name: 'next', exact: true })).toBeDisabled()
  expect(broker.lists).toEqual([
    { after_id: '', limit: 25, sort: 'created_desc' },
    { after_id: expected[24].id, limit: 25, sort: 'created_desc' },
    { after_id: expected[49].id, limit: 25, sort: 'created_desc' },
  ])
  await page.getByRole('button', { name: 'previous', exact: true }).click()
  await expect(ids).toHaveText(expected.slice(25, 50).map((key) => key.id))
})

test('a new head record does not duplicate or skip existing keys while paging', async ({ page }) => {
  const expected = historyKeys()
  const broker = await setup(page, [...expected].reverse())
  const ids = page.locator('tbody tr td:first-child code')
  await expect(ids).toHaveText(expected.slice(0, 25).map((key) => key.id))
  const seen = await ids.allTextContents()
  const newest: Key = { ...validListKey, id: 'f'.repeat(32), name: 'external-new-key', created_at_ms: Date.now() }
  broker.keys.push(newest)
  for (const start of [25, 50]) {
    await page.getByRole('button', { name: 'next', exact: true }).click()
    await expect(ids).toHaveText(expected.slice(start, start + 25).map((key) => key.id))
    seen.push(...await ids.allTextContents())
  }
  expect(seen).toEqual(expected.map((key) => key.id))
  expect(new Set(seen).size).toBe(expected.length)
  await page.getByRole('button', { name: 'previous', exact: true }).click()
  await expect(ids).toHaveText(expected.slice(25, 50).map((key) => key.id))
  await page.getByRole('button', { name: 'previous', exact: true }).click()
  await expect(ids).toHaveText([newest, ...expected.slice(0, 24)].map((key) => key.id))
})

test('creating a key from a later page returns to the newest key first', async ({ page }) => {
  const expected = historyKeys()
  const broker = await setup(page, [...expected].reverse())
  await page.getByRole('button', { name: 'next', exact: true }).click()
  const ids = page.locator('tbody tr td:first-child code')
  await expect(ids).toHaveText(expected.slice(25, 50).map((key) => key.id))
  await create(page, 'newest-created-key')
  await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
  const newest = broker.keys.at(-1)!
  await expect(ids).toHaveText([newest, ...expected.slice(0, 24)].map((key) => key.id))
  await expect(page.getByRole('button', { name: 'previous', exact: true })).toBeDisabled()
  expect(broker.lists.at(-1)).toEqual({ after_id: '', limit: 25, sort: 'created_desc' })
})

for (const repeated of ['row', 'next cursor']) {
  test(`rejects a repeated request cursor in the response ${repeated}`, async ({ page }) => {
    const expected = historyKeys()
    const broker = await setup(page, [...expected].reverse())
    broker.malformed = (path, result) => {
      if (!path.endsWith('/ListKeys')) return result
      return repeated === 'row'
        ? { keys: [expected[24]] }
        : { keys: expected.slice(25, 50), next_after_id: expected[24].id }
    }
    await page.getByRole('button', { name: 'next', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('invalid key response')
  })
}

test('403 keeps the session and 401 returns to login', async ({ page }) => {
  const broker = await setup(page)
  broker.forbidden = true
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Your session has been kept')
  expect(await page.evaluate(() => sessionStorage.getItem('mqlite_token'))).toBe('fixture-admin')
  broker.forbidden = false
  broker.unauthorized = true
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'connect', exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('mqlite_token'))).toBeNull()
})

test('application keys get a clear manage requirement at login', async ({ page }) => {
  const broker = await setup(page)
  await page.getByRole('button', { name: 'sign out' }).click()
  broker.forbidden = true
  await page.locator('input[type=password]').fill('fixture-listen-key')
  await page.getByRole('button', { name: 'connect', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('requires a manage key')
  expect(await page.evaluate(() => sessionStorage.getItem('mqlite_token'))).toBeNull()
})

test('older brokers show one clear unsupported state without repeated calls', async ({ page }) => {
  const broker = await setup(page)
  broker.unsupported = true
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByText('This broker does not support managed access keys.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'create key', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'queues', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'queues', exact: true })).toBeVisible()
  expect(broker.creates).toBe(0)
})

test('storage failure stops creation before any request', async ({ page }) => {
  const broker = await setup(page)
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage is blocked')
    }
  })
  await create(page, 'blocked-storage')
  await expect(page.getByRole('alert').filter({ hasText: 'Storage is blocked' })).toBeVisible()
  expect(broker.creates).toBe(0)
})

test('randomness failure stops issuance before any request', async ({ page }) => {
  const broker = await setup(page)
  await page.evaluate(() => {
    Crypto.prototype.getRandomValues = () => {
      throw new Error('Randomness is unavailable')
    }
  })
  await create(page, 'blocked-randomness')
  await expect(page.getByRole('alert')).toContainText('Randomness is unavailable')
  expect(broker.creates).toBe(0)
})

const invalidCreates: Record<string, (result: CreatedKey) => unknown> = {
  'empty object': () => ({}),
  'missing token': (value) => ({ key: value.key }),
  'invalid token': (value) => ({ ...value, token: 'untrusted-secret-response' }),
  'wrong ID': (value) => ({ ...value, key: { ...value.key, id: 'f'.repeat(32) } }),
  'wrong name': (value) => ({ ...value, key: { ...value.key, name: 'other' } }),
  'wrong permission': (value) => ({ ...value, key: { ...value.key, permissions: ['manage'] } }),
  'comma permission': (value) => ({ ...value, key: { ...value.key, permissions: ['send,listen'] } }),
  'wrong expiry': (value) => ({ ...value, key: { ...value.key, expires_at_ms: value.key.created_at_ms + 100000 } }),
  'revoked creation': (value) => ({ ...value, key: { ...value.key, revoked_at_ms: value.key.created_at_ms } }),
  'null metadata': (value) => ({ ...value, key: { ...value.key, created_at_ms: null } }),
}
for (const [name, mutate] of Object.entries(invalidCreates)) {
  test(`malformed create success: ${name} retains unknown outcome`, async ({ page }) => {
    const broker = await setup(page)
    broker.malformed = (path, value) => (path.endsWith('/CreateKey') ? mutate(value as CreatedKey) : value)
    await create(page, 'invalid-success')
    await expect(page.getByText('unknown', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('invalid key response')
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toHaveCount(0)
    await expect(page.getByTestId('pending-key-id')).toHaveText(broker.keys[0].id)
    await expect(page.getByRole('alert')).not.toContainText('untrusted-secret-response')
    expect(broker.creates).toBe(1)
    await expectNoStoredSecret(page, broker.lastSecret)
  })
}

const validListKey: Key = {
  id: '1'.padStart(32, '0'),
  name: 'test',
  permissions: ['send'],
  created_at_ms: 1,
  expires_at_ms: 0,
  revoked_at_ms: 0,
}
const invalidLists: Record<string, unknown> = {
  'duplicate IDs': { keys: [validListKey, validListKey] },
  'ascending IDs with equal creation time': { keys: [validListKey, { ...validListKey, id: '2'.padStart(32, '0') }] },
  'increasing creation time': { keys: [validListKey, { ...validListKey, id: '2'.padStart(32, '0'), created_at_ms: 2 }] },
  'invalid permission list': { keys: [{ ...validListKey, permissions: ['send,listen'] }] },
  'cursor does not match last ID': { keys: [validListKey], next_after_id: '2'.padStart(32, '0') },
  'cursor on incomplete page': { keys: [validListKey], next_after_id: validListKey.id },
  'oversized page': {
    keys: Array.from({ length: 26 }, (_, i) => ({ ...validListKey, id: (i + 1).toString(16).padStart(32, '0') })),
  },

  'missing keys': {},
  'null keys': { keys: null },
  'non-array keys': { keys: {} },
  'missing metadata': { keys: [{ id: '1'.padStart(32, '0') }] },
  'cursor without page': { keys: [], next_after_id: '1'.padStart(32, '0') },
}
for (const [name, result] of Object.entries(invalidLists)) {
  test(`malformed list success: ${name} is not presented as valid`, async ({ page }) => {
    const broker = await setup(page)
    broker.malformed = (path, value) => (path.endsWith('/ListKeys') ? result : value)
    await page.getByRole('button', { name: 'refresh', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('invalid key response')
  })
}

for (const response of [{}, { ok: false }, { ok: 'true' }, null]) {
  test(`malformed revoke success ${JSON.stringify(response)} cannot report success`, async ({ page }) => {
    const broker = await setup(page, [
      {
        id: '1'.padStart(32, '0'),
        name: 'victim',
        permissions: ['send'],
        created_at_ms: 1,
        expires_at_ms: 0,
        revoked_at_ms: 0,
      },
    ])
    broker.malformed = (path, value) => (path.endsWith('/RevokeKey') ? response : value)
    await page.getByRole('button', { name: 'revoke victim', exact: true }).click()
    await page.getByRole('button', { name: 'confirm revoke', exact: true }).click()
    await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('invalid key response')
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
}

test('authentication-off broker cannot issue keys from the console', async ({ page }) => {
  const broker = await setup(page)
  broker.authOff = true
  await page.getByRole('button', { name: 'refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('authentication enabled')
  await expect(page.getByRole('button', { name: 'create key', exact: true })).toHaveCount(0)
  expect(broker.creates).toBe(0)
})

test('expiry validates a future instant and displays the created expiry', async ({ page }) => {
  const broker = await setup(page)
  await page.getByRole('textbox', { name: 'key expiry', exact: true }).fill('2000-01-01 00:00')
  await create(page, 'expired-input')
  await expect(page.getByRole('alert')).toContainText('future expiry')
  expect(broker.creates).toBe(0)
  await page.getByRole('textbox', { name: 'key expiry', exact: true }).fill('2099-01-01 00:00')
  await page.getByRole('button', { name: 'create key', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
  expect(broker.keys[0].expires_at_ms).toBeGreaterThan(Date.now())
})

for (const locale of ['zh-CN', 'en-US']) {
  test.describe(`English dates with browser locale ${locale}`, () => {
    test.use({ locale, timezoneId: 'Asia/Shanghai' })

    test('keeps input, calendar, and key timestamps in a fixed format', async ({ page }) => {
      const broker = await setup(page, [{
        ...validListKey,
        name: 'formatted-key',
        created_at_ms: Date.UTC(2026, 8, 20, 1, 2, 3),
        expires_at_ms: Date.UTC(2099, 0, 2, 3, 4, 5),
      }])
      await expect(page.getByRole('heading', { name: 'managed keys', exact: true })).toBeVisible()
      await expect(page.getByText(/Administrator tokens in MQLITE_TOKENS are not listed here/)).toContainText('restart the broker')
      const row = page.getByRole('row').filter({ hasText: 'formatted-key' })
      await expect(row).toContainText('2026-09-20 09:02:03')
      await expect(row).toContainText('2099-01-02 11:04:05')
      const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
      await expect(expiry).toHaveAttribute('placeholder', 'yyyy-MM-dd HH:mm')
      await expiry.fill('2096-02-29 14:05')
      await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
      const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
      await expect(picker).toContainText('February 2096')
      for (const weekday of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
        await expect(picker.getByText(weekday, { exact: true })).toBeVisible()
      }
      await expect(picker.getByRole('button', { name: 'February 29, 2096', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator('input[type="datetime-local"], input[type="date"], input[type="time"]')).toHaveCount(0)
      await picker.getByRole('button', { name: 'Apply', exact: true }).click()
      await expect(expiry).toHaveValue('2096-02-29 14:05')
      await create(page, `locale-${locale}`)
      await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
      expect(broker.keys.at(-1)?.expires_at_ms).toBe(Date.UTC(2096, 1, 29, 6, 5))
      await page.getByRole('button', { name: 'I saved the secret', exact: true }).click()
      await expect(page.getByRole('row').filter({ hasText: `locale-${locale}` })).toContainText('2096-02-29 14:05:00')
    })
  })
}

test.describe('local date and time entry', () => {
  test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })

  test('rejects malformed and impossible dates before creating a key', async ({ page }) => {
    const broker = await setup(page)
    await page.getByRole('textbox', { name: 'key name', exact: true }).fill('invalid-date')
    const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
    for (const value of [
      '2099-02-29 12:00', '2100-02-29 12:00', '2099-04-31 12:00',
      '2099-00-01 12:00', '2099-13-01 12:00', '2099-01-00 12:00', '2099-01-32 12:00',
      '2099-01-01 24:00', '2099-01-01 12:60', '2099-01-01 12:00:00',
      '2099/01/01 12:00', '2099-01-01', '0000-01-01 12:00',
    ]) {
      await expiry.fill(value)
      await page.getByRole('button', { name: 'create key', exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('future expiry')
      expect(broker.creates, value).toBe(0)
      expect(broker.keys, value).toHaveLength(0)
    }
    await expiry.fill('')
    await page.getByRole('button', { name: 'create key', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
    expect(broker.keys[0].expires_at_ms).toBe(0)
  })

  test('calendar selection crosses a year boundary and submits the chosen local instant', async ({ page }) => {
    const broker = await setup(page)
    const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
    await expiry.fill('2098-12-31 00:00')
    await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await picker.getByRole('button', { name: 'Next month', exact: true }).click()
    await expect(picker).toContainText('January 2099')
    await picker.getByRole('button', { name: 'Previous month', exact: true }).click()
    await expect(picker).toContainText('December 2098')
    await picker.getByRole('button', { name: 'Next month', exact: true }).click()
    await picker.getByRole('button', { name: 'January 2, 2099', exact: true }).click()
    await picker.getByRole('textbox', { name: 'Hour', exact: true }).fill('23')
    await picker.getByRole('textbox', { name: 'Minute', exact: true }).fill('07')
    await expect(expiry).toHaveValue('2098-12-31 00:00')
    await page.keyboard.press('Enter')
    await expect(expiry).toHaveValue('2099-01-02 23:07')
    await expect(picker).toHaveCount(0)
    expect(broker.creates).toBe(0)
    await create(page, 'calendar-selection')
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
    expect(broker.keys[0].expires_at_ms).toBe(Date.UTC(2099, 0, 2, 15, 7))
  })

  test('calendar validates time, cancels pending edits, restores focus, and clears expiry', async ({ page }) => {
    const broker = await setup(page)
    const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
    const trigger = page.getByRole('button', { name: 'Choose date and time', exact: true })
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await expiry.fill('2099-01-02 10:30')
    await trigger.click()
    await picker.getByRole('textbox', { name: 'Hour', exact: true }).fill('24')
    await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
    await expect(picker.getByRole('alert')).toContainText('valid local date and time')
    await page.keyboard.press('Enter')
    await expect(picker).toBeVisible()
    expect(broker.creates).toBe(0)
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(expiry).toHaveValue('2099-01-02 10:30')
    await trigger.click()
    await expect(picker.getByRole('textbox', { name: 'Hour', exact: true })).toHaveValue('10')
    await picker.getByRole('button', { name: 'January 3, 2099', exact: true }).click()
    await page.getByRole('heading', { name: 'access keys', exact: true }).click()
    await expect(picker).toHaveCount(0)
    await expect(expiry).toHaveValue('2099-01-02 10:30')
    await trigger.click()
    await picker.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(expiry).toHaveValue('')
    await expect(trigger).toBeFocused()
    await create(page, 'cleared-expiry')
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
    expect(broker.keys[0].expires_at_ms).toBe(0)
  })

  test('calendar keyboard navigation crosses month boundaries', async ({ page }) => {
    await setup(page)
    const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
    await expiry.fill('2096-02-29 10:30')
    await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await expect(picker.getByRole('button', { name: 'February 29, 2096', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(picker.getByRole('button', { name: 'March 1, 2096', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(picker.getByRole('button', { name: 'February 29, 2096', exact: true })).toBeFocused()
    await picker.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(expiry).toHaveValue('2096-02-29 10:30')
  })

  test('calendar stays inside a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    await page.getByRole('textbox', { name: 'key expiry', exact: true }).fill('2099-01-02 10:30')
    await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeInViewport()
    const bounds = await picker.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
    await picker.getByRole('button', { name: 'January 3, 2099', exact: true }).click()
    await picker.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'key expiry', exact: true })).toHaveValue('2099-01-03 10:30')
  })

  test('message scheduling rejects invalid input and preserves scheduled and immediate sends', async ({ page }) => {
    const broker = await setup(page)
    broker.queues = ['schedule-fixture']
    await page.getByRole('button', { name: 'queues', exact: true }).click()
    await page.getByRole('row').filter({ hasText: 'schedule-fixture' }).click()
    await page.getByRole('button', { name: '+ send', exact: true }).click()
    const schedule = page.getByRole('textbox', { name: 'schedule for', exact: true })
    await expect(schedule).toHaveAttribute('placeholder', 'yyyy-MM-dd HH:mm')
    for (const value of ['2099-02-29 10:00', '2099-01-01 24:00', '2000-01-01 00:00', 'invalid']) {
      await schedule.fill(value)
      await page.getByRole('button', { name: /^(send|schedule)$/, exact: true }).click()
      await expect(page.getByRole('alert')).toContainText('valid future schedule')
      expect(broker.sends, value).toHaveLength(0)
    }
    await schedule.fill('2099-01-02 10:30')
    await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await expect(picker).toContainText('January 2099')
    await picker.getByRole('button', { name: 'January 3, 2099', exact: true }).click()
    await picker.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('input[type="datetime-local"], input[type="date"], input[type="time"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'schedule', exact: true }).click()
    await expect(page.getByText('✓ scheduled seq 1', { exact: true })).toBeVisible()
    expect(broker.sends).toHaveLength(1)
    expect(broker.sends[0]).toEqual({ queue: 'schedule-fixture', messages: [{ body: '' }], scheduled_enqueue_time_ms: Date.UTC(2099, 0, 3, 2, 30) })
    await schedule.fill('')
    await page.getByRole('button', { name: 'send', exact: true }).click()
    await expect(page.getByText('✓ sent seq 2', { exact: true })).toBeVisible()
    expect(broker.sends).toHaveLength(2)
    expect(broker.sends[1]).toEqual({ queue: 'schedule-fixture', messages: [{ body: '' }] })
  })
})

test.describe('daylight saving transitions', () => {
  test.use({ locale: 'en-US', timezoneId: 'America/New_York' })

  test('rejects a nonexistent local time and accepts the following valid instant', async ({ page }) => {
    const broker = await setup(page)
    // On this second Sunday in March, 02:30 normalizes to 03:30 in this timezone.
    expect(await page.evaluate(() => new Date(2099, 2, 8, 2, 30).getHours())).toBe(3)
    const expiry = page.getByRole('textbox', { name: 'key expiry', exact: true })
    await expiry.fill('2099-03-08 02:30')
    await create(page, 'dst-gap')
    await expect(page.getByRole('alert')).toContainText('future expiry')
    expect(broker.creates).toBe(0)
    await expiry.fill('2099-03-08 03:30')
    await page.getByRole('button', { name: 'Choose date and time', exact: true }).click()
    const picker = page.getByRole('dialog', { name: 'Choose date and time', exact: true })
    await picker.getByRole('textbox', { name: 'Hour', exact: true }).fill('02')
    await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
    await picker.getByRole('textbox', { name: 'Hour', exact: true }).fill('03')
    await picker.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByRole('button', { name: 'create key', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
    expect(broker.keys[0].expires_at_ms).toBe(Date.UTC(2099, 2, 8, 7, 30))
  })
})
