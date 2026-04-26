import { describe, expect, test } from 'vitest'
import { incrementLinkClickCount, sanitizeDashboard } from './dashboard'
import type { DashboardData } from './types'

function dashboardWithClicks(clickCount?: unknown): DashboardData {
  return {
    version: 1,
    updatedAt: '2026-04-26T00:00:00.000Z',
    settings: {
      title: 'Test nav',
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
            url: 'https://github.com',
            clickCount,
          },
        ],
      },
    ],
  } as unknown as DashboardData
}

describe('dashboard click statistics', () => {
  test('deduplicates imported group and link ids while preserving first occurrences', () => {
    const sanitized = sanitizeDashboard({
      ...dashboardWithClicks(),
      groups: [
        {
          id: 'daily',
          name: 'Daily',
          links: [
            {
              id: 'github',
              title: 'GitHub',
              url: 'https://github.com',
            },
            {
              id: 'github',
              title: 'GitHub duplicate',
              url: 'https://github.com/mylastfree',
            },
          ],
        },
        {
          id: 'daily',
          name: 'Daily duplicate',
          links: [
            {
              id: 'github',
              title: 'GitHub third',
              url: 'https://github.com/openai',
            },
          ],
        },
      ],
    })

    expect(sanitized.groups[0].id).toBe('daily')
    expect(sanitized.groups[1].id).not.toBe('daily')
    expect(sanitized.groups[0].links[0].id).toBe('github')
    expect(new Set(sanitized.groups.flatMap((group) => group.links.map((link) => link.id))).size).toBe(3)
  })

  test('normalizes missing or invalid click counts to zero', () => {
    expect(sanitizeDashboard(dashboardWithClicks()).groups[0].links[0].clickCount).toBe(0)
    expect(sanitizeDashboard(dashboardWithClicks(-3)).groups[0].links[0].clickCount).toBe(0)
  })

  test('preserves stored click counts', () => {
    const sanitized = sanitizeDashboard(dashboardWithClicks(7))

    expect(sanitized.groups[0].links[0].clickCount).toBe(7)
  })

  test('increments only the clicked link count', () => {
    const updated = incrementLinkClickCount(dashboardWithClicks(7), 'daily', 'github')

    expect(updated.groups[0].links[0].clickCount).toBe(8)
    expect(updated.updatedAt).toBe('2026-04-26T00:00:00.000Z')
  })
})
