import { describe, expect, test } from 'vitest'
import type { DashboardBackup, DashboardData } from './types'
import {
  applyLinkCheckResults,
  confirmLinkCheckResult,
  createImportPreview,
  getDashboardHealth,
  type LinkCheckResult,
  summarizeDashboard,
  mergeImportedDashboard,
  removeDuplicateLinksByUrl,
} from './maintenance'

function dashboard(): DashboardData {
  return {
    version: 1,
    updatedAt: '2026-04-26T00:00:00.000Z',
    settings: {
      title: 'Current nav',
      theme: 'dark',
    },
    groups: [
      {
        id: 'daily',
        name: 'Daily',
        links: [
          {
            id: 'github-a',
            title: 'GitHub A',
            url: 'https://github.com',
          },
          {
            id: 'openai',
            title: 'OpenAI',
            url: 'https://openai.com/',
          },
        ],
      },
      {
        id: 'work',
        name: 'Work',
        links: [
          {
            id: 'github-b',
            title: 'GitHub B',
            url: 'https://github.com/',
          },
        ],
      },
    ],
  }
}

function importedDashboard(): DashboardData {
  return {
    version: 1,
    updatedAt: '2026-04-26T01:00:00.000Z',
    settings: {
      title: 'Imported nav',
      theme: 'light',
    },
    groups: [
      {
        id: 'imported',
        name: 'Imported',
        links: [
          {
            id: 'github-imported',
            title: 'GitHub Imported',
            url: 'https://github.com/',
          },
          {
            id: 'example',
            title: 'Example',
            url: 'https://example.com',
          },
        ],
      },
    ],
  }
}

describe('maintenance helpers', () => {
  test('previews import impact before replacing or merging data', () => {
    const preview = createImportPreview(dashboard(), importedDashboard())

    expect(preview.currentGroupCount).toBe(2)
    expect(preview.currentLinkCount).toBe(3)
    expect(preview.importedGroupCount).toBe(1)
    expect(preview.importedLinkCount).toBe(2)
    expect(preview.duplicateUrlCount).toBe(1)
    expect(preview.mergeLinkCount).toBe(4)
    expect(preview.replaceGroupCount).toBe(1)
    expect(preview.replaceLinkCount).toBe(2)
    expect(preview.removedLinkCount).toBe(1)
  })

  test('merges imported data by skipping duplicate URLs and preserving current settings', () => {
    const merged = mergeImportedDashboard(dashboard(), importedDashboard())

    expect(merged.settings).toEqual({
      title: 'Current nav',
      theme: 'dark',
      cardLayout: 'comfortable',
      wallpaper: {
        preset: 'none',
        intensity: 'normal',
      },
    })
    expect(merged.groups.map((group) => group.name)).toEqual([
      'Daily',
      'Work',
      'Imported',
    ])
    expect(merged.groups[2].links.map((link) => link.url)).toEqual([
      'https://example.com',
    ])
  })

  test('removes duplicate URLs while keeping the first occurrence', () => {
    const cleaned = removeDuplicateLinksByUrl(dashboard(), 'https://github.com/')

    expect(cleaned.groups[0].links.map((link) => link.id)).toEqual([
      'github-a',
      'openai',
    ])
    expect(cleaned.groups[1].links).toEqual([])
  })

  test('stores link check results on links and confirms one result as normal', () => {
    const results: LinkCheckResult[] = [
      {
        linkId: 'github-a',
        groupId: 'daily',
        groupName: 'Daily',
        title: 'GitHub A',
        url: 'https://github.com',
        status: 'broken',
        reason: '404',
      },
    ]
    const checked = applyLinkCheckResults(
      dashboard(),
      results,
      '2026-04-26T02:00:00.000Z',
    )

    expect(checked.groups[0].links[0].check).toEqual({
      status: 'broken',
      reason: '404',
      checkedAt: '2026-04-26T02:00:00.000Z',
    })

    const confirmed = confirmLinkCheckResult(
      checked,
      'github-a',
      '2026-04-26T03:00:00.000Z',
    )

    expect(confirmed.groups[0].links[0].check).toMatchObject({
      status: 'ok',
      confirmedAt: '2026-04-26T03:00:00.000Z',
    })
  })

  test('summarizes dashboard health and estimated local storage size', () => {
    const checked = applyLinkCheckResults(
      dashboard(),
      [
        {
          linkId: 'github-a',
          groupId: 'daily',
          groupName: 'Daily',
          title: 'GitHub A',
          url: 'https://github.com',
          status: 'broken',
          reason: '404',
        },
      ],
      '2026-04-26T02:00:00.000Z',
    )
    const backups: DashboardBackup[] = [
      {
        id: 'backup-1',
        createdAt: '2026-04-26T01:00:00.000Z',
        dashboard: dashboard(),
      },
    ]

    const health = getDashboardHealth(checked, backups)

    expect(health.groupCount).toBe(2)
    expect(health.linkCount).toBe(3)
    expect(health.duplicateGroupCount).toBe(1)
    expect(health.brokenCount).toBe(1)
    expect(health.lastBackupAt).toBe('2026-04-26T01:00:00.000Z')
    expect(health.storageBytes).toBeGreaterThan(100)
  })

  test('summarizes a dashboard for backup cards', () => {
    expect(summarizeDashboard(dashboard())).toEqual({
      groupCount: 2,
      linkCount: 3,
    })
  })
})
