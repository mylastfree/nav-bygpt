import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')

describe('app health and version contract', () => {
  test('shows the deployed version and exposes a health diagnostic action', () => {
    expect(appSource).toContain('APP_VERSION')
    expect(appSource).toContain('loadHealth')
    expect(appSource).toContain('const [healthStatus, setHealthStatus]')
    expect(appSource).toContain('async function refreshHealthStatus()')
    expect(appSource).toContain('部署诊断')
    expect(appSource).toContain('v{APP_VERSION}')
  })
})
