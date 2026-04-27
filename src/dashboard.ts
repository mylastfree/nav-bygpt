import type {
  CardLayout,
  DashboardData,
  GroupColor,
  LinkGroup,
  LinkHealth,
  LinkItem,
  WallpaperIntensity,
  WallpaperPreset,
  WallpaperSettings,
} from './types'
import type { DashboardSettings } from './types'

export const LOCAL_DASHBOARD_KEY = 'cf-startpage-dashboard'
export const LOCAL_ADMIN_TOKEN_KEY = 'cf-startpage-admin-token'
export const LOCAL_ADMIN_TOKEN_REMEMBER_KEY = 'cf-startpage-admin-token-remember'
export const CARD_LAYOUT_OPTIONS: CardLayout[] = ['comfortable', 'compact', 'list']
export const GROUP_COLOR_OPTIONS: GroupColor[] = [
  'slate',
  'blue',
  'green',
  'amber',
  'rose',
  'purple',
  'teal',
]
export const WALLPAPER_PRESET_OPTIONS: WallpaperPreset[] = [
  'none',
  'paper',
  'dark-desk',
  'blue-gray',
  'soft-green',
  'warm-gray',
]
export const WALLPAPER_INTENSITY_OPTIONS: WallpaperIntensity[] = ['normal', 'soft']

export const sampleDashboard: DashboardData = {
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
          id: 'chatgpt',
          title: 'ChatGPT',
          url: 'https://chatgpt.com',
        },
        {
          id: 'github',
          title: 'GitHub',
          url: 'https://github.com',
        },
        {
          id: 'gmail',
          title: 'Gmail',
          url: 'https://mail.google.com',
        },
      ],
    },
    {
      id: 'tools',
      name: '工具',
      color: 'teal',
      links: [
        {
          id: 'workers-docs',
          title: 'Workers Docs',
          url: 'https://developers.cloudflare.com/workers/',
        },
        {
          id: 'pages-docs',
          title: 'Pages Docs',
          url: 'https://developers.cloudflare.com/pages/',
        },
      ],
    },
  ],
}

export function createId(prefix: string) {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${random}`
}

export function normalizeUrl(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

export function getHostname(value: string) {
  try {
    return new URL(normalizeUrl(value)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function faviconUrl(value: string) {
  const hostname = getHostname(value)

  if (!hostname) {
    return ''
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    hostname,
  )}&sz=64`
}

export function createEmptyGroup(): LinkGroup {
  return {
    id: createId('group'),
    name: '新分组',
    color: 'slate',
    links: [],
  }
}

export function createEmptyLink(): LinkItem {
  return {
    id: createId('link'),
    title: '新网站',
    url: 'https://example.com',
    clickCount: 0,
  }
}

export function createGroupFromName(name: string): LinkGroup {
  return {
    ...createEmptyGroup(),
    name: name.trim() || '新分组',
  }
}

export function createLinkFromInput(input: {
  title: string
  url: string
  icon: string
}): LinkItem {
  const icon = input.icon.trim()

  return {
    id: createId('link'),
    title: input.title.trim() || '新网站',
    url: normalizeUrl(input.url),
    icon: icon || undefined,
    clickCount: 0,
  }
}

export function moveItem<T>(items: T[], fromIndex: number, direction: -1 | 1) {
  const targetIndex = fromIndex + direction

  if (targetIndex < 0 || targetIndex >= items.length) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(targetIndex, 0, item)

  return next
}

export function moveItemToIndex<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)

  return next
}

export function nextThemePreference(
  theme: DashboardSettings['theme'],
): DashboardSettings['theme'] {
  return theme === 'dark' ? 'light' : 'dark'
}

export function normalizeClickCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function normalizeCardLayout(value: unknown): CardLayout {
  return CARD_LAYOUT_OPTIONS.includes(value as CardLayout)
    ? (value as CardLayout)
    : 'comfortable'
}

function normalizeGroupColor(value: unknown): GroupColor {
  return GROUP_COLOR_OPTIONS.includes(value as GroupColor)
    ? (value as GroupColor)
    : 'slate'
}

function normalizeWallpaper(value: unknown): WallpaperSettings {
  const wallpaper =
    value && typeof value === 'object' ? (value as Partial<WallpaperSettings>) : {}
  const preset = WALLPAPER_PRESET_OPTIONS.includes(wallpaper.preset as WallpaperPreset)
    ? (wallpaper.preset as WallpaperPreset)
    : 'none'
  const intensity = WALLPAPER_INTENSITY_OPTIONS.includes(
    wallpaper.intensity as WallpaperIntensity,
  )
    ? (wallpaper.intensity as WallpaperIntensity)
    : 'normal'

  return {
    preset,
    intensity,
  }
}

function normalizeLinkHealth(value: unknown): LinkHealth | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const health = value as Partial<LinkHealth>
  const status = health.status
  const reason = typeof health.reason === 'string' ? health.reason.trim() : ''
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

function createUniqueId(prefix: string, usedIds: Set<string>, preferredId: unknown) {
  const normalized = typeof preferredId === 'string' ? preferredId.trim() : ''

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

export function sanitizeDashboard(input: DashboardData): DashboardData {
  const groups = Array.isArray(input.groups) ? input.groups : []
  const title = input.settings?.title?.trim() || '我的导航'
  const theme = input.settings?.theme
  const groupIds = new Set<string>()
  const linkIds = new Set<string>()

  return {
    version: 1,
    updatedAt: input.updatedAt || new Date().toISOString(),
    settings: {
      title,
      theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
      cardLayout: normalizeCardLayout(input.settings?.cardLayout),
      wallpaper: normalizeWallpaper(input.settings?.wallpaper),
    },
    groups: groups.map((group) => ({
      id: createUniqueId('group', groupIds, group.id),
      name: group.name?.trim() || '未命名分组',
      color: normalizeGroupColor(group.color),
      links: Array.isArray(group.links)
        ? group.links
            .map((link) => ({
              id: createUniqueId('link', linkIds, link.id),
              title: link.title?.trim() || getHostname(link.url) || '未命名网站',
              url: normalizeUrl(link.url),
              icon: link.icon?.trim() || undefined,
              clickCount: normalizeClickCount(link.clickCount),
              check: normalizeLinkHealth(link.check),
            }))
        : [],
    })),
  }
}

export function incrementLinkClickCount(
  input: DashboardData,
  groupId: string,
  linkId: string,
): DashboardData {
  return {
    ...input,
    groups: input.groups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            links: group.links.map((link) =>
              link.id === linkId
                ? {
                    ...link,
                    clickCount: normalizeClickCount(link.clickCount) + 1,
                  }
                : link,
            ),
          }
        : group,
    ),
  }
}

export function isSafeUrl(value: string) {
  try {
    const url = new URL(normalizeUrl(value))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function findInvalidLinks(input: DashboardData) {
  return input.groups.flatMap((group) =>
    group.links
      .filter((link) => !isSafeUrl(link.url))
      .map((link) => `${group.name} / ${link.title || link.url || '未命名网站'}`),
  )
}

export type LinkOccurrence = {
  groupId: string
  groupName: string
  link: LinkItem
  linkIndex: number
}

export type DuplicateLinkGroup = {
  url: string
  occurrences: LinkOccurrence[]
}

export function comparableUrl(value: string) {
  try {
    const url = new URL(normalizeUrl(value))
    url.hash = ''
    url.hostname = url.hostname.toLocaleLowerCase()

    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }

    return url.toString()
  } catch {
    return normalizeUrl(value).trim().toLocaleLowerCase()
  }
}

export function findDuplicateLinks(input: DashboardData): DuplicateLinkGroup[] {
  const byUrl = new Map<string, LinkOccurrence[]>()

  input.groups.forEach((group) => {
    group.links.forEach((link, linkIndex) => {
      const key = comparableUrl(link.url)
      const occurrences = byUrl.get(key) ?? []

      occurrences.push({
        groupId: group.id,
        groupName: group.name,
        link,
        linkIndex,
      })
      byUrl.set(key, occurrences)
    })
  })

  return [...byUrl.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .map(([url, occurrences]) => ({
      url,
      occurrences,
    }))
}

export function findDuplicateLinkIds(duplicates: DuplicateLinkGroup[]) {
  return new Set(
    duplicates.flatMap((duplicate) =>
      duplicate.occurrences.map((occurrence) => occurrence.link.id),
    ),
  )
}

export function moveLinksToGroup(
  input: DashboardData,
  selectedLinkIds: Set<string>,
  targetGroupId: string,
): DashboardData {
  if (selectedLinkIds.size === 0) {
    return input
  }

  const moving: LinkItem[] = []
  const groups = input.groups.map((group) => {
    if (group.id === targetGroupId) {
      return group
    }

    const remaining: LinkItem[] = []

    group.links.forEach((link) => {
      if (selectedLinkIds.has(link.id)) {
        moving.push(link)
      } else {
        remaining.push(link)
      }
    })

    return {
      ...group,
      links: remaining,
    }
  })

  if (moving.length === 0) {
    return input
  }

  return {
    ...input,
    groups: groups.map((group) =>
      group.id === targetGroupId
        ? {
            ...group,
            links: [...group.links, ...moving],
          }
        : group,
    ),
  }
}

export function reorderLinkInGroup(
  input: DashboardData,
  groupId: string,
  draggedLinkId: string,
  targetLinkId: string,
): DashboardData {
  if (draggedLinkId === targetLinkId) {
    return input
  }

  let changed = false
  const groups = input.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    const fromIndex = group.links.findIndex((link) => link.id === draggedLinkId)
    const toIndex = group.links.findIndex((link) => link.id === targetLinkId)
    const links = moveItemToIndex(group.links, fromIndex, toIndex)

    if (links === group.links) {
      return group
    }

    changed = true
    return {
      ...group,
      links,
    }
  })

  return changed
    ? {
        ...input,
        groups,
      }
    : input
}

export function deleteLinks(input: DashboardData, selectedLinkIds: Set<string>): DashboardData {
  if (selectedLinkIds.size === 0) {
    return input
  }

  return {
    ...input,
    groups: input.groups.map((group) => ({
      ...group,
      links: group.links.filter((link) => !selectedLinkIds.has(link.id)),
    })),
  }
}

export function clearLinkIcons(
  input: DashboardData,
  selectedLinkIds: Set<string>,
): DashboardData {
  if (selectedLinkIds.size === 0) {
    return input
  }

  return {
    ...input,
    groups: input.groups.map((group) => ({
      ...group,
      links: group.links.map((link) =>
        selectedLinkIds.has(link.id)
          ? {
              ...link,
              icon: undefined,
            }
          : link,
      ),
    })),
  }
}
