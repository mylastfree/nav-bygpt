import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')

describe('admin token storage app contract', () => {
  test('lets the user choose session-only or remembered admin token storage', () => {
    expect(appSource).toContain('loadAdminTokenMode')
    expect(appSource).toContain('const [adminTokenMode, setAdminTokenMode]')
    expect(appSource).toContain("saveAdminToken(token, adminTokenMode)")
    expect(appSource).toContain('updateAdminTokenMode')
    expect(appSource).toContain('active-admin-token-mode')
    expect(appSource).toContain('密码保存方式：')
    expect(appSource).toContain('本次会话')
    expect(appSource).toContain('记住此设备')
  })

  test('shows a dedicated warning before changing the online admin password', () => {
    expect(appSource).toContain('changeAdminPassword')
    expect(appSource).toContain('password-change-panel')
    expect(appSource).toContain('修改管理员密码')
    expect(appSource).toContain('修改的是在线管理员密码，不会修改 Cloudflare 后台的 ADMIN_TOKEN')
    expect(appSource).toContain('ADMIN_TOKEN 会继续作为救援密码')
    expect(appSource).toContain('确认修改管理员密码吗？')
  })
})
