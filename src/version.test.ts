import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { APP_VERSION } from './version'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string }
const workerSource = readFileSync(
  fileURLToPath(new URL('../public/_worker.js', import.meta.url)),
  'utf8',
)

describe('app version contract', () => {
  test('uses the package version in the app and worker diagnostics', () => {
    expect(APP_VERSION).toBe(packageJson.version)
    expect(workerSource).toContain(`const APP_VERSION = '${packageJson.version}'`)
  })
})
