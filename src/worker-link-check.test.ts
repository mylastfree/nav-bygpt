import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import worker from '../public/_worker.js'

class MemoryKv {
  put = vi.fn()

  async get() {
    return null
  }

  async list() {
    return { keys: [] }
  }
}

function env(kv = new MemoryKv()) {
  return {
    STARTPAGE_KV: kv,
    ADMIN_TOKEN: 'secret',
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset')),
    },
  }
}

function checkRequest(body: unknown, token = 'secret') {
  return new Request('https://nav.example/api/link-check', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('worker link check api', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T04:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('checks links behind the admin token without writing KV', async () => {
    const kv = new MemoryKv()
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/limited')) {
        return new Response(null, { status: 403 })
      }

      if (url.includes('/missing')) {
        return new Response(null, { status: 404 })
      }

      return new Response(null, { status: 204 })
    })

    vi.stubGlobal('fetch', fetchSpy)

    const unauthorized = await worker.fetch(
      checkRequest({ links: [{ id: 'ok', url: 'https://example.com' }] }, 'wrong'),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const authorized = await worker.fetch(
      checkRequest({
        links: [
          { id: 'ok', url: 'https://example.com' },
          { id: 'limited', url: 'https://example.com/limited' },
          { id: 'missing', url: 'https://example.com/missing' },
        ],
      }),
      env(kv),
      { waitUntil: vi.fn() },
    )
    const body = await authorized.json()

    expect(unauthorized.status).toBe(401)
    expect(authorized.status).toBe(200)
    expect(body).toEqual({
      checkedAt: '2026-04-27T04:00:00.000Z',
      results: [
        {
          id: 'ok',
          url: 'https://example.com',
          check: {
            status: 'ok',
            reason: 'HEAD HTTP 204',
            checkedAt: '2026-04-27T04:00:00.000Z',
          },
        },
        {
          id: 'limited',
          url: 'https://example.com/limited',
          check: {
            status: 'limited',
            reason: 'GET HTTP 403',
            checkedAt: '2026-04-27T04:00:00.000Z',
          },
        },
        {
          id: 'missing',
          url: 'https://example.com/missing',
          check: {
            status: 'broken',
            reason: 'GET HTTP 404',
            checkedAt: '2026-04-27T04:00:00.000Z',
          },
        },
      ],
    })
    expect(fetchSpy).toHaveBeenCalledTimes(5)
    expect(kv.put).not.toHaveBeenCalled()
  })

  test('falls back to GET before marking HEAD failures as broken', async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method

      if (url.includes('/head-404-get-ok')) {
        return new Response(null, { status: method === 'HEAD' ? 404 : 200 })
      }

      if (url.includes('/server-error')) {
        return new Response(null, { status: 500 })
      }

      return new Response(null, { status: 204 })
    })

    vi.stubGlobal('fetch', fetchSpy)

    const response = await worker.fetch(
      checkRequest({
        links: [
          { id: 'head-only', url: 'https://example.com/head-404-get-ok' },
          { id: 'server-error', url: 'https://example.com/server-error' },
        ],
      }),
      env(),
      { waitUntil: vi.fn() },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results).toEqual([
      {
        id: 'head-only',
        url: 'https://example.com/head-404-get-ok',
        check: {
          status: 'ok',
          reason: 'GET HTTP 200',
          checkedAt: '2026-04-27T04:00:00.000Z',
        },
      },
      {
        id: 'server-error',
        url: 'https://example.com/server-error',
        check: {
          status: 'limited',
          reason: 'GET HTTP 500',
          checkedAt: '2026-04-27T04:00:00.000Z',
        },
      },
    ])
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  test('rejects invalid URLs and oversized batches before fetching', async () => {
    const fetchSpy = vi.fn()

    vi.stubGlobal('fetch', fetchSpy)

    const invalid = await worker.fetch(
      checkRequest({ links: [{ id: 'bad', url: 'javascript:alert(1)' }] }),
      env(),
      { waitUntil: vi.fn() },
    )
    const tooMany = await worker.fetch(
      checkRequest({
        links: Array.from({ length: 101 }, (_, index) => ({
          id: `link-${index}`,
          url: `https://example${index}.com`,
        })),
      }),
      env(),
      { waitUntil: vi.fn() },
    )

    expect(invalid.status).toBe(400)
    expect(await invalid.text()).toContain('Invalid URL')
    expect(tooMany.status).toBe(400)
    expect(await tooMany.text()).toContain('Too many links')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
