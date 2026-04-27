import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const cssSource = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('unsaved change status contract', () => {
  test('makes unsaved dashboard changes obvious until they are saved', () => {
    expect(appSource).toContain('const [hasUnsavedChanges, setHasUnsavedChanges]')
    expect(appSource).toContain('function setUnsavedStatus')
    expect(appSource).toContain('setHasUnsavedChanges(true)')
    expect(appSource).toContain('请记得保存到 Cloudflare KV')
    expect(appSource).toContain('setHasUnsavedChanges(false)')
    expect(appSource).toContain('点“完成”只是退出编辑模式，不会保存到 Cloudflare KV')
    expect(appSource).toContain("className={`status ${hasUnsavedChanges ? 'status-unsaved' : ''}`}")
    expect(appSource).toContain('className="status-flag"')
    expect(cssSource).toContain('.status-unsaved')
    expect(cssSource).toContain('.status-flag')
  })
})
