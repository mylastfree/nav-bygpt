const DASHBOARD_KEY = 'dashboard'
const BACKUP_PREFIX = 'backup:'
const MAX_BODY_BYTES = 10 * 1024 * 1024
const MAX_GROUPS = 500
const MAX_TOTAL_LINKS = 5000
const MAX_LINKS_PER_GROUP = 1000
const MAX_LINK_CHECKS = 50
const LINK_CHECK_TIMEOUT_MS = 6000
const LINK_CHECK_CONCURRENCY = 6
const BROKEN_HTTP_STATUS_CODES = [404, 410]

const CARD_LAYOUT_OPTIONS = ['comfortable', 'compact', 'list']
const GROUP_COLOR_OPTIONS = ['slate', 'blue', 'green', 'amber', 'rose', 'purple', 'teal']
const WALLPAPER_PRESET_OPTIONS = [
  'none',
  'paper',
  'dark-desk',
  'blue-gray',
  'soft-green',
  'warm-gray',
]
const WALLPAPER_INTENSITY_OPTIONS = ['normal', 'soft']

const defaultDashboard = {
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

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url)

    if (url.pathname === '/api/dashboard' && request.method === 'GET') {
      return readDashboard(env)
    }

    if (url.pathname === '/api/dashboard' && request.method === 'PUT') {
      return writeDashboard(request, env, context)
    }

    if (url.pathname === '/api/backups' && request.method === 'GET') {
      return listBackups(request, env)
    }

    if (url.pathname === '/api/backups/restore' && request.method === 'POST') {
      return restoreBackup(request, env, context)
    }

    if (url.pathname === '/api/link-check' && request.method === 'POST') {
      return checkLinks(request, env)
    }

    if (url.pathname.startsWith('/api/')) {
      return text('Not found.', 404)
    }

    return env.ASSETS.fetch(request)
  },
}

async function readDashboard(env) {
  if (!env.STARTPAGE_KV) {
    return json(defaultDashboard)
  }

  const raw = await env.STARTPAGE_KV.get(DASHBOARD_KEY)
  return json(raw ? JSON.parse(raw) : defaultDashboard)
}

async function writeDashboard(request, env, context) {
  const authError = requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return text('Dashboard JSON is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return text('Dashboard JSON is too large.', 413)
  }

  let parsed
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
    await env.STARTPAGE_KV.put(
      `${BACKUP_PREFIX}${updatedAt.replace(/[:.]/g, '-')}`,
      previous,
    )
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

async function listBackups(request, env) {
  const authError = requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const list = await env.STARTPAGE_KV.list({ prefix: BACKUP_PREFIX, limit: 1000 })
  const summaries = await Promise.all(
    list.keys.map(async (key) => {
      const raw = await env.STARTPAGE_KV.get(key.name)
      if (!raw) {
        return null
      }

      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }

      const validation = validateDashboard(parsed)
      if (!validation.ok) {
        return null
      }

      return {
        id: key.name,
        createdAt: backupCreatedAt(key.name),
        groupCount: validation.data.groups.length,
        linkCount: countLinks(validation.data),
      }
    }),
  )

  return json({
    backups: summaries.filter(Boolean).sort((a, b) => b.id.localeCompare(a.id)),
  })
}

async function restoreBackup(request, env, context) {
  const authError = requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return text('Restore request is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return text('Restore request is too large.', 413)
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return text('Invalid JSON.', 400)
  }

  if (!parsed || typeof parsed !== 'object') {
    return text('Invalid backup id.', 400)
  }

  const id = cleanText(parsed.id, 200)
  if (!id || !id.startsWith(BACKUP_PREFIX)) {
    return text('Invalid backup id.', 400)
  }

  const backup = await env.STARTPAGE_KV.get(id)
  if (!backup) {
    return text('Backup not found.', 404)
  }

  let backupData
  try {
    backupData = JSON.parse(backup)
  } catch {
    return text('Invalid backup data.', 400)
  }

  const validation = validateDashboard(backupData)
  if (!validation.ok) {
    return text(validation.error, 400)
  }

  const updatedAt = new Date().toISOString()
  const previous = await env.STARTPAGE_KV.get(DASHBOARD_KEY)
  if (previous) {
    await env.STARTPAGE_KV.put(
      `${BACKUP_PREFIX}${updatedAt.replace(/[:.]/g, '-')}`,
      previous,
    )
    context.waitUntil(trimBackups(env.STARTPAGE_KV))
  }

  const next = {
    ...validation.data,
    updatedAt,
  }

  await env.STARTPAGE_KV.put(DASHBOARD_KEY, JSON.stringify(next), {
    metadata: { updatedAt },
  })

  return json({
    mode: 'cloud',
    updatedAt,
  })
}

async function checkLinks(request, env) {
  const authError = requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return text('Link check request is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return text('Link check request is too large.', 413)
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return text('Invalid JSON.', 400)
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.links)) {
    return text('Links must be an array.', 400)
  }

  if (parsed.links.length > MAX_LINK_CHECKS) {
    return text(`Too many links. Max is ${MAX_LINK_CHECKS}.`, 400)
  }

  const links = []
  for (const item of parsed.links) {
    if (!item || typeof item !== 'object') {
      return text('Each link must be an object.', 400)
    }

    const id = cleanText(item.id, 80)
    const url = cleanText(item.url, 2048)

    if (!id) {
      return text('Invalid link id.', 400)
    }

    if (!isSafeUrl(url)) {
      return text(`Invalid URL: ${url || id}`, 400)
    }

    links.push({ id, url })
  }

  const checkedAt = new Date().toISOString()
  const results = await mapWithConcurrency(
    links,
    LINK_CHECK_CONCURRENCY,
    async (link) => ({
      id: link.id,
      url: link.url,
      check: await fetchLinkHealth(link.url, checkedAt),
    }),
  )

  return json({
    checkedAt,
    results,
  })
}

function validateDashboard(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Dashboard must be an object.' }
  }

  const groups = input.groups
  const settings = input.settings || {}

  if (!Array.isArray(groups)) {
    return { ok: false, error: 'Dashboard groups must be an array.' }
  }

  if (groups.length > MAX_GROUPS) {
    return { ok: false, error: `Too many groups. Max is ${MAX_GROUPS}.` }
  }

  const data = {
    version: 1,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    settings: {
      title: cleanText(settings.title, 80) || '我的导航',
      theme: ['light', 'dark', 'system'].includes(settings.theme)
        ? settings.theme
        : 'system',
      cardLayout: normalizeCardLayout(settings.cardLayout),
      wallpaper: normalizeWallpaper(settings.wallpaper),
    },
    groups: [],
  }
  const usedGroupIds = new Set()
  const usedLinkIds = new Set()
  let totalLinks = 0

  for (const group of groups) {
    if (!group || typeof group !== 'object') {
      return { ok: false, error: 'Each group must be an object.' }
    }

    if (!Array.isArray(group.links)) {
      return { ok: false, error: 'Each group needs a links array.' }
    }

    if (group.links.length > MAX_LINKS_PER_GROUP) {
      return {
        ok: false,
        error: `Too many links in one group. Max is ${MAX_LINKS_PER_GROUP}.`,
      }
    }

    totalLinks += group.links.length
    if (totalLinks > MAX_TOTAL_LINKS) {
      return { ok: false, error: `Too many links. Max is ${MAX_TOTAL_LINKS}.` }
    }

    const nextGroup = {
      id: createUniqueId('group', usedGroupIds, group.id),
      name: cleanText(group.name, 80) || '未命名分组',
      color: normalizeGroupColor(group.color),
      links: [],
    }

    for (const link of group.links) {
      if (!link || typeof link !== 'object') {
        return { ok: false, error: 'Each link must be an object.' }
      }

      const normalizedUrl = normalizeUrl(cleanText(link.url, 2048))
      const icon = cleanText(link.icon, 8192)

      if (!isSafeUrl(normalizedUrl)) {
        return {
          ok: false,
          error: `Invalid URL: ${cleanText(link.title, 80) || normalizedUrl}`,
        }
      }

      if (icon && !isSafeIcon(icon)) {
        return {
          ok: false,
          error: `Invalid icon URL: ${cleanText(link.title, 80) || normalizedUrl}`,
        }
      }

      nextGroup.links.push({
        id: createUniqueId('link', usedLinkIds, link.id),
        title: cleanText(link.title, 80) || hostnameFromUrl(normalizedUrl),
        url: normalizedUrl,
        icon: icon || undefined,
        clickCount: normalizeClickCount(link.clickCount),
        check: normalizeLinkHealth(link.check),
      })
    }

    data.groups.push(nextGroup)
  }

  return { ok: true, data }
}

function createId(prefix) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${random}`
}

function createUniqueId(prefix, usedIds, preferredId) {
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

function normalizeCardLayout(value) {
  return CARD_LAYOUT_OPTIONS.includes(value) ? value : 'comfortable'
}

function normalizeGroupColor(value) {
  return GROUP_COLOR_OPTIONS.includes(value) ? value : 'slate'
}

function normalizeWallpaper(value) {
  const wallpaper = value && typeof value === 'object' ? value : {}
  const preset = WALLPAPER_PRESET_OPTIONS.includes(wallpaper.preset)
    ? wallpaper.preset
    : 'none'
  const intensity = WALLPAPER_INTENSITY_OPTIONS.includes(wallpaper.intensity)
    ? wallpaper.intensity
    : 'normal'

  return {
    preset,
    intensity,
  }
}

function normalizeClickCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function normalizeLinkHealth(value) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const status = value.status
  const reason = cleanText(value.reason, 120)
  const checkedAt = typeof value.checkedAt === 'string' ? value.checkedAt : ''
  const confirmedAt =
    typeof value.confirmedAt === 'string' && value.confirmedAt
      ? value.confirmedAt
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

function normalizeUrl(value) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isSafeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isSafeIcon(value) {
  return isSafeUrl(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return '未命名网站'
  }
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function requireAdmin(request, env) {
  if (!env.STARTPAGE_KV) {
    return text('STARTPAGE_KV binding is not configured.', 500)
  }

  if (!env.ADMIN_TOKEN) {
    return text('ADMIN_TOKEN is not configured.', 500)
  }

  if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
    return text('Unauthorized.', 401)
  }

  return null
}

function countLinks(data) {
  return data.groups.reduce((total, group) => total + group.links.length, 0)
}

function backupCreatedAt(id) {
  const raw = id.slice(BACKUP_PREFIX.length)
  const match = raw.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/,
  )

  if (!match) {
    return raw
  }

  return `${match[1]}:${match[2]}:${match[3]}.${match[4]}`
}

async function trimBackups(kv) {
  const list = await kv.list({ prefix: BACKUP_PREFIX, limit: 1000 })
  const stale = list.keys
    .map((key) => key.name)
    .sort()
    .slice(0, Math.max(0, list.keys.length - 20))

  await Promise.all(stale.map((key) => kv.delete(key)))
}

async function fetchLinkHealth(url, checkedAt) {
  const headProbe = await fetchLinkProbe(url, 'HEAD')
  if (headProbe.type === 'http' && isHttpOk(headProbe.status)) {
    return probeToLinkHealth(headProbe, 'HEAD', checkedAt)
  }

  const getProbe = await fetchLinkProbe(url, 'GET')
  return probeToLinkHealth(getProbe, 'GET', checkedAt)
}

async function fetchLinkProbe(url, method) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINK_CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers:
        method === 'GET'
          ? {
              accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              range: 'bytes=0-0',
            }
          : undefined,
    })

    return {
      type: 'http',
      status: response.status,
    }
  } catch (error) {
    return {
      type: 'error',
      reason: error && error.name === 'AbortError' ? 'Timeout' : 'Fetch failed',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function probeToLinkHealth(probe, method, checkedAt) {
  if (probe.type === 'http') {
    return {
      status: linkHealthStatusFromHttp(probe.status),
      reason: `${method} HTTP ${probe.status}`,
      checkedAt,
    }
  }

  return {
    status: 'limited',
    reason: `${method} ${probe.reason}`,
    checkedAt,
  }
}

function linkHealthStatusFromHttp(status) {
  if (isHttpOk(status)) {
    return 'ok'
  }

  if (BROKEN_HTTP_STATUS_CODES.includes(status)) {
    return 'broken'
  }

  return 'limited'
}

function isHttpOk(status) {
  return status >= 200 && status < 400
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(limit, items.length)
  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index])
    }
  })

  await Promise.all(runners)
  return results
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function text(message, status) {
  return new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
