import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const backupSource = readFileSync(fileURLToPath(new URL('./backup.ts', import.meta.url)), 'utf8')
const backupsPanelSource = readFileSync(
  fileURLToPath(new URL('./components/BackupsPanel.tsx', import.meta.url)),
  'utf8',
)
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('backup restore app contract', () => {
  test('keeps backup listing in a dedicated panel with restore preview controls', () => {
    expect(appSource).toContain('loadBackups')
    expect(appSource).toContain('downloadBackup')
    expect(appSource).toContain('restoreBackup')
    expect(appSource).toContain('compareRestoreDashboard')
    expect(appSource).toContain('BackupSummary')
    expect(appSource).toContain('RestorePreviewState')
    expect(appSource).toContain('const [backups, setBackups]')
    expect(appSource).toContain('const [showBackups, setShowBackups]')
    expect(appSource).toContain('const [restorePreview, setRestorePreview]')
    expect(appSource).toContain('const latestNonEmptyBackup = useMemo')
    expect(appSource).toContain('async function openBackupPanel()')
    expect(appSource).toContain('function downloadBackupJson')
    expect(appSource).toContain('async function downloadBackupById(backup: BackupSummary)')
    expect(appSource).toContain('async function previewRestoreBackup(backup: BackupSummary)')
    expect(appSource).toContain('async function confirmRestoreBackup()')
    expect(appSource).toContain('restoreLatestNonEmptyBackup')
    expect(appSource).toContain('<BackupsPanel')
    expect(backupSource).toContain('compareRestoreDashboard')
    expect(backupsPanelSource).toContain('restorePreview')
    expect(backupsPanelSource).toContain('backup-panel')
    expect(backupsPanelSource).toContain('backup-recovery-callout')
    expect(backupsPanelSource).toContain('backups.map((backup)')
    expect(backupsPanelSource).toContain('下载 JSON')
    expect(backupsPanelSource).toContain('当前数据')
    expect(backupsPanelSource).toContain('备份数据')
    expect(backupsPanelSource).toContain('恢复前会自动备份当前 KV 数据')
  })

  test('styles backup restore panel as a maintenance panel', () => {
    expect(css).toContain('.backup-panel')
    expect(css).toContain('.backup-recovery-callout')
    expect(css).toContain('.backup-list')
    expect(css).toContain('.backup-card')
    expect(css).toContain('.backup-meta')
    expect(css).toContain('.backup-restore-preview')
    expect(css).toContain('.restore-comparison-grid')
  })
})
