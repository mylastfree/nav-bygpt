import {
  comparableUrl,
  findDuplicateLinks,
  sanitizeDashboard,
} from './dashboard'
import type { DashboardBackup, DashboardData, LinkItem } from './types'

export type LinkCheckResult = {
  linkId: string
  groupId: string
  groupName: string
  title: string
  url: string
  status: NonNullable<LinkItem['check']>['status']
  reason: string
  checkedAt?: string
}

export type ImportPreview = {
  importedGroupCount: number
  importedLinkCount: number
  duplicateUrlCount: number
  mergeLinkCount: number
}

export type DashboardHealth = {
  groupCount: number
  linkCount: number
  duplicateGroupCount: number
  duplicateLinkCount: number
  brokenCount: number
  limitedCount: number
  okCount: number
  lastBackupAt: string
  storageBytes: number
}

export type DashboardSummary = {
  groupCount: number
  linkCount: number
}

export function countDashboardLinks(dashboard: DashboardData) {
  return dashboard.groups.reduce((count, group) => count + group.links.length, 0)
}

export function summarizeDashboard(dashboard: DashboardData): DashboardSummary {
  return {
    groupCount: dashboard.groups.length,
    linkCount: countDashboardLinks(dashboard),
  }
}

export function createImportPreview(
  current: DashboardData,
  imported: DashboardData,
): ImportPreview {
  const currentUrls = collectUrls(current)
  const importedLinks = imported.groups.flatMap((group) => group.links)
  let duplicateUrlCount = 0
  let mergeableLinkCount = 0

  importedLinks.forEach((link) => {
    const key = comparableUrl(link.url)

    if (currentUrls.has(key)) {
      duplicateUrlCount += 1
      return
    }

    currentUrls.add(key)
    mergeableLinkCount += 1
  })

  return {
    importedGroupCount: imported.groups.length,
    importedLinkCount: importedLinks.length,
    duplicateUrlCount,
    mergeLinkCount: countDashboardLinks(current) + mergeableLinkCount,
  }
}

export function mergeImportedDashboard(
  current: DashboardData,
  imported: DashboardData,
): DashboardData {
  const seenUrls = collectUrls(current)
  const importedGroups = imported.groups
    .map((group) => {
      const links = group.links.filter((link) => {
        const key = comparableUrl(link.url)

        if (seenUrls.has(key)) {
          return false
        }

        seenUrls.add(key)
        return true
      })

      return {
        ...group,
        links,
      }
    })
    .filter((group) => group.links.length > 0)

  return sanitizeDashboard({
    ...current,
    groups: [...current.groups, ...importedGroups],
  })
}

export function removeDuplicateLinksByUrl(
  dashboard: DashboardData,
  duplicateUrl: string,
): DashboardData {
  const target = comparableUrl(duplicateUrl)
  let keptFirst = false
  let changed = false

  const groups = dashboard.groups.map((group) => {
    const links = group.links.filter((link) => {
      if (comparableUrl(link.url) !== target) {
        return true
      }

      if (!keptFirst) {
        keptFirst = true
        return true
      }

      changed = true
      return false
    })

    return links === group.links
      ? group
      : {
          ...group,
          links,
        }
  })

  return changed
    ? {
        ...dashboard,
        groups,
      }
    : dashboard
}

export function applyLinkCheckResults(
  dashboard: DashboardData,
  results: LinkCheckResult[],
  checkedAt: string,
): DashboardData {
  const byLinkId = new Map(results.map((result) => [result.linkId, result]))

  return {
    ...dashboard,
    groups: dashboard.groups.map((group) => ({
      ...group,
      links: group.links.map((link) => {
        const result = byLinkId.get(link.id)

        if (!result) {
          return link
        }

        return {
          ...link,
          check: {
            status: result.status,
            reason: result.reason,
            checkedAt: result.checkedAt ?? checkedAt,
          },
        }
      }),
    })),
  }
}

export function confirmLinkCheckResult(
  dashboard: DashboardData,
  linkId: string,
  confirmedAt: string,
): DashboardData {
  return {
    ...dashboard,
    groups: dashboard.groups.map((group) => ({
      ...group,
      links: group.links.map((link) =>
        link.id === linkId
          ? {
              ...link,
              check: {
                status: 'ok',
                reason: '手动确认正常',
                checkedAt: link.check?.checkedAt || confirmedAt,
                confirmedAt,
              },
            }
          : link,
      ),
    })),
  }
}

export function getStoredLinkCheckResults(dashboard: DashboardData): LinkCheckResult[] {
  return dashboard.groups.flatMap((group) =>
    group.links.flatMap((link) => {
      if (!link.check) {
        return []
      }

      return [
        {
          linkId: link.id,
          groupId: group.id,
          groupName: group.name,
          title: link.title,
          url: link.url,
          status: link.check.status,
          reason: link.check.reason,
        },
      ]
    }),
  )
}

export function getDashboardHealth(
  dashboard: DashboardData,
  backups: DashboardBackup[] = [],
): DashboardHealth {
  const links = dashboard.groups.flatMap((group) => group.links)
  const duplicates = findDuplicateLinks(dashboard)

  return {
    groupCount: dashboard.groups.length,
    linkCount: links.length,
    duplicateGroupCount: duplicates.length,
    duplicateLinkCount: duplicates.reduce(
      (count, duplicate) => count + Math.max(0, duplicate.occurrences.length - 1),
      0,
    ),
    brokenCount: countCheckedLinks(links, 'broken'),
    limitedCount: countCheckedLinks(links, 'limited'),
    okCount: countCheckedLinks(links, 'ok'),
    lastBackupAt: backups[0]?.createdAt ?? '',
    storageBytes: estimateStorageBytes(dashboard, backups),
  }
}

function collectUrls(dashboard: DashboardData) {
  return new Set(
    dashboard.groups.flatMap((group) =>
      group.links.map((link) => comparableUrl(link.url)),
    ),
  )
}

function countCheckedLinks(
  links: LinkItem[],
  status: NonNullable<LinkItem['check']>['status'],
) {
  return links.filter((link) => link.check?.status === status).length
}

function estimateStorageBytes(dashboard: DashboardData, backups: DashboardBackup[]) {
  const text = JSON.stringify({
    dashboard,
    backups,
  })

  return new TextEncoder().encode(text).length
}
