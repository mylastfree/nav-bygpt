type LinkHealth = {
  status: 'ok' | 'limited' | 'broken'
  reason: string
  checkedAt: string
  confirmedAt?: string
}

type DashboardData = {
  version: 1
  updatedAt: string
  settings: {
    title: string
    theme: 'light' | 'dark' | 'system'
    cardLayout?: 'comfortable' | 'compact' | 'list'
    wallpaper?: {
      preset: 'none' | 'paper' | 'dark-desk' | 'blue-gray' | 'soft-green' | 'warm-gray'
      intensity: 'normal' | 'soft'
    }
  }
  groups: Array<{
    id: string
    name: string
    color?: 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'purple' | 'teal'
    links: Array<{
      id: string
      title: string
      url: string
      icon?: string
      clickCount?: number
      check?: LinkHealth
    }>
  }>
}

type KVNamespace = {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { metadata?: Record<string, unknown> },
  ): Promise<void>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>
  }>
}

type Env = {
  STARTPAGE_KV?: KVNamespace
  ADMIN_TOKEN?: string
}

type PagesContext = {
  request: Request
  env: Env
  waitUntil: (promise: Promise<unknown>) => void
}

const DASHBOARD_KEY = 'dashboard'
const BACKUP_PREFIX = 'backup:'
const MAX_BODY_BYTES = 10 * 1024 * 1024
const MAX_GROUPS = 500
const MAX_TOTAL_LINKS = 5000
const MAX_LINKS_PER_GROUP = 1000

const CARD_LAYOUT_OPTIONS = ['comfortable', 'compact', 'list'] as const
const GROUP_COLOR_OPTIONS = ['slate', 'blue', 'green', 'amber', 'rose', 'purple', 'teal'] as const
const WALLPAPER_PRESET_OPTIONS = [
  'none',
  'paper',
  'dark-desk',
  'blue-gray',
  'soft-green',
  'warm-gray',
] as const
const WALLPAPER_INTENSITY_OPTIONS = ['normal', 'soft'] as const

const defaultDashboard: DashboardData = {
  version: 1,
  updatedAt: new Date().toISOString(),
  settings: {
    title: '我的导航',
    theme: 'system',
    cardLayout: 'comfortable',
    wallpaper: {
      preset: 'none',
      intensity: 'normal',
    },
  },
  groups: [
    {
      id: 'daily',
      name: '常用',
      color: 'blue',
      links: [
        {
          id: 'cloudflare',
          title: 'Cloudflare',
          url: 'https://dash.cloudflare.com',
          clickCount: 0,
        },
        {
          id: 'github',
          title: 'GitHub',
          url: 'https://github.com',
          clickCount: 0,
        },
      ],
    },
  ],
}

export async function onRequestGet({ env }: PagesContext) {
  if (!env.STARTPAGE_KV) {
    return json(defaultDashboard)
  }

  const raw = await env.STARTPAGE_KV.get(DASHBOARD_KEY)
  return json(raw ? JSON.parse(raw) : defaultDashboard)
}

export async function onRequestPut(context: PagesContext) {
  const { request, env } = context

  if (!env.STARTPAGE_KV) {
    return text('STARTPAGE_KV binding is not configured.', 500)
  }

  if (!env.ADMIN_TOKEN) {
    return text('ADMIN_TOKEN is not configured.', 500)
  }

  if (!isAuthorized(request, env.ADMIN_TOKEN)) {
    return text('Unauthorized.', 401)
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return text('Dashboard JSON is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return text('Dashboard JSON is too large.', 413)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return text('Invalid JSON.', 400)
  }

  const validation = validateDashboard(parsed)
  if (!validation.ok) {
    return text(validation.error, 400)
  }

  const updatedAt = new Date().toISOString()
  const next = {
    ...validation.data,
    updatedAt,
  }
  const previous = await env.STARTPAGE_KV.get(DASHBOARD_KEY)

  if (previous) {
    await env.STARTPAGE_KV.put(`${BACKUP_PREFIX}${updatedAt.replace(/[:.]/g, '-')}`, previous)
    context.waitUntil(trimBackups(env.STARTPAGE_KV))
  }

  await env.STARTPAGE_KV.put(DASHBOARD_KEY, JSON.stringify(next), {
    metadata: { updatedAt },
  })

  return json({
    mode: 'cloud',
    updatedAt,
  })
}

function isAuthorized(request: Request, adminToken: string) {
  const expected = `Bearer ${adminToken}`
  return request.headers.get('authorization') === expected
}

function validateDashboard(input: unknown):
  | { ok: true; data: DashboardData }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Dashboard must be an object.' }
  }

  const record = input as Record<string, unknown>
  const groups = record.groups
  const settings = (record.settings || {}) as Record<string, unknown>

  if (!Array.isArray(groups)) {
    return { ok: false, error: 'Dashboard groups must be an array.' }
  }

  if (groups.length > MAX_GROUPS) {
    return { ok: false, error: `Too many groups. Max is ${MAX_GROUPS}.` }
  }

  const theme = settings.theme
  const data: DashboardData = {
    version: 1,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    settings: {
      title: cleanText(settings.title, 80) || '我的导航',
      theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
      cardLayout: normalizeCardLayout(settings.cardLayout),
      wallpaper: normalizeWallpaper(settings.wallpaper),
    },
    groups: [],
  }
  const usedGroupIds = new Set<string>()
  const usedLinkIds = new Set<string>()
  let totalLinks = 0

  for (const group of groups) {
    if (!group || typeof group !== 'object') {
      return { ok: false, error: 'Each group must be an object.' }
    }

    const groupRecord = group as Record<string, unknown>
    const links = groupRecord.links

    if (!Array.isArray(links)) {
      return { ok: false, error: 'Each group needs a links array.' }
    }

    if (links.length > MAX_LINKS_PER_GROUP) {
      return {
        ok: false,
        error: `Too many links in one group. Max is ${MAX_LINKS_PER_GROUP}.`,
      }
    }

    totalLinks += links.length
    if (totalLinks > MAX_TOTAL_LINKS) {
      return { ok: false, error: `Too many links. Max is ${MAX_TOTAL_LINKS}.` }
    }

    const nextGroup: DashboardData['groups'][number] = {
      id: createUniqueId('group', usedGroupIds, groupRecord.id),
      name: cleanText(groupRecord.name, 80) || '未命名分组',
      color: normalizeGroupColor(groupRecord.color),
      links: [],
    }

    for (const link of links) {
      if (!link || typeof link !== 'object') {
        return { ok: false, error: 'Each link must be an object.' }
      }

      const linkRecord = link as Record<string, unknown>
      const normalizedUrl = normalizeUrl(cleanText(linkRecord.url, 2048))
      const icon = cleanText(linkRecord.icon, 8192)

      if (!isSafeUrl(normalizedUrl)) {
        return {
          ok: false,
          error: `Invalid URL: ${cleanText(linkRecord.title, 80) || normalizedUrl}`,
        }
      }

      if (icon && !isSafeIcon(icon)) {
        return {
          ok: false,
          error: `Invalid icon URL: ${cleanText(linkRecord.title, 80) || normalizedUrl}`,
        }
      }

      nextGroup.links.push({
        id: createUniqueId('link', usedLinkIds, linkRecord.id),
        title: cleanText(linkRecord.title, 80) || hostnameFromUrl(normalizedUrl),
        url: normalizedUrl,
        icon: icon || undefined,
        clickCount: normalizeClickCount(linkRecord.clickCount),
        check: normalizeLinkHealth(linkRecord.check),
      })
    }

    data.groups.push(nextGroup)
  }

  return { ok: true, data }
}

function createId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${random}`
}

function createUniqueId(prefix: string, usedIds: Set<string>, preferredId: unknown) {
  const normalized = cleanText(preferredId, 80)

  if (normalized && !usedIds.has(normalized)) {
    usedIds.add(normalized)
    return normalized
  }

  let generated = createId(prefix)
  while (usedIds.has(generated)) {
    generated = createId(prefix)
  }

  usedIds.add(generated)
  return generated
}

function normalizeCardLayout(value: unknown): NonNullable<DashboardData['settings']['cardLayout']> {
  return CARD_LAYOUT_OPTIONS.includes(
    value as NonNullable<DashboardData['settings']['cardLayout']>,
  )
    ? (value as NonNullable<DashboardData['settings']['cardLayout']>)
    : 'comfortable'
}

function normalizeGroupColor(value: unknown): NonNullable<DashboardData['groups'][number]['color']> {
  return GROUP_COLOR_OPTIONS.includes(
    value as NonNullable<DashboardData['groups'][number]['color']>,
  )
    ? (value as NonNullable<DashboardData['groups'][number]['color']>)
    : 'slate'
}

function normalizeWallpaper(value: unknown): NonNullable<DashboardData['settings']['wallpaper']> {
  const wallpaper = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const preset = WALLPAPER_PRESET_OPTIONS.includes(
    wallpaper.preset as NonNullable<DashboardData['settings']['wallpaper']>['preset'],
  )
    ? (wallpaper.preset as NonNullable<DashboardData['settings']['wallpaper']>['preset'])
    : 'none'
  const intensity = WALLPAPER_INTENSITY_OPTIONS.includes(
    wallpaper.intensity as NonNullable<DashboardData['settings']['wallpaper']>['intensity'],
  )
    ? (wallpaper.intensity as NonNullable<DashboardData['settings']['wallpaper']>['intensity'])
    : 'normal'

  return {
    preset,
    intensity,
  }
}

function normalizeClickCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function normalizeLinkHealth(value: unknown): LinkHealth | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const health = value as Record<string, unknown>
  const status = health.status
  const reason = cleanText(health.reason, 120)
  const checkedAt = typeof health.checkedAt === 'string' ? health.checkedAt : ''
  const confirmedAt =
    typeof health.confirmedAt === 'string' && health.confirmedAt
      ? health.confirmedAt
      : undefined

  if (
    (status !== 'ok' && status !== 'limited' && status !== 'broken') ||
    !checkedAt
  ) {
    return undefined
  }

  return {
    status,
    reason,
    checkedAt,
    confirmedAt,
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isSafeUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafeIcon(value: string) {
  return isSafeUrl(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return '未命名网站'
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

async function trimBackups(kv: KVNamespace) {
  const list = await kv.list({ prefix: BACKUP_PREFIX, limit: 1000 })
  const stale = list.keys
    .map((key) => key.name)
    .sort()
    .slice(0, Math.max(0, list.keys.length - 20))

  await Promise.all(stale.map((key) => kv.delete(key)))
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
