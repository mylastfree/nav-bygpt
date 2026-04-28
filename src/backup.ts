import type { DashboardData } from './types'

export type DashboardSummary = {
  updatedAt: string
  groupCount: number
  linkCount: number
}

export type RestoreComparison = {
  current: DashboardSummary
  backup: DashboardSummary
  groupDelta: number
  linkDelta: number
  backupIsOlder: boolean
  backupIsNewer: boolean
}

export function countDashboardLinks(dashboard: DashboardData) {
  return dashboard.groups.reduce((total, group) => total + group.links.length, 0)
}

export function summarizeDashboard(dashboard: DashboardData): DashboardSummary {
  return {
    updatedAt: dashboard.updatedAt,
    groupCount: dashboard.groups.length,
    linkCount: countDashboardLinks(dashboard),
  }
}

export function compareRestoreDashboard(
  current: DashboardData,
  backup: DashboardData,
): RestoreComparison {
  const currentSummary = summarizeDashboard(current)
  const backupSummary = summarizeDashboard(backup)
  const currentTime = Date.parse(currentSummary.updatedAt)
  const backupTime = Date.parse(backupSummary.updatedAt)

  return {
    current: currentSummary,
    backup: backupSummary,
    groupDelta: backupSummary.groupCount - currentSummary.groupCount,
    linkDelta: backupSummary.linkCount - currentSummary.linkCount,
    backupIsOlder:
      Number.isFinite(currentTime) && Number.isFinite(backupTime)
        ? backupTime < currentTime
        : false,
    backupIsNewer:
      Number.isFinite(currentTime) && Number.isFinite(backupTime)
        ? backupTime > currentTime
        : false,
  }
}
