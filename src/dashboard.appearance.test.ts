import { describe, expect, test } from 'vitest'
import { sanitizeDashboard } from './dashboard'
import type { DashboardData } from './types'

function dashboardWithAppearance(settings: unknown, groupColor?: unknown): DashboardData {
  return {
    version: 1,
    updatedAt: '2026-04-26T00:00:00.000Z',
    settings: {
      title: 'Test nav',
      theme: 'system',
      ...(settings as object),
    },
    groups: [
      {
        id: 'daily',
        name: 'Daily',
        color: groupColor,
        links: [
          {
            id: 'github',
            title: 'GitHub',
            url: 'https://github.com',
          },
        ],
      },
    ],
  } as unknown as DashboardData
}

describe('dashboard appearance preferences', () => {
  test('fills stable defaults for old dashboards without appearance settings', () => {
    const sanitized = sanitizeDashboard(dashboardWithAppearance({}))

    expect(sanitized.settings.cardLayout).toBe('comfortable')
    expect(sanitized.settings.wallpaper).toEqual({
      preset: 'none',
      intensity: 'normal',
    })
    expect(sanitized.groups[0].color).toBe('slate')
  })

  test('preserves valid card layout, wallpaper, and group color presets', () => {
    const sanitized = sanitizeDashboard(
      dashboardWithAppearance(
        {
          cardLayout: 'compact',
          wallpaper: {
            preset: 'blue-gray',
            intensity: 'soft',
          },
        },
        'teal',
      ),
    )

    expect(sanitized.settings.cardLayout).toBe('compact')
    expect(sanitized.settings.wallpaper).toEqual({
      preset: 'blue-gray',
      intensity: 'soft',
    })
    expect(sanitized.groups[0].color).toBe('teal')
  })

  test('falls back when imported appearance presets are unknown', () => {
    const sanitized = sanitizeDashboard(
      dashboardWithAppearance(
        {
          cardLayout: 'giant',
          wallpaper: {
            preset: 'remote-photo',
            intensity: 'heavy',
          },
        },
        '#ff00ff',
      ),
    )

    expect(sanitized.settings.cardLayout).toBe('comfortable')
    expect(sanitized.settings.wallpaper).toEqual({
      preset: 'none',
      intensity: 'normal',
    })
    expect(sanitized.groups[0].color).toBe('slate')
  })
})
