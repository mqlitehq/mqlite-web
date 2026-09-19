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
interface Broker {
  keys: Key[]
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
    const body = route.request().postDataJSON()
    if (path.endsWith('/ListKeys')) {
      const all = broker.keys.filter((key) => key.id > (body.after_id ?? '')).sort((a, b) => a.id.localeCompare(b.id))
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
    if (path.endsWith('/ListQueues')) return respond({ queues: [] })
    if (path.endsWith('/ListSubscriptions')) return respond({ subscriptions: [] })
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

async function create(page: Page, name: string, permission = 'send') {
  await page.getByRole('textbox', { name: 'key name', exact: true }).fill(name)
  await page.getByRole('combobox', { name: 'key permissions' }).selectOption(permission)
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
    expect(broker.retainedBeforeSend).toBe(true)
    expect(broker.keys.at(-1)?.permissions).toEqual(permission.split(','))
    expect(broker.keys.at(-1)?.id).toMatch(/^[0-9a-f]{32}$/)
    await expectNoStoredSecret(page, broker.lastSecret)
    await page.getByRole('button', { name: 'I saved the secret', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'new access key secret' })).toHaveCount(0)
  }
  expect(broker.creates).toBe(4)
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
  const keys: Key[] = Array.from({ length: 27 }, (_, i) => ({
    id: (i + 1).toString(16).padStart(32, '0'),
    name: `key-${i + 1}`,
    permissions: ['send'],
    created_at_ms: Date.now() - 10000,
    expires_at_ms: i === 1 ? Date.now() - 1000 : 0,
    revoked_at_ms: i === 2 ? Date.now() - 500 : 0,
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
  'descending IDs': { keys: [{ ...validListKey, id: '2'.padStart(32, '0') }, validListKey] },
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
  await page.getByRole('textbox', { name: 'key expiry', exact: true }).fill('2000-01-01T00:00')
  await create(page, 'expired-input')
  await expect(page.getByRole('alert')).toContainText('future expiry')
  expect(broker.creates).toBe(0)
  await page.getByRole('textbox', { name: 'key expiry', exact: true }).fill('2099-01-01T00:00')
  await page.getByRole('button', { name: 'create key', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'new access key secret' })).toBeVisible()
  expect(broker.keys[0].expires_at_ms).toBeGreaterThan(Date.now())
})
