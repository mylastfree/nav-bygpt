import { createId, isSafeUrl, sanitizeDashboard } from './dashboard'
import type { DashboardData, LinkGroup, LinkItem } from './types'

export type ImportSource = 'dashboard' | 'itab'

export type ImportSkippedItem = {
  group: string
  name: string
  url: string
  reason: string
}

export type ParsedDashboardImport = {
  source: ImportSource
  dashboard: DashboardData
  groupCount: number
  linkCount: number
  skipped: ImportSkippedItem[]
}

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_LINKS = 5000

type ItabGroup = {
  id?: string
  name?: string
  children?: ItabItem[]
}

type ItabItem = {
  id?: string
  name?: string
  title?: string
  url?: string
  src?: string
  icon?: string
  type?: string
  children?: ItabItem[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDashboardData(value: unknown): value is DashboardData {
  if (!isObject(value)) {
    return false
  }

  return Array.isArray(value.groups) && isObject(value.settings)
}

function isItabBackup(value: unknown): value is { navConfig: ItabGroup[] } {
  if (!isObject(value)) {
    return false
  }

  return Array.isArray(value.navConfig)
}

function usableIcon(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return undefined
}

function createLink(item: ItabItem): LinkItem | null {
  const url = item.url?.trim() ?? ''
  if (!url || !/^https?:\/\//i.test(url) || !isSafeUrl(url)) {
    return null
  }

  return {
    id: item.id || createId('link'),
    title: (item.name || item.title || url).trim(),
    url,
    icon: usableIcon(item.src) || usableIcon(item.icon),
  }
}

function countLinks(groups: LinkGroup[]) {
  return groups.reduce((count, group) => count + group.links.length, 0)
}

export function isImportFileTooLarge(file: Pick<File, 'size'>) {
  return file.size > MAX_IMPORT_FILE_BYTES
}

function assertImportLinkLimit(linkCount: number) {
  if (linkCount > MAX_IMPORT_LINKS) {
    throw new Error('import contains too many links')
  }
}

function convertItabBackup(input: { navConfig: ItabGroup[] }): ParsedDashboardImport {
  const skipped: ImportSkippedItem[] = []
  const groups: LinkGroup[] = []

  input.navConfig.forEach((itabGroup) => {
    const groupName = itabGroup.name?.trim() || '未命名分组'
    const links: LinkItem[] = []
    const folderGroups: LinkGroup[] = []

    itabGroup.children?.forEach((item) => {
      if (Array.isArray(item.children) && item.children.length > 0) {
        const folderName = item.name?.trim() || '文件夹'
        const folderLinks = item.children
          .map((child) => {
            const link = createLink(child)

            if (!link && child.url) {
              skipped.push({
                group: `${groupName} / ${folderName}`,
                name: child.name || child.title || child.url,
                url: child.url,
                reason: 'only http/https URLs are importable',
              })
            }

            return link
          })
          .filter((link): link is LinkItem => Boolean(link))

        if (folderLinks.length > 0) {
          folderGroups.push({
            id: item.id || createId('group'),
            name: `${groupName} / ${folderName}`,
            links: folderLinks,
          })
        }

        return
      }

      const link = createLink(item)

      if (link) {
        links.push(link)
        return
      }

      if (item.url) {
        skipped.push({
          group: groupName,
          name: item.name || item.title || item.url,
          url: item.url,
          reason: 'only http/https URLs are importable',
        })
      }
    })

    if (links.length > 0) {
      groups.push({
        id: itabGroup.id || createId('group'),
        name: groupName,
        links,
      })
    }

    groups.push(...folderGroups)
  })

  const dashboard = sanitizeDashboard({
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      title: '我的导航',
      theme: 'system',
    },
    groups,
  })

  const linkCount = countLinks(dashboard.groups)
  assertImportLinkLimit(linkCount)

  return {
    source: 'itab',
    dashboard,
    groupCount: dashboard.groups.length,
    linkCount,
    skipped,
  }
}

export function parseDashboardImport(
  _fileName: string,
  text: string,
): ParsedDashboardImport {
  const parsed = JSON.parse(text) as unknown

  if (isDashboardData(parsed)) {
    const dashboard = sanitizeDashboard(parsed)
    const linkCount = countLinks(dashboard.groups)
    assertImportLinkLimit(linkCount)

    return {
      source: 'dashboard',
      dashboard,
      groupCount: dashboard.groups.length,
      linkCount,
      skipped: [],
    }
  }

  if (isItabBackup(parsed)) {
    return convertItabBackup(parsed)
  }

  throw new Error('Unsupported import file')
}
