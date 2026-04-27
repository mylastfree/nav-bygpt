import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('backup restore app contract', () => {
  test('exposes backup listing and restore controls only in editing mode', () => {
    expect(appSource).toContain('loadBackups')
    expect(appSource).toContain('downloadBackup')
    expect(appSource).toContain('restoreBackup')
    expect(appSource).toContain('BackupSummary')
    expect(appSource).toContain('const [backups, setBackups]')
    expect(appSource).toContain('const [showBackups, setShowBackups]')
    expect(appSource).toContain('const latestNonEmptyBackup = useMemo')
    expect(appSource).toContain('async function openBackupPanel()')
    expect(appSource).toContain('function downloadBackupJson')
    expect(appSource).toContain('async function downloadBackupById(backup: BackupSummary)')
    expect(appSource).toContain('async function restoreBackupById(backup: BackupSummary)')
    expect(appSource).toContain('getRestoreBackupConfirmation(backup)')
    expect(appSource).toContain('restoreLatestNonEmptyBackup')
    expect(appSource).toContain('backup-panel')
    expect(appSource).toContain('backup-recovery-callout')
    expect(appSource).toContain('backups.map((backup)')
    expect(appSource).toContain('下载 JSON')
    expect(appSource).toContain('恢复前会先自动备份当前 KV 数据')
  })

  test('styles backup restore panel as a maintenance panel', () => {
    expect(css).toContain('.backup-panel')
    expect(css).toContain('.backup-recovery-callout')
    expect(css).toContain('.backup-list')
    expect(css).toContain('.backup-card')
    expect(css).toContain('.backup-meta')
  })
})
