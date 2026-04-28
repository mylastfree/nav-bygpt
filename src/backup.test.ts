import { describe, expect, test } from 'vitest'
import { compareRestoreDashboard, countDashboardLinks } from './backup'
import type { DashboardData } from './types'

function dashboard(updatedAt: string, groupSizes: number[]): DashboardData {
  return {
    version: 1,
    updatedAt,
    settings: {
      title: 'My nav',
      theme: 'system',
    },
    groups: groupSizes.map((size, groupIndex) => ({
      id: `group-${groupIndex}`,
      name: `Group ${groupIndex}`,
      links: Array.from({ length: size }, (_, linkIndex) => ({
        id: `link-${groupIndex}-${linkIndex}`,
        title: `Link ${linkIndex}`,
        url: `https://example-${groupIndex}-${linkIndex}.com`,
      })),
    })),
  }
}

describe('backup restore comparison', () => {
  test('counts links across every group', () => {
    expect(countDashboardLinks(dashboard('2026-04-28T00:00:00.000Z', [2, 0, 3]))).toBe(5)
  })

  test('compares current dashboard with a backup before restore', () => {
    const current = dashboard('2026-04-28T08:00:00.000Z', [2, 3])
    const backup = dashboard('2026-04-27T08:00:00.000Z', [1, 1, 1])

    expect(compareRestoreDashboard(current, backup)).toEqual({
      current: {
        updatedAt: '2026-04-28T08:00:00.000Z',
        groupCount: 2,
        linkCount: 5,
      },
      backup: {
        updatedAt: '2026-04-27T08:00:00.000Z',
        groupCount: 3,
        linkCount: 3,
      },
      groupDelta: 1,
      linkDelta: -2,
      backupIsOlder: true,
      backupIsNewer: false,
    })
  })
})
