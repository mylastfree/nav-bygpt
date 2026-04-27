import { describe, expect, test } from 'vitest'
import {
  clearLinkIcons,
  deleteLinks,
  findDuplicateLinkIds,
  findDuplicateLinks,
  sanitizeDashboard,
  moveLinksToGroup,
  nextThemePreference,
  reorderLinkInGroup,
} from './dashboard'
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_GROUPS,
  MAX_IMPORT_LINKS,
  MAX_IMPORT_LINKS_PER_GROUP,
  isImportFileTooLarge,
  parseDashboardImport,
} from './importers'
import type { DashboardData } from './types'

function dashboardWithDuplicates(): DashboardData {
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

describe('import parsing', () => {
  test('rejects import files larger than the local safety limit before reading them', () => {
    expect(isImportFileTooLarge({ size: MAX_IMPORT_FILE_BYTES })).toBe(false)
    expect(isImportFileTooLarge({ size: MAX_IMPORT_FILE_BYTES + 1 })).toBe(true)
  })

  test('rejects imports with too many links for local storage', () => {
    const dashboard = sanitizeDashboard({
      ...dashboardWithDuplicates(),
      groups: [
        {
          id: 'large',
          name: 'Large',
          links: Array.from({ length: MAX_IMPORT_LINKS + 1 }, (_, index) => ({
            id: `link-${index}`,
            title: `Link ${index}`,
            url: `https://example.com/${index}`,
          })),
        },
      ],
    })

    expect(() => parseDashboardImport('large.json', JSON.stringify(dashboard))).toThrow(
      'import contains too many links',
    )
  })

  test('rejects imports with too many groups before sending them to KV', () => {
    const dashboard = sanitizeDashboard({
      ...dashboardWithDuplicates(),
      groups: Array.from({ length: MAX_IMPORT_GROUPS + 1 }, (_, index) => ({
        id: `group-${index}`,
        name: `Group ${index}`,
        links: [
          {
            id: `link-${index}`,
            title: `Link ${index}`,
            url: `https://example.com/${index}`,
          },
        ],
      })),
    })

    expect(() => parseDashboardImport('many-groups.json', JSON.stringify(dashboard))).toThrow(
      'import contains too many groups',
    )
  })

  test('rejects imports with too many links in one group before previewing them', () => {
    const dashboard = sanitizeDashboard({
      ...dashboardWithDuplicates(),
      groups: [
        {
          id: 'large',
          name: 'Large',
          links: Array.from({ length: MAX_IMPORT_LINKS_PER_GROUP + 1 }, (_, index) => ({
            id: `link-${index}`,
            title: `Link ${index}`,
            url: `https://example.com/${index}`,
          })),
        },
      ],
    })

    expect(() => parseDashboardImport('large-group.json', JSON.stringify(dashboard))).toThrow(
      'import contains too many links in one group',
    )
  })

  test('parses the app dashboard JSON directly', () => {
    const dashboard = dashboardWithDuplicates()
    const result = parseDashboardImport('backup.json', JSON.stringify(dashboard))

    expect(result.source).toBe('dashboard')
    expect(result.dashboard.groups).toHaveLength(2)
    expect(result.linkCount).toBe(3)
    expect(result.skipped).toEqual([])
  })

  test('keeps Chrome extension fields while accepting old Pages backups', () => {
    const chromeDashboard = {
      ...dashboardWithDuplicates(),
      settings: {
        title: 'Chrome nav',
        theme: 'dark',
        cardLayout: 'list',
        wallpaper: {
          preset: 'warm-gray',
          intensity: 'soft',
        },
      },
      groups: [
        {
          id: 'daily',
          name: 'Daily',
          color: 'rose',
          links: [
            {
              id: 'github',
              title: 'GitHub',
              url: 'https://github.com',
              clickCount: 9,
              check: {
                status: 'ok',
                reason: '200',
                checkedAt: '2026-04-27T00:00:00.000Z',
              },
            },
          ],
        },
      ],
    } satisfies DashboardData
    const pagesDashboard = dashboardWithDuplicates()

    const chromeResult = parseDashboardImport('chrome.json', JSON.stringify(chromeDashboard))
    const pagesResult = parseDashboardImport('pages.json', JSON.stringify(pagesDashboard))

    expect(chromeResult.dashboard.settings.cardLayout).toBe('list')
    expect(chromeResult.dashboard.settings.wallpaper).toEqual({
      preset: 'warm-gray',
      intensity: 'soft',
    })
    expect(chromeResult.dashboard.groups[0].color).toBe('rose')
    expect(chromeResult.dashboard.groups[0].links[0].clickCount).toBe(9)
    expect(chromeResult.dashboard.groups[0].links[0].check).toMatchObject({
      status: 'ok',
      reason: '200',
    })
    expect(pagesResult.dashboard.settings.cardLayout).toBe('comfortable')
    expect(pagesResult.dashboard.groups[0].color).toBe('slate')
    expect(pagesResult.dashboard.groups[0].links[0].clickCount).toBe(0)
  })

  test('converts iTab backups into dashboard data and flattens folders', () => {
    const itab = {
      baseConfig: {},
      navConfig: [
        {
          id: 'home',
          name: 'Home',
          children: [
            {
              id: 'component',
              name: 'Weather',
              type: 'component',
            },
            {
              id: 'github',
              name: 'GitHub',
              url: 'https://github.com',
              type: 'icon',
              src: 'https://example.com/github.png',
            },
            {
              id: 'internal',
              name: 'History',
              url: 'chrome://history/',
              type: 'icon',
            },
            {
              id: 'folder',
              name: 'Tools',
              url: 'https://folder.example.com',
              type: 'folder',
              children: [
                {
                  id: 'tool',
                  name: 'Tool',
                  url: 'https://tool.example.com',
                  type: 'text',
                  src: '',
                },
              ],
            },
          ],
        },
      ],
    }

    const result = parseDashboardImport('itab.itabdata', JSON.stringify(itab))

    expect(result.source).toBe('itab')
    expect(result.dashboard.groups.map((group) => group.name)).toEqual([
      'Home',
      'Home / Tools',
    ])
    expect(result.dashboard.groups[0].links).toEqual([
      {
        id: 'github',
        title: 'GitHub',
        url: 'https://github.com',
        icon: 'https://example.com/github.png',
        clickCount: 0,
      },
    ])
    expect(result.dashboard.groups[1].links[0]).toMatchObject({
      id: 'tool',
      title: 'Tool',
      url: 'https://tool.example.com',
    })
    expect(result.linkCount).toBe(2)
    expect(result.skipped).toEqual([
      {
        group: 'Home',
        name: 'History',
        url: 'chrome://history/',
        reason: 'only http/https URLs are importable',
      },
    ])
  })
})

describe('dashboard organization helpers', () => {
  test('detects duplicate URLs after normalizing trailing slashes', () => {
    const duplicates = findDuplicateLinks(dashboardWithDuplicates())

    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].url).toBe('https://github.com/')
    expect(duplicates[0].occurrences.map((item) => item.link.title)).toEqual([
      'GitHub A',
      'GitHub B',
    ])
  })

  test('returns every duplicated link id for editor highlighting', () => {
    const duplicateIds = findDuplicateLinkIds(findDuplicateLinks(dashboardWithDuplicates()))

    expect([...duplicateIds].sort()).toEqual(['github-a', 'github-b'])
  })

  test('moves selected links into the target group without duplicating target links', () => {
    const moved = moveLinksToGroup(dashboardWithDuplicates(), new Set(['github-a']), 'work')

    expect(moved.groups[0].links.map((link) => link.id)).toEqual(['openai'])
    expect(moved.groups[1].links.map((link) => link.id)).toEqual([
      'github-b',
      'github-a',
    ])
  })

  test('deletes selected links across groups', () => {
    const next = deleteLinks(dashboardWithDuplicates(), new Set(['github-a', 'github-b']))

    expect(next.groups[0].links.map((link) => link.id)).toEqual(['openai'])
    expect(next.groups[1].links).toEqual([])
  })

  test('clears selected custom icons without removing unselected icons', () => {
    const data = dashboardWithDuplicates()
    data.groups[0].links[0].icon = 'https://example.com/github.png'
    data.groups[0].links[1].icon = 'https://example.com/openai.png'

    const next = clearLinkIcons(data, new Set(['github-a']))

    expect(next.groups[0].links[0].icon).toBeUndefined()
    expect(next.groups[0].links[1].icon).toBe('https://example.com/openai.png')
  })

  test('reorders links inside the same group by dragged and target link ids', () => {
    const moved = reorderLinkInGroup(dashboardWithDuplicates(), 'daily', 'openai', 'github-a')

    expect(moved.groups[0].links.map((link) => link.id)).toEqual(['openai', 'github-a'])
    expect(moved.groups[1].links.map((link) => link.id)).toEqual(['github-b'])
  })
})

describe('dashboard preference helpers', () => {
  test('toggles front theme preference between light and dark', () => {
    expect(nextThemePreference('dark')).toBe('light')
    expect(nextThemePreference('light')).toBe('dark')
    expect(nextThemePreference('system')).toBe('dark')
  })
})
