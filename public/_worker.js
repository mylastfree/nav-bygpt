const DASHBOARD_KEY = 'dashboard'
const BACKUP_PREFIX = 'backup:'
const ADMIN_CREDENTIAL_KEY = 'admin:credential'
const APP_VERSION = '0.0.23'
const MAX_BODY_BYTES = 10 * 1024 * 1024
const MAX_PASSWORD_BODY_BYTES = 16 * 1024
const MAX_PASSWORD_LENGTH = 256
const ADMIN_PASSWORD_ALGORITHM = 'PBKDF2-SHA-256'
const ADMIN_PASSWORD_ITERATIONS = 100000
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

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return health(env)
    }

    if (url.pathname === '/api/backups' && request.method === 'GET') {
      return listBackups(request, env)
    }

    if (url.pathname === '/api/backups/download' && request.method === 'GET') {
      return downloadBackup(request, env)
    }

    if (url.pathname === '/api/backups/restore' && request.method === 'POST') {
      return restoreBackup(request, env, context)
    }

    if (url.pathname === '/api/link-click' && request.method === 'POST') {
      return recordLinkClick(request, env)
    }

    if (url.pathname === '/api/link-check' && request.method === 'POST') {
      return checkLinks(request, env)
    }

    if (url.pathname === '/api/admin/password' && request.method === 'POST') {
      return changeAdminPassword(request, env)
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
  const authError = await requireAdmin(request, env)
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

async function health(env) {
  const kvBound = Boolean(env.STARTPAGE_KV)
  const adminTokenConfigured = Boolean(env.ADMIN_TOKEN)
  let adminPasswordSource = adminTokenConfigured ? 'env' : 'none'
  let dashboardExists = false
  let dashboardUpdatedAt = ''
  let dashboardGroupCount = 0
  let dashboardLinkCount = 0
  let onlineCredentialConfigured = false

  if (kvBound) {
    onlineCredentialConfigured = Boolean(await readAdminCredential(env))
    adminPasswordSource = onlineCredentialConfigured
      ? 'kv'
      : adminTokenConfigured
        ? 'env'
        : 'none'

    const raw = await env.STARTPAGE_KV.get(DASHBOARD_KEY)
    dashboardExists = Boolean(raw)

    if (raw) {
      try {
        const validation = validateDashboard(JSON.parse(raw))

        if (validation.ok) {
          dashboardUpdatedAt = validation.data.updatedAt
          dashboardGroupCount = validation.data.groups.length
          dashboardLinkCount = countLinks(validation.data)
        }
      } catch {
        // Keep diagnostics public and non-fatal even if dashboard JSON is corrupt.
      }
    }
  }

  return json({
    ok: kvBound && (adminTokenConfigured || onlineCredentialConfigured),
    version: APP_VERSION,
    worker: true,
    kvBound,
    adminTokenConfigured,
    adminPasswordSource,
    dashboardExists,
    dashboardUpdatedAt,
    dashboardGroupCount,
    dashboardLinkCount,
  })
}

async function changeAdminPassword(request, env) {
  const authError = await requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_PASSWORD_BODY_BYTES) {
    return text('Password request is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_PASSWORD_BODY_BYTES) {
    return text('Password request is too large.', 413)
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return text('Invalid JSON.', 400)
  }

  const currentPassword =
    typeof parsed?.currentPassword === 'string' ? parsed.currentPassword.trim() : ''
  const newPassword =
    typeof parsed?.newPassword === 'string' ? parsed.newPassword.trim() : ''

  if (!currentPassword) {
    return text('Current admin password is required.', 400)
  }

  if (newPassword.length < 8) {
    return text('New admin password must be at least 8 characters.', 400)
  }

  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return text('New admin password is too long.', 400)
  }

  if (!(await verifyEffectiveAdminPassword(currentPassword, env))) {
    return text('Unauthorized.', 401)
  }

  const updatedAt = new Date().toISOString()
  const credential = await createAdminCredential(newPassword, updatedAt)
  await env.STARTPAGE_KV.put(ADMIN_CREDENTIAL_KEY, JSON.stringify(credential), {
    metadata: { updatedAt },
  })

  return json({
    mode: 'cloud',
    updatedAt,
    adminPasswordSource: 'kv',
  })
}

async function listBackups(request, env) {
  const authError = await requireAdmin(request, env)
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

async function downloadBackup(request, env) {
  const authError = await requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const url = new URL(request.url)
  const id = cleanText(url.searchParams.get('id'), 200)
  if (!id || !id.startsWith(BACKUP_PREFIX)) {
    return text('Invalid backup id.', 400)
  }

  const backup = await env.STARTPAGE_KV.get(id)
  if (!backup) {
    return text('Backup not found.', 404)
  }

  let parsed
  try {
    parsed = JSON.parse(backup)
  } catch {
    return text('Invalid backup data.', 400)
  }

  const validation = validateDashboard(parsed)
  if (!validation.ok) {
    return text(validation.error, 400)
  }

  return json(validation.data, 200, {
    'content-disposition': `attachment; filename="${backupFileName(id)}"`,
  })
}

async function restoreBackup(request, env, context) {
  const authError = await requireAdmin(request, env)
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

async function recordLinkClick(request, env) {
  const authError = await requireAdmin(request, env)
  if (authError) {
    return authError
  }

  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > MAX_BODY_BYTES) {
    return text('Link click request is too large.', 413)
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return text('Link click request is too large.', 413)
  }

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return text('Invalid JSON.', 400)
  }

  if (!parsed || typeof parsed !== 'object') {
    return text('Invalid link click request.', 400)
  }

  const groupId = cleanText(parsed.groupId, 80)
  const linkId = cleanText(parsed.linkId, 80)
  if (!groupId || !linkId) {
    return text('Invalid link id.', 400)
  }

  const raw = await env.STARTPAGE_KV.get(DASHBOARD_KEY)
  if (!raw) {
    return text('Dashboard not found.', 404)
  }

  let parsedDashboard
  try {
    parsedDashboard = JSON.parse(raw)
  } catch {
    return text('Invalid dashboard data.', 400)
  }

  const validation = validateDashboard(parsedDashboard)
  if (!validation.ok) {
    return text(validation.error, 400)
  }

  let found = false
  const updatedAt = new Date().toISOString()
  const next = {
    ...validation.data,
    updatedAt,
    groups: validation.data.groups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            links: group.links.map((link) => {
              if (link.id !== linkId) {
                return link
              }

              found = true
              return {
                ...link,
                clickCount: normalizeClickCount(link.clickCount) + 1,
              }
            }),
          }
        : group,
    ),
  }

  if (!found) {
    return text('Link not found.', 404)
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
  const authError = await requireAdmin(request, env)
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

async function requireAdmin(request, env) {
  if (!env.STARTPAGE_KV) {
    return text('STARTPAGE_KV binding is not configured.', 500)
  }

  if (!(await hasAdminPassword(env))) {
    return text('Admin password is not configured.', 500)
  }

  const token = readBearerToken(request)
  if (!token || !(await verifyEffectiveAdminPassword(token, env))) {
    return text('Unauthorized.', 401)
  }

  return null
}

async function hasAdminPassword(env) {
  return Boolean(env.ADMIN_TOKEN || (await readAdminCredential(env)))
}

function readBearerToken(request) {
  const header = request.headers.get('authorization') || ''
  const prefix = 'Bearer '

  return header.startsWith(prefix) ? header.slice(prefix.length).trim() : ''
}

async function verifyEffectiveAdminPassword(password, env) {
  if (!env.STARTPAGE_KV) {
    return false
  }

  const credential = await readAdminCredential(env)
  const matchesOnlinePassword = credential
    ? await verifyAdminCredential(password, credential)
    : false
  const matchesRescuePassword = env.ADMIN_TOKEN
    ? constantTimeEqualText(password, env.ADMIN_TOKEN)
    : false

  return matchesOnlinePassword || matchesRescuePassword
}

async function readAdminCredential(env) {
  if (!env.STARTPAGE_KV) {
    return null
  }

  const raw = await env.STARTPAGE_KV.get(ADMIN_CREDENTIAL_KEY)
  if (!raw) {
    return null
  }

  try {
    const credential = JSON.parse(raw)
    if (
      credential?.algorithm !== ADMIN_PASSWORD_ALGORITHM ||
      typeof credential.salt !== 'string' ||
      typeof credential.hash !== 'string' ||
      !Number.isInteger(credential.iterations) ||
      credential.iterations < 1
    ) {
      return null
    }

    return credential
  } catch {
    return null
  }
}

async function createAdminCredential(password, updatedAt) {
  const salt = new Uint8Array(16)
  crypto.getRandomValues(salt)
  const hash = await derivePasswordHash(password, salt, ADMIN_PASSWORD_ITERATIONS)

  return {
    algorithm: ADMIN_PASSWORD_ALGORITHM,
    iterations: ADMIN_PASSWORD_ITERATIONS,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    updatedAt,
  }
}

async function verifyAdminCredential(password, credential) {
  try {
    const salt = base64ToBytes(credential.salt)
    const expectedHash = base64ToBytes(credential.hash)
    const actualHash = await derivePasswordHash(password, salt, credential.iterations)

    return constantTimeEqualBytes(actualHash, expectedHash)
  } catch {
    return false
  }
}

async function derivePasswordHash(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    256,
  )

  return new Uint8Array(derivedBits)
}

function constantTimeEqualText(left, right) {
  return constantTimeEqualBytes(
    new TextEncoder().encode(left),
    new TextEncoder().encode(right),
  )
}

function constantTimeEqualBytes(left, right) {
  const length = Math.max(left.length, right.length)
  let diff = left.length ^ right.length

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] || 0) ^ (right[index] || 0)
  }

  return diff === 0
}

function bytesToBase64(bytes) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  if (typeof btoa === 'function') {
    return btoa(binary)
  }

  return Buffer.from(binary, 'binary').toString('base64')
}

function base64ToBytes(value) {
  const binary =
    typeof atob === 'function'
      ? atob(value)
      : Buffer.from(value, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
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

function backupFileName(id) {
  return `nav-backup-${id.slice(BACKUP_PREFIX.length).replace(/[^a-zA-Z0-9._-]/g, '-')}.json`
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

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
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
