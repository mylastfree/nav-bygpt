import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')

describe('admin token storage app contract', () => {
  test('lets the user choose session-only or remembered admin token storage', () => {
    expect(appSource).toContain('loadAdminTokenMode')
    expect(appSource).toContain('const [adminTokenMode, setAdminTokenMode]')
    expect(appSource).toContain("saveAdminToken(token, adminTokenMode)")
    expect(appSource).toContain('本次会话')
    expect(appSource).toContain('记住此设备')
  })
})
