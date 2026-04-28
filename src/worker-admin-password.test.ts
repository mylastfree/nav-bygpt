import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import worker from '../public/_worker.js'

type StoredValue = {
  value: string
  metadata?: unknown
}

class MemoryKv {
  private values = new Map<string, StoredValue>()

  async get(key: string) {
    return this.values.get(key)?.value ?? null
  }

  async put(key: string, value: string, options?: { metadata?: unknown }) {
    this.values.set(key, {
      value,
      metadata: options?.metadata,
    })
  }

  async list(options?: { prefix?: string; limit?: number }) {
    const prefix = options?.prefix ?? ''
    const keys = [...this.values.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .slice(0, options?.limit ?? 1000)
      .map(([name, stored]) => ({
        name,
        metadata: stored.metadata,
      }))

    return { keys }
  }
}

function env(kv: MemoryKv, adminToken = 'bootstrap-secret') {
  return {
    STARTPAGE_KV: kv,
    ADMIN_TOKEN: adminToken,
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset')),
    },
  }
}

function passwordRequest(
  currentPassword: string,
  newPassword: string,
  headerPassword = currentPassword,
) {
  return new Request('https://nav.example/api/admin/password', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${headerPassword}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  })
}

describe('worker online admin password api', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-28T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('stores a hashed online password and accepts it for protected APIs', async () => {
    const kv = new MemoryKv()
    const response = await worker.fetch(
      passwordRequest('bootstrap-secret', 'new-secret-123'),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const body = await response.json()
    const storedCredential = (await kv.get('admin:credential')) ?? ''
    const withNewPassword = await worker.fetch(
      new Request('https://nav.example/api/backups', {
        headers: {
          authorization: 'Bearer new-secret-123',
        },
      }),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const withWrongPassword = await worker.fetch(
      new Request('https://nav.example/api/backups', {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      }),
      env(kv),
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(200)
    expect(body).toEqual({
      mode: 'cloud',
      updatedAt: '2026-04-28T03:00:00.000Z',
      adminPasswordSource: 'kv',
    })
    expect(storedCredential).toContain('PBKDF2-SHA-256')
    expect(storedCredential).not.toContain('new-secret-123')
    expect(storedCredential).not.toContain('bootstrap-secret')
    expect(withNewPassword.status).toBe(200)
    expect(withWrongPassword.status).toBe(401)
  })

  test('keeps the Cloudflare ADMIN_TOKEN as a rescue password after online password changes', async () => {
    const kv = new MemoryKv()
    await worker.fetch(passwordRequest('bootstrap-secret', 'new-secret-123'), env(kv), {
      waitUntil: vi.fn(),
    })

    const rescueResponse = await worker.fetch(
      new Request('https://nav.example/api/backups', {
        headers: {
          authorization: 'Bearer bootstrap-secret',
        },
      }),
      env(kv),
      { waitUntil: vi.fn() },
    )

    expect(rescueResponse.status).toBe(200)
  })

  test('rejects password changes when the typed current password is wrong', async () => {
    const kv = new MemoryKv()
    const response = await worker.fetch(
      passwordRequest('wrong-secret', 'new-secret-123', 'bootstrap-secret'),
      env(kv),
      { waitUntil: vi.fn() },
    )

    expect(response.status).toBe(401)
    expect(await kv.get('admin:credential')).toBeNull()
  })

  test('reports whether the active admin password comes from KV or the Cloudflare env', async () => {
    const kv = new MemoryKv()
    const before = await worker.fetch(new Request('https://nav.example/api/health'), env(kv), {
      waitUntil: vi.fn(),
    })
    await worker.fetch(passwordRequest('bootstrap-secret', 'new-secret-123'), env(kv), {
      waitUntil: vi.fn(),
    })
    const after = await worker.fetch(new Request('https://nav.example/api/health'), env(kv), {
      waitUntil: vi.fn(),
    })

    expect(await before.json()).toMatchObject({
      adminTokenConfigured: true,
      adminPasswordSource: 'env',
    })
    expect(await after.json()).toMatchObject({
      adminTokenConfigured: true,
      adminPasswordSource: 'kv',
    })
  })
})
