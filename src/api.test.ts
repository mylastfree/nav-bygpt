import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LOCAL_DASHBOARD_KEY } from './dashboard'
import { saveDashboard } from './api'
import type { DashboardData } from './types'

function dashboardWith(url: string): DashboardData {
  return {
    version: 1,
    updatedAt: '2026-04-27T00:00:00.000Z',
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
            url,
          },
        ],
      },
    ],
  }
}

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = value
    },
    removeItem(key: string) {
      delete store[key]
    },
  })
}

describe('cloud dashboard api', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('saves with bearer admin token and caches the sanitized dashboard after success', async () => {
    const store: Record<string, string> = {}
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          mode: 'cloud',
          updatedAt: '2026-04-27T00:00:01.000Z',
        }),
        { status: 200 },
      )
    })

    stubLocalStorage(store)
    vi.stubGlobal('fetch', fetchSpy)

    const result = await saveDashboard(dashboardWith('github.com'), 'secret')
    const request = fetchSpy.mock.calls[0]
    const stored = JSON.parse(store[LOCAL_DASHBOARD_KEY]) as DashboardData

    expect(result).toEqual({
      mode: 'cloud',
      updatedAt: '2026-04-27T00:00:01.000Z',
    })
    expect(request[0]).toBe('/api/dashboard')
    expect(request[1]).toMatchObject({
      method: 'PUT',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
    })
    expect(stored.groups[0].links[0].url).toBe('https://github.com')
    expect(stored.groups[0].links[0].clickCount).toBe(0)
  })

  test('rejects invalid URLs before writing local cache or calling the API', async () => {
    const store: Record<string, string> = {}
    const fetchSpy = vi.fn()

    stubLocalStorage(store)
    vi.stubGlobal('fetch', fetchSpy)

    await expect(saveDashboard(dashboardWith('javascript:alert(1)'), 'secret')).rejects.toThrow(
      '存在无效网址',
    )

    expect(store[LOCAL_DASHBOARD_KEY]).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('requires an admin token before saving to the public Cloudflare endpoint', async () => {
    const store: Record<string, string> = {}
    const fetchSpy = vi.fn()

    stubLocalStorage(store)
    vi.stubGlobal('fetch', fetchSpy)

    await expect(saveDashboard(dashboardWith('https://github.com'), '')).rejects.toThrow(
      '请输入管理员密码',
    )

    expect(store[LOCAL_DASHBOARD_KEY]).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
