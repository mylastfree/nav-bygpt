import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const appSource = readFileSync(fileURLToPath(new URL('./App.tsx', import.meta.url)), 'utf8')
const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8')

describe('appearance settings contract', () => {
  test('wires chrome-compatible appearance settings into the pages app', () => {
    expect(appSource).toContain('CARD_LAYOUT_OPTIONS')
    expect(appSource).toContain('WALLPAPER_PRESET_OPTIONS')
    expect(appSource).toContain('WALLPAPER_INTENSITY_OPTIONS')
    expect(appSource).toContain('GROUP_COLOR_OPTIONS')
    expect(appSource).toContain('nextThemePreference')
    expect(appSource).toContain('dataset.cardLayout')
    expect(appSource).toContain('dataset.wallpaper')
    expect(appSource).toContain('dataset.wallpaperIntensity')
    expect(appSource).toContain('className="icon-button theme-toggle-button"')
    expect(appSource).toContain('className="notice-panel appearance-panel"')
    expect(appSource).toContain('function updateWallpaper')
    expect(appSource).toContain('function updateGroupColor')
    expect(appSource).toContain('is-color-${group.color ??')
  })

  test('styles wallpaper presets, layout density, and group color swatches', () => {
    expect(css).toContain(":root[data-wallpaper='paper'] body")
    expect(css).toContain(":root[data-wallpaper='dark-desk'] body")
    expect(css).toContain(":root[data-card-layout='compact'] .link-card")
    expect(css).toContain(":root[data-card-layout='list'] .link-grid")
    expect(css).toContain('.appearance-panel')
    expect(css).toContain('.color-swatch')
    expect(css).toContain('.is-color-teal')
  })
})
