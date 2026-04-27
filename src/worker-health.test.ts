import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import worker from '../public/_worker.js'

type StoredValue = {
  value: string
  metadata?: unknown
}

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string }

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

  async list() {
    return { keys: [] }
  }
}

function dashboard() {
  return {
    version: 1,
    updatedAt: '2026-04-27T04:00:00.000Z',
    settings: {
      title: 'Health nav',
      theme: 'system',
    },
    groups: [
      {
        id: 'daily',
        name: 'Daily',
        links: [
          {
            id: 'a',
            title: 'A',
            url: 'https://a.example.com',
          },
          {
            id: 'b',
            title: 'B',
            url: 'https://b.example.com',
          },
        ],
      },
    ],
  }
}

describe('worker health api', () => {
  test('returns public deployment diagnostics without leaking the admin token', async () => {
    const kv = new MemoryKv()
    await kv.put('dashboard', JSON.stringify(dashboard()))

    const response = await worker.fetch(
      new Request('https://nav.example/api/health'),
      {
        STARTPAGE_KV: kv,
        ADMIN_TOKEN: 'secret',
        ASSETS: {
          fetch: vi.fn(async () => new Response('asset')),
        },
      },
      { waitUntil: vi.fn() },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      version: packageJson.version,
      worker: true,
      kvBound: true,
      adminTokenConfigured: true,
      dashboardExists: true,
      dashboardUpdatedAt: '2026-04-27T04:00:00.000Z',
      dashboardGroupCount: 1,
      dashboardLinkCount: 2,
    })
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})
