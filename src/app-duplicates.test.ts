import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('duplicate link maintenance contract', () => {
  test('shows duplicate links in edit mode with locate and cleanup actions', () => {
    expect(appSource).toContain('findDuplicateLinks')
    expect(appSource).toContain('findDuplicateLinkIds')
    expect(appSource).toContain('removeDuplicateLinksByUrl')
    expect(appSource).toContain('const duplicateLinks = useMemo')
    expect(appSource).toContain('const duplicateLinkIds = useMemo')
    expect(appSource).toContain('function locateLink(')
    expect(appSource).toContain('function removeDuplicateGroup(')
    expect(appSource).toContain('className="notice-panel compact-notice duplicate-panel"')
    expect(appSource).toContain('className="duplicate-list"')
    expect(appSource).toContain('className="duplicate-occurrence"')
    expect(appSource).toContain('duplicateLinkIds.has(link.id)')
    expect(appSource).toContain('is-duplicate')
    expect(appSource).toContain('is-located')
    expect(appSource).toContain('startQuickEditLink(item.groupId, item.link)')
    expect(appSource).toContain('deleteLink(item.groupId, item.link.id)')
    expect(appSource).toContain('window.open(')
    expect(appSource).toContain('normalizeUrl(item.link.url)')
    expect(appSource).toContain('removeDuplicateLinksByUrl(current, duplicate.url)')
  })

  test('styles duplicate panels and highlighted cards', () => {
    expect(css).toContain('.duplicate-panel')
    expect(css).toContain('.duplicate-list')
    expect(css).toContain('.duplicate-card')
    expect(css).toContain('.duplicate-occurrence')
    expect(css).toContain('.link-card-shell.is-duplicate .link-card')
    expect(css).toContain('.link-card-shell.is-located .link-card')
    expect(css).toContain('scroll-margin')
  })
})
