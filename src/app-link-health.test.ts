import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('link health maintenance contract', () => {
  test('shows stored problem links in edit mode with safe maintenance actions', () => {
    expect(appSource).toContain('getStoredLinkCheckResults')
    expect(appSource).toContain('confirmLinkCheckResult')
    expect(appSource).toContain('const problemLinkChecks = useMemo')
    expect(appSource).toContain("check.status !== 'ok'")
    expect(appSource).toContain('const problemLinkStatusById = useMemo')
    expect(appSource).toContain('function findLinkForCheck(')
    expect(appSource).toContain('function confirmHealthyLink(')
    expect(appSource).toContain('className="notice-panel compact-notice link-check-panel"')
    expect(appSource).toContain('className="link-check-list"')
    expect(appSource).toContain('className={`link-check-card is-${item.status}`}')
    expect(appSource).toContain('locateLink(item.groupId, item.linkId)')
    expect(appSource).toContain('deleteLink(item.groupId, item.linkId)')
    expect(appSource).toContain('confirmHealthyLink(item.linkId)')
    expect(appSource).toContain('problemLinkStatusById.get(link.id)')
    expect(appSource).toContain('has-link-check')
    expect(appSource).toContain('health-badge')
  })

  test('styles the link health panel and highlighted cards', () => {
    expect(css).toContain('.link-check-panel')
    expect(css).toContain('.link-check-list')
    expect(css).toContain('.link-check-card')
    expect(css).toContain('.link-check-card.is-broken')
    expect(css).toContain('.link-check-card.is-limited')
    expect(css).toContain('.link-card-shell.has-link-check.is-broken .link-card')
    expect(css).toContain('.link-card-shell.has-link-check.is-limited .link-card')
    expect(css).toContain('.health-badge')
  })
})
