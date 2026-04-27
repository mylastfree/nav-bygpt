import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('search scope contract', () => {
  test('supports current-group and all-groups search without changing storage shape', () => {
    expect(appSource).toContain("type SearchScope = 'group' | 'all'")
    expect(appSource).toContain('type VisibleLink')
    expect(appSource).toContain('const [searchScope, setSearchScope]')
    expect(appSource).toContain('const visibleLinkItems = useMemo<VisibleLink[]>')
    expect(appSource).toContain("searchScope === 'all' && !isEditing && keyword")
    expect(appSource).toContain('const isGlobalSearch =')
    expect(appSource).toContain('className="select-input compact-select"')
    expect(appSource).toContain('<option value="group">当前分组</option>')
    expect(appSource).toContain('<option value="all">全部分组</option>')
    expect(appSource).toContain('className="link-group-name"')
    expect(appSource).toContain('handleLinkClick(event, groupId, link.id)')
  })

  test('supports keyboard shortcuts in the search box', () => {
    expect(appSource).toContain('function handleSearchKeyDown(')
    expect(appSource).toContain("if (event.key === 'Escape')")
    expect(appSource).toContain("if (event.key !== 'Enter' || isEditing)")
    expect(appSource).toContain('const first = visibleLinkItems[0]')
    expect(appSource).toContain('recordLinkClick(first.groupId, first.link.id)')
    expect(appSource).toContain("window.open(normalizeUrl(first.link.url), '_blank', 'noopener,noreferrer')")
    expect(appSource).toContain('onKeyDown={handleSearchKeyDown}')
  })

  test('styles the compact search scope control and result group label', () => {
    expect(css).toContain('.compact-select')
    expect(css).toContain('.link-group-name')
    expect(css).toContain(":root[data-card-layout='list'] .link-group-name")
  })
})
