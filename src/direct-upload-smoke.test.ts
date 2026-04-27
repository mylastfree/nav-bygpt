import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

const rootDir = fileURLToPath(new URL('../', import.meta.url))
const smokeScript = join(rootDir, 'scripts', 'smoke-direct-upload.mjs')
const tempDirs: string[] = []

function writeEntry(baseDir: string, name: string, content: string) {
  const target = join(baseDir, name)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function createZip(entries: Record<string, string>) {
  const tempDir = mkdtempSync(join(tmpdir(), 'cf-startpage-direct-smoke-'))
  const contentDir = join(tempDir, 'content')
  const zipPath = join(tempDir, 'direct-upload.zip')

  tempDirs.push(tempDir)
  mkdirSync(contentDir)

  for (const [name, content] of Object.entries(entries)) {
    writeEntry(contentDir, name, content)
  }

  execFileSync('tar', ['-a', '-cf', zipPath, '-C', contentDir, '.'])
  return zipPath
}

describe('direct upload smoke test', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()

      if (dir) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  test('is exposed as an npm script', () => {
    const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))

    expect(packageJson.scripts['smoke:direct']).toBe('node scripts/smoke-direct-upload.mjs')
    expect(existsSync(smokeScript)).toBe(true)
  })

  test('accepts a Pages Direct Upload zip with root JS and CSS assets', () => {
    const zipPath = createZip({
      '_headers': '/*\n  X-Frame-Options: DENY\n',
      '_worker.js': 'export default { fetch() { return new Response("ok") } }',
      'favicon.svg': '<svg />',
      'index-test.css': 'body { color: black; }',
      'index-test.js': 'document.body.dataset.ready = "true"',
      'index.html':
        '<!doctype html><script type="module" src="./index-test.js"></script><link rel="stylesheet" href="./index-test.css">',
    })

    const result = spawnSync(process.execPath, [smokeScript, zipPath], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Direct Upload zip smoke passed')
    expect(result.stdout).toContain('index-test.js')
    expect(result.stdout).toContain('index-test.css')
  })

  test('rejects a zip that still uses the assets directory', () => {
    const zipPath = createZip({
      '_headers': '',
      '_worker.js': 'export default { fetch() { return new Response("ok") } }',
      'favicon.svg': '<svg />',
      'assets/index-test.css': 'body { color: black; }',
      'assets/index-test.js': 'document.body.dataset.ready = "true"',
      'index.html':
        '<!doctype html><script type="module" src="/assets/index-test.js"></script><link rel="stylesheet" href="/assets/index-test.css">',
    })

    const result = spawnSync(process.execPath, [smokeScript, zipPath], {
      encoding: 'utf8',
    })

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain('assets/')
  })
})
