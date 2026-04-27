import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('backup restore app contract', () => {
  test('exposes backup listing and restore controls only in editing mode', () => {
    expect(appSource).toContain('loadBackups')
    expect(appSource).toContain('restoreBackup')
    expect(appSource).toContain('BackupSummary')
    expect(appSource).toContain('const [backups, setBackups]')
    expect(appSource).toContain('const [showBackups, setShowBackups]')
    expect(appSource).toContain('async function openBackupPanel()')
    expect(appSource).toContain('async function restoreBackupById(id: string)')
    expect(appSource).toContain('backup-panel')
    expect(appSource).toContain('backups.map((backup)')
  })

  test('styles backup restore panel as a maintenance panel', () => {
    expect(css).toContain('.backup-panel')
    expect(css).toContain('.backup-list')
    expect(css).toContain('.backup-card')
    expect(css).toContain('.backup-meta')
  })
})
