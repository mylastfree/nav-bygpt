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

function dashboard() {
  return {
    version: 1,
    updatedAt: '2026-04-27T01:00:00.000Z',
    settings: {
      title: 'Stored nav',
      theme: 'system',
    },
    groups: [
      {
        id: 'daily',
        name: 'Daily',
        links: [
          {
            id: 'github',
            title: 'GitHub',
            url: 'https://github.com',
            clickCount: 7,
          },
        ],
      },
    ],
  }
}

function env(kv: MemoryKv) {
  return {
    STARTPAGE_KV: kv,
    ADMIN_TOKEN: 'secret',
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset')),
    },
  }
}

function clickRequest(body: unknown, token = 'secret') {
  return new Request('https://nav.example/api/link-click', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('worker link click api', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T05:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('increments a link click behind the admin token without creating a backup', async () => {
    const kv = new MemoryKv()

    await kv.put('dashboard', JSON.stringify(dashboard()))

    const unauthorized = await worker.fetch(
      clickRequest({ groupId: 'daily', linkId: 'github' }, 'wrong'),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const authorized = await worker.fetch(
      clickRequest({ groupId: 'daily', linkId: 'github' }),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const body = await authorized.json()
    const stored = JSON.parse((await kv.get('dashboard')) ?? '{}')
    const backups = await kv.list({ prefix: 'backup:' })

    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(200)
    expect(body).toEqual({
      mode: 'cloud',
      updatedAt: '2026-04-27T05:00:00.000Z',
    })
    expect(stored.updatedAt).toBe('2026-04-27T05:00:00.000Z')
    expect(stored.groups[0].links[0].clickCount).toBe(8)
    expect(backups.keys).toEqual([])
  })

  test('rejects missing link ids without changing stored data', async () => {
    const kv = new MemoryKv()

    await kv.put('dashboard', JSON.stringify(dashboard()))

    const response = await worker.fetch(
      clickRequest({ groupId: 'daily', linkId: 'missing' }),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const stored = JSON.parse((await kv.get('dashboard')) ?? '{}')

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Link not found')
    expect(stored.groups[0].links[0].clickCount).toBe(7)
  })
})
