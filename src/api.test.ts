import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  LOCAL_ADMIN_TOKEN_KEY,
  LOCAL_ADMIN_TOKEN_REMEMBER_KEY,
  LOCAL_DASHBOARD_KEY,
} from './dashboard'
import {
  checkLinks,
  clearAdminToken,
  downloadBackup,
  loadHealth,
  loadAdminToken,
  loadAdminTokenMode,
  loadBackups,
  restoreBackup,
  saveAdminToken,
  saveDashboard,
} from './api'
import type { BackupSummary, DashboardData, LinkCheckResult } from './types'

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

function stubSessionStorage(store: Record<string, string>) {
  vi.stubGlobal('sessionStorage', {
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

  test('loads backup summaries with bearer admin token', async () => {
    const backups: BackupSummary[] = [
      {
        id: 'backup:2026-04-27T00-00-00-000Z',
        createdAt: '2026-04-27T00:00:00.000Z',
        groupCount: 1,
        linkCount: 2,
      },
    ]
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ backups }), { status: 200 })
    })

    vi.stubGlobal('fetch', fetchSpy)

    await expect(loadBackups('secret')).resolves.toEqual(backups)
    expect(fetchSpy).toHaveBeenCalledWith('/api/backups', {
      headers: {
        accept: 'application/json',
        authorization: 'Bearer secret',
      },
    })
  })

  test('loads public deployment health diagnostics', async () => {
    const health = {
      ok: true,
      version: '0.0.16',
      worker: true,
      kvBound: true,
      adminTokenConfigured: true,
      dashboardExists: true,
      dashboardUpdatedAt: '2026-04-27T00:00:00.000Z',
      dashboardGroupCount: 1,
      dashboardLinkCount: 2,
    }
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify(health), { status: 200 })
    })

    vi.stubGlobal('fetch', fetchSpy)

    await expect(loadHealth()).resolves.toEqual(health)
    expect(fetchSpy).toHaveBeenCalledWith('/api/health', {
      headers: {
        accept: 'application/json',
      },
    })
  })

  test('downloads backup JSON with bearer admin token', async () => {
    const backup = dashboardWith('https://github.com')
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify(backup), { status: 200 })
    })

    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      downloadBackup('backup:2026-04-27T00-00-00-000Z', 'secret'),
    ).resolves.toMatchObject({
      settings: {
        title: 'Stored nav',
      },
      groups: [
        {
          links: [
            {
              url: 'https://github.com',
            },
          ],
        },
      ],
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/backups/download?id=backup%3A2026-04-27T00-00-00-000Z',
      {
        headers: {
          accept: 'application/json',
          authorization: 'Bearer secret',
        },
      },
    )
  })

  test('restores a backup through the protected Cloudflare endpoint', async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          mode: 'cloud',
          updatedAt: '2026-04-27T00:00:01.000Z',
        }),
        { status: 200 },
      )
    })

    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      restoreBackup('backup:2026-04-27T00-00-00-000Z', 'secret'),
    ).resolves.toEqual({
      mode: 'cloud',
      updatedAt: '2026-04-27T00:00:01.000Z',
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/backups/restore', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 'backup:2026-04-27T00-00-00-000Z' }),
    })
  })

  test('checks links through the protected Cloudflare endpoint', async () => {
    const results: LinkCheckResult[] = [
      {
        id: 'github',
        url: 'https://github.com',
        check: {
          status: 'ok',
          reason: 'HTTP 200',
          checkedAt: '2026-04-27T00:00:01.000Z',
        },
      },
    ]
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          checkedAt: '2026-04-27T00:00:01.000Z',
          results,
        }),
        { status: 200 },
      )
    })

    vi.stubGlobal('fetch', fetchSpy)

    await expect(
      checkLinks([{ id: 'github', url: 'https://github.com' }], 'secret'),
    ).resolves.toEqual({
      checkedAt: '2026-04-27T00:00:01.000Z',
      results,
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/link-check', {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        links: [{ id: 'github', url: 'https://github.com' }],
      }),
    })
  })

  test('stores the admin token only for the current session by default', () => {
    const localStore: Record<string, string> = {}
    const sessionStore: Record<string, string> = {}

    stubLocalStorage(localStore)
    stubSessionStorage(sessionStore)

    saveAdminToken('secret', 'session')

    expect(loadAdminToken()).toBe('secret')
    expect(loadAdminTokenMode()).toBe('session')
    expect(sessionStore[LOCAL_ADMIN_TOKEN_KEY]).toBe('secret')
    expect(localStore[LOCAL_ADMIN_TOKEN_KEY]).toBeUndefined()
    expect(localStore[LOCAL_ADMIN_TOKEN_REMEMBER_KEY]).toBe('session')
  })

  test('remembers the admin token on this device only when requested', () => {
    const localStore: Record<string, string> = {}
    const sessionStore: Record<string, string> = {}

    stubLocalStorage(localStore)
    stubSessionStorage(sessionStore)

    saveAdminToken('secret', 'device')

    expect(loadAdminToken()).toBe('secret')
    expect(loadAdminTokenMode()).toBe('device')
    expect(sessionStore[LOCAL_ADMIN_TOKEN_KEY]).toBe('secret')
    expect(localStore[LOCAL_ADMIN_TOKEN_KEY]).toBe('secret')
    expect(localStore[LOCAL_ADMIN_TOKEN_REMEMBER_KEY]).toBe('device')
  })

  test('loads and clears older remembered admin tokens from both storage areas', () => {
    const localStore: Record<string, string> = {
      [LOCAL_ADMIN_TOKEN_KEY]: 'old-secret',
    }
    const sessionStore: Record<string, string> = {}

    stubLocalStorage(localStore)
    stubSessionStorage(sessionStore)

    expect(loadAdminToken()).toBe('old-secret')
    expect(loadAdminTokenMode()).toBe('device')

    clearAdminToken()

    expect(loadAdminToken()).toBe('')
    expect(sessionStore[LOCAL_ADMIN_TOKEN_KEY]).toBeUndefined()
    expect(localStore[LOCAL_ADMIN_TOKEN_KEY]).toBeUndefined()
    expect(localStore[LOCAL_ADMIN_TOKEN_REMEMBER_KEY]).toBeUndefined()
  })
})
