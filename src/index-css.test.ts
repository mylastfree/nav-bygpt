import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('quick edit stylesheet contract', () => {
  test('hides group and card quick actions until hover or keyboard focus', () => {
    expect(css).toContain('.quick-actions')
    expect(css).toContain('.card-actions')
    expect(css).toMatch(/\.quick-actions[\s\S]*opacity:\s*0/)
    expect(css).toMatch(/\.card-actions[\s\S]*opacity:\s*0/)
    expect(css).toContain('.group-tab:hover .quick-actions')
    expect(css).toContain('.group-tab:focus-within .quick-actions')
    expect(css).toContain('.link-card-shell:hover .card-actions')
    expect(css).toContain('.link-card-shell:focus-within .card-actions')
  })

  test('styles add cards as quiet dashed shortcuts', () => {
    expect(css).toContain('.group-add-tab')
    expect(css).toContain('.add-card')
    expect(css).toContain('border-style: dashed')
  })

  test('allows link titles to wrap without collapsing card layout', () => {
    expect(css).toContain('.link-card-title')
    expect(css).toMatch(/\.link-card-title[\s\S]*overflow-wrap:\s*anywhere/)
    expect(css).toMatch(/\.link-card-title[\s\S]*display:\s*-webkit-box/)
    expect(css).toMatch(/\.link-card-title[\s\S]*-webkit-line-clamp:\s*2/)
  })
})
