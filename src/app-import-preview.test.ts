import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('import preview app contract', () => {
  test('previews imports before applying merge or replace changes', () => {
    expect(appSource).toContain('createImportPreview')
    expect(appSource).toContain('mergeImportedDashboard')
    expect(appSource).toContain('type PendingImportDraft')
    expect(appSource).toContain('const [pendingImport, setPendingImport]')
    expect(appSource).toContain('setPendingImport({')
    expect(appSource).toContain('preview: createImportPreview(dashboard, result.dashboard)')
    expect(appSource).not.toContain('setDashboard(result.dashboard)')
    expect(appSource).toContain("function applyPendingImport(mode: 'merge' | 'replace')")
    expect(appSource).toContain("mode === 'merge'")
    expect(appSource).toContain('getImportConfirmationMessage(mode, pendingImport.preview)')
    expect(appSource).toContain('className="import-preview-warning"')
    expect(appSource).toContain('pendingImport.preview.currentLinkCount')
    expect(appSource).toContain('pendingImport.preview.replaceLinkCount')
    expect(appSource).toContain('pendingImport.preview.removedLinkCount')
    expect(appSource).toContain('mergeImportedDashboard(current, pendingImport.dashboard)')
    expect(appSource).toContain('className="import-preview-backdrop"')
    expect(appSource).toContain('className="import-preview-grid"')
    expect(appSource).toContain('pendingImport.preview.duplicateUrlCount')
    expect(appSource).toContain('pendingImport.skippedCount')
    expect(appSource).toContain('先导出当前数据')
    expect(appSource).toContain('合并导入')
    expect(appSource).toContain('覆盖当前全部数据')
  })

  test('styles import preview confirmation without using nested cards', () => {
    expect(css).toContain('.import-preview-backdrop')
    expect(css).toContain('.import-preview-dialog')
    expect(css).toContain('.import-preview-grid')
    expect(css).toContain('.import-preview-stat')
    expect(css).toContain('.import-preview-warning')
    expect(css).toContain('.import-preview-actions')
  })
})
