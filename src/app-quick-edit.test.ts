import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')

describe('quick edit app contract', () => {
  test('uses hover actions and plus entries instead of full inline card editors', () => {
    expect(appSource).toContain('type QuickEditDraft')
    expect(appSource).toContain('className="quick-actions"')
    expect(appSource).toContain('className="card-actions"')
    expect(appSource).toContain('className="group-add-tab"')
    expect(appSource).toContain('className="add-card"')
    expect(appSource).toContain('className="quick-edit-backdrop"')
    expect(appSource).not.toContain('className="link-editor"')
  })

  test('keeps click counts and drag sorting local until the user saves', () => {
    expect(appSource).toContain('incrementLinkClickCount')
    expect(appSource).toContain('reorderLinkInGroup')
    expect(appSource).toContain('className="click-count"')
    expect(appSource).toContain('draggable={isEditing}')
  })
})
