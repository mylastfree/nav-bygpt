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

  async delete(key: string) {
    this.values.delete(key)
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

function dashboard(title: string, linkCount = 1) {
  return {
    version: 1,
    updatedAt: '2026-04-27T01:00:00.000Z',
    settings: {
      title,
      theme: 'system',
    },
    groups: [
      {
        id: 'daily',
        name: 'Daily',
        links: Array.from({ length: linkCount }, (_, index) => ({
          id: `link-${index}`,
          title: `Link ${index}`,
          url: `https://example${index}.com`,
        })),
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

describe('worker backup api', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T03:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('lists backup summaries behind the admin token', async () => {
    const kv = new MemoryKv()

    await kv.put(
      'backup:2026-04-27T01-00-00-000Z',
      JSON.stringify(dashboard('Older', 1)),
    )
    await kv.put(
      'backup:2026-04-27T02-00-00-000Z',
      JSON.stringify(dashboard('Newer', 2)),
    )

    const unauthorized = await worker.fetch(
      new Request('https://nav.example/api/backups'),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const authorized = await worker.fetch(
      new Request('https://nav.example/api/backups', {
        headers: { authorization: 'Bearer secret' },
      }),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const body = await authorized.json()

    expect(unauthorized.status).toBe(401)
    expect(body.backups).toEqual([
      {
        id: 'backup:2026-04-27T02-00-00-000Z',
        createdAt: '2026-04-27T02:00:00.000Z',
        groupCount: 1,
        linkCount: 2,
      },
      {
        id: 'backup:2026-04-27T01-00-00-000Z',
        createdAt: '2026-04-27T01:00:00.000Z',
        groupCount: 1,
        linkCount: 1,
      },
    ])
  })

  test('downloads a backup JSON behind the admin token', async () => {
    const kv = new MemoryKv()

    await kv.put(
      'backup:2026-04-27T02-00-00-000Z',
      JSON.stringify(dashboard('Download me', 2)),
    )

    const unauthorized = await worker.fetch(
      new Request(
        'https://nav.example/api/backups/download?id=backup%3A2026-04-27T02-00-00-000Z',
      ),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const authorized = await worker.fetch(
      new Request(
        'https://nav.example/api/backups/download?id=backup%3A2026-04-27T02-00-00-000Z',
        {
          headers: { authorization: 'Bearer secret' },
        },
      ),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const body = await authorized.json()

    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(authorized.headers.get('content-disposition')).toBe(
      'attachment; filename="nav-backup-2026-04-27T02-00-00-000Z.json"',
    )
    expect(body.settings.title).toBe('Download me')
    expect(body.groups[0].links).toHaveLength(2)
  })

  test('restores a backup only after saving the current dashboard as a fresh backup', async () => {
    const kv = new MemoryKv()
    const waitUntil = vi.fn()

    await kv.put('dashboard', JSON.stringify(dashboard('Current', 1)))
    await kv.put(
      'backup:2026-04-27T02-00-00-000Z',
      JSON.stringify(dashboard('Restore me', 2)),
    )

    const response = await worker.fetch(
      new Request('https://nav.example/api/backups/restore', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id: 'backup:2026-04-27T02-00-00-000Z' }),
      }),
      env(kv),
      { waitUntil },
    )
    const restored = JSON.parse((await kv.get('dashboard')) ?? '{}')
    const currentBackup = JSON.parse(
      (await kv.get('backup:2026-04-27T03-00-00-000Z')) ?? '{}',
    )

    expect(response.status).toBe(200)
    expect(restored.settings.title).toBe('Restore me')
    expect(restored.updatedAt).toBe('2026-04-27T03:00:00.000Z')
    expect(currentBackup.settings.title).toBe('Current')
    expect(waitUntil).toHaveBeenCalled()
  })
})
