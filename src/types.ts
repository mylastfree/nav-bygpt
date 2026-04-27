export type LinkItem = {
  id: string
  title: string
  url: string
  icon?: string
  clickCount?: number
  check?: LinkHealth
}

export type LinkHealth = {
  status: 'ok' | 'limited' | 'broken'
  reason: string
  checkedAt: string
  confirmedAt?: string
}

export type LinkGroup = {
  id: string
  name: string
  color?: GroupColor
  links: LinkItem[]
}

export type CardLayout = 'comfortable' | 'compact' | 'list'
export type GroupColor = 'slate' | 'blue' | 'green' | 'amber' | 'rose' | 'purple' | 'teal'
export type WallpaperIntensity = 'normal' | 'soft'
export type WallpaperPreset =
  | 'none'
  | 'paper'
  | 'dark-desk'
  | 'blue-gray'
  | 'soft-green'
  | 'warm-gray'

export type WallpaperSettings = {
  preset: WallpaperPreset
  intensity: WallpaperIntensity
}

export type DashboardSettings = {
  title: string
  theme: 'light' | 'dark' | 'system'
  cardLayout?: CardLayout
  wallpaper?: WallpaperSettings
}

export type DashboardData = {
  version: 1
  updatedAt: string
  groups: LinkGroup[]
  settings: DashboardSettings
}

export type DashboardBackup = {
  id: string
  createdAt: string
  dashboard: DashboardData
}

export type BackupSummary = {
  id: string
  createdAt: string
  groupCount: number
  linkCount: number
}

export type SaveResult = {
  mode: 'cloud' | 'local'
  updatedAt: string
}
