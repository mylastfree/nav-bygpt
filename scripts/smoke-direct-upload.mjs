import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

function fail(message) {
  throw new Error(message)
}

function normalizeEntry(entry) {
  return entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function readZipEntries(zipPath) {
  const output = execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8' })

  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function extractText(zipPath, entry) {
  return execFileSync('tar', ['-xOf', zipPath, entry], { encoding: 'utf8' })
}

function findLatestDirectUploadZip() {
  const releaseDir = resolve(process.cwd(), 'release')

  if (!existsSync(releaseDir)) {
    fail('release directory was not found. Run npm run package:direct first.')
  }

  const zips = readdirSync(releaseDir)
    .filter((name) => /^cf-startpage-direct-upload-.+\.zip$/.test(name))
    .map((name) => join(releaseDir, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)

  if (zips.length === 0) {
    fail('No Direct Upload zip was found. Run npm run package:direct first.')
  }

  return zips[0]
}

function assertIncludes(normalizedEntries, requiredEntry) {
  if (!normalizedEntries.includes(requiredEntry)) {
    fail(`Missing required root file: ${requiredEntry}`)
  }
}

function findRootAsset(normalizedEntries, extension) {
  return normalizedEntries.filter(
    (entry) => /^index-[^/]+\.[^.]+$/.test(entry) && entry.endsWith(extension),
  )
}

function run() {
  const zipPath = resolve(process.argv[2] || findLatestDirectUploadZip())

  if (!existsSync(zipPath)) {
    fail(`Zip file was not found: ${zipPath}`)
  }

  const rawEntries = readZipEntries(zipPath)
  const rawByNormalized = new Map(
    rawEntries.map((entry) => [normalizeEntry(entry), entry]),
  )
  const normalizedEntries = [...rawByNormalized.keys()].filter(Boolean)
  const assetsEntries = normalizedEntries.filter(
    (entry) => entry === 'assets' || entry.startsWith('assets/'),
  )

  if (assetsEntries.length > 0) {
    fail(`Direct Upload zip must not contain assets/ entries: ${assetsEntries[0]}`)
  }

  for (const requiredEntry of ['favicon.svg', 'index.html', '_headers', '_worker.js']) {
    assertIncludes(normalizedEntries, requiredEntry)
  }

  const jsAssets = findRootAsset(normalizedEntries, '.js')
  const cssAssets = findRootAsset(normalizedEntries, '.css')

  if (jsAssets.length === 0) {
    fail('Missing root index-*.js asset.')
  }

  if (cssAssets.length === 0) {
    fail('Missing root index-*.css asset.')
  }

  const indexHtml = extractText(zipPath, rawByNormalized.get('index.html'))

  if (indexHtml.includes('/assets/') || indexHtml.includes('assets/')) {
    fail('index.html still references assets/.')
  }

  for (const asset of [...jsAssets, ...cssAssets]) {
    if (!indexHtml.includes(asset)) {
      fail(`index.html does not reference root asset: ${asset}`)
    }

    const rawAsset = rawByNormalized.get(asset)
    const content = extractText(zipPath, rawAsset)

    if (!content.trim()) {
      fail(`Root asset is empty: ${asset}`)
    }
  }

  console.log('Direct Upload zip smoke passed')
  console.log(`ZIP=${zipPath}`)
  console.log(`ROOT_JS=${jsAssets.join(',')}`)
  console.log(`ROOT_CSS=${cssAssets.join(',')}`)
  console.log(`FILES=${normalizedEntries.length}`)
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Direct Upload zip smoke failed: ${message}`)
  process.exitCode = 1
}
