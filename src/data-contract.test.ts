import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import {
  MAX_IMPORT_GROUPS,
  MAX_IMPORT_LINKS,
  MAX_IMPORT_LINKS_PER_GROUP,
  parseDashboardImport,
} from './importers'

function fixture(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`../test-fixtures/shared-dashboard/${name}`, import.meta.url)),
    'utf8',
  )
}

function idsAreUnique(ids: string[]) {
  return new Set(ids).size === ids.length
}

describe('shared dashboard data contract', () => {
  test('keeps Pages and Chrome dashboard fields while rebuilding duplicate ids', () => {
    const result = parseDashboardImport('full-v1.json', fixture('full-v1.json'))
    const data = result.dashboard
    const groupIds = data.groups.map((group) => group.id)
    const linkIds = data.groups.flatMap((group) => group.links.map((link) => link.id))

    expect(result.source).toBe('dashboard')
    expect(result.groupCount).toBe(2)
    expect(result.linkCount).toBe(3)
    expect(idsAreUnique(groupIds)).toBe(true)
    expect(idsAreUnique(linkIds)).toBe(true)
    expect(groupIds[0]).toBe('dup-group')
    expect(groupIds[1]).not.toBe('dup-group')
    expect(data.settings).toMatchObject({
      title: 'Shared Contract',
      theme: 'dark',
      cardLayout: 'list',
      wallpaper: {
        preset: 'warm-gray',
        intensity: 'soft',
      },
    })
    expect(data.groups[0].color).toBe('teal')
    expect(data.groups[1].color).toBe('slate')
    expect(data.groups[0].links[0]).toMatchObject({
      id: 'dup-link',
      title: 'GitHub',
      url: 'https://github.com',
      icon: 'https://example.com/github.png',
      clickCount: 7,
      check: {
        status: 'limited',
        reason: 'HEAD HTTP 403',
        checkedAt: '2026-04-27T07:00:00.000Z',
        confirmedAt: '2026-04-27T07:05:00.000Z',
      },
    })
    expect(data.groups[0].links[1].id).not.toBe('dup-link')
    expect(data.groups[0].links[1].clickCount).toBe(0)
    expect(data.groups[0].links[1].check).toBeUndefined()
    expect(data.groups[1].links[0].title).toBe('openai.com')
  })

  test('converts iTab backups with the same skip and folder rules', () => {
    const result = parseDashboardImport('itab-basic.itabdata', fixture('itab-basic.itabdata'))

    expect(result.source).toBe('itab')
    expect(result.groupCount).toBe(2)
    expect(result.linkCount).toBe(2)
    expect(result.dashboard.groups.map((group) => group.name)).toEqual([
      'Home',
      'Home / Tools',
    ])
    expect(result.dashboard.groups[0].links[0]).toMatchObject({
      id: 'github',
      title: 'GitHub',
      url: 'https://github.com',
      icon: 'https://example.com/github.png',
      clickCount: 0,
    })
    expect(result.dashboard.groups[1].links[0]).toMatchObject({
      id: 'cloudflare',
      title: 'Cloudflare',
      url: 'https://dash.cloudflare.com',
      icon: 'data:image/png;base64,AAAA',
    })
    expect(result.skipped).toEqual([
      {
        group: 'Home',
        name: 'Chrome Settings',
        url: 'chrome://settings/',
        reason: 'only http/https URLs are importable',
      },
    ])
  })

  test('uses the same import safety limits on both apps', () => {
    expect(MAX_IMPORT_GROUPS).toBe(500)
    expect(MAX_IMPORT_LINKS).toBe(5000)
    expect(MAX_IMPORT_LINKS_PER_GROUP).toBe(1000)
  })

  test('rejects group and per-group imports that would not fit the shared contract', () => {
    const manyGroups = {
      version: 1,
      updatedAt: '2026-04-27T08:00:00.000Z',
      settings: {
        title: 'Too many groups',
        theme: 'system',
      },
      groups: Array.from({ length: MAX_IMPORT_GROUPS + 1 }, (_, index) => ({
        id: `group-${index}`,
        name: `Group ${index}`,
        links: [],
      })),
    }
    const oneHugeGroup = {
      ...manyGroups,
      groups: [
        {
          id: 'huge',
          name: 'Huge',
          links: Array.from({ length: MAX_IMPORT_LINKS_PER_GROUP + 1 }, (_, index) => ({
            id: `link-${index}`,
            title: `Link ${index}`,
            url: `https://example.com/${index}`,
          })),
        },
      ],
    }

    expect(() => parseDashboardImport('many-groups.json', JSON.stringify(manyGroups))).toThrow(
      'import contains too many groups',
    )
    expect(() => parseDashboardImport('huge-group.json', JSON.stringify(oneHugeGroup))).toThrow(
      'import contains too many links in one group',
    )
  })
})
