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
    expect(appSource).toContain('const [suppressedClickLinkId, setSuppressedClickLinkId]')
    expect(appSource).toContain('const canDragSortLinks = Boolean(isEditing && activeGroup && !isGlobalSearch)')
    expect(appSource).toContain('draggable={canDragSortLinks}')
    expect(appSource).toContain('setSuppressedClickLinkId(sourceLinkId)')
    expect(appSource).toContain('if (suppressedClickLinkId === linkId || draggingLinkId === linkId)')
    expect(appSource).toContain("current === sourceLinkId ? '' : current")
  })

  test('keeps failed favicons from collapsing the title column', () => {
    expect(appSource).toContain("className=\"link-card-title\"")
    expect(appSource).toContain("event.currentTarget.style.visibility = 'hidden'")
    expect(appSource).not.toContain("event.currentTarget.style.display = 'none'")
  })

  test('offers undo and batch selected link operations in edit mode', () => {
    expect(appSource).toContain('type UndoEntry')
    expect(appSource).toContain('const [undoEntry, setUndoEntry]')
    expect(appSource).toContain('function rememberUndo(')
    expect(appSource).toContain('function updateDashboardWithUndo(')
    expect(appSource).toContain('function undoLastChange(')
    expect(appSource).toContain('className="notice-panel compact-notice undo-panel"')
    expect(appSource).toContain('const [selectedLinkIds, setSelectedLinkIds]')
    expect(appSource).toContain('const [batchTargetGroupId, setBatchTargetGroupId]')
    expect(appSource).toContain('function toggleLinkSelection(')
    expect(appSource).toContain('function moveSelectedLinks(')
    expect(appSource).toContain('function deleteSelectedLinks(')
    expect(appSource).toContain('function clearSelectedIcons(')
    expect(appSource).toContain('className="batch-actions"')
    expect(appSource).toContain('className="select-link-card"')
  })

  test('shows the data health panel in edit mode', () => {
    expect(appSource).toContain('getDashboardHealth')
    expect(appSource).toContain('function formatStorageSize(')
    expect(appSource).toContain('const dashboardHealth = useMemo')
    expect(appSource).toContain('className="notice-panel health-panel"')
    expect(appSource).toContain('className="health-grid"')
    expect(appSource).toContain('本地约 {formatStorageSize(dashboardHealth.storageBytes)}')
  })
})
