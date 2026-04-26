import { describe, expect, test } from 'vitest'
import { createGroupFromName, createLinkFromInput } from './dashboard'

describe('quick add helpers', () => {
  test('creates a group with a trimmed name and default color', () => {
    const group = createGroupFromName('  阅读  ')

    expect(group.id).toMatch(/^group-/)
    expect(group.name).toBe('阅读')
    expect(group.color).toBe('slate')
    expect(group.links).toEqual([])
  })

  test('falls back to a readable group name when input is blank', () => {
    expect(createGroupFromName('   ').name).toBe('新分组')
  })

  test('creates a link with normalized url, optional icon, and zero click count', () => {
    const link = createLinkFromInput({
      title: '  GitHub  ',
      url: 'github.com',
      icon: '   ',
    })

    expect(link.id).toMatch(/^link-/)
    expect(link.title).toBe('GitHub')
    expect(link.url).toBe('https://github.com')
    expect(link.icon).toBeUndefined()
    expect(link.clickCount).toBe(0)
  })

  test('falls back to a readable link title when input is blank', () => {
    expect(createLinkFromInput({ title: '', url: 'https://example.com', icon: '' }).title).toBe(
      '新网站',
    )
  })
})
