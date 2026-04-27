import {
  findInvalidLinks,
  LOCAL_ADMIN_TOKEN_KEY,
  LOCAL_DASHBOARD_KEY,
  sampleDashboard,
  sanitizeDashboard,
} from './dashboard'
import type {
  BackupSummary,
  DashboardData,
  LinkCheckRequestItem,
  LinkCheckResponse,
  SaveResult,
} from './types'

export async function loadDashboard(): Promise<DashboardData> {
  const localData = loadLocalDashboard()

  try {
    const response = await fetch('/api/dashboard', {
      headers: {
        accept: 'application/json',
      },
    })

    if (response.ok) {
      const remoteData = sanitizeDashboard(await response.json())
      saveLocalDashboard(remoteData)
      return remoteData
    }
  } catch {
    // Vite dev server has no Pages Function, so local data keeps the app usable.
  }

  return localData ?? sampleDashboard
}

export async function saveDashboard(
  dashboard: DashboardData,
  adminToken: string,
): Promise<SaveResult> {
  const updated: DashboardData = sanitizeDashboard({
    ...dashboard,
    updatedAt: new Date().toISOString(),
  })

  const invalidLinks = findInvalidLinks(updated)
  if (invalidLinks.length > 0) {
    throw new Error(`存在无效网址：${invalidLinks[0]}`)
  }

  if (!adminToken.trim()) {
    throw new Error('请输入管理员密码后再保存。')
  }

  try {
    const response = await fetch('/api/dashboard', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${adminToken.trim()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(updated),
    })

    if (response.ok) {
      const result = (await response.json()) as SaveResult
      saveLocalDashboard(updated)
      return {
        mode: 'cloud',
        updatedAt: result.updatedAt || updated.updatedAt,
      }
    }

    if (response.status === 404) {
      saveLocalDashboard(updated)
      return {
        mode: 'local',
        updatedAt: updated.updatedAt,
      }
    }

    const message = await response.text()
    throw new Error(message || `保存失败，HTTP ${response.status}`)
  } catch (error) {
    if (error instanceof TypeError) {
      saveLocalDashboard(updated)
      return {
        mode: 'local',
        updatedAt: updated.updatedAt,
      }
    }

    throw error
  }
}

export async function loadBackups(adminToken: string): Promise<BackupSummary[]> {
  const token = adminToken.trim()

  if (!token) {
    throw new Error('请先输入管理员密码。')
  }

  try {
    const response = await fetch('/api/backups', {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    })

    if (response.ok) {
      const body = (await response.json()) as { backups?: BackupSummary[] }
      return Array.isArray(body.backups) ? body.backups : []
    }

    if (response.status === 404) {
      return []
    }

    const message = await response.text()
    throw new Error(message || `读取备份失败：HTTP ${response.status}`)
  } catch (error) {
    if (error instanceof TypeError) {
      return []
    }

    throw error
  }
}

export async function restoreBackup(
  id: string,
  adminToken: string,
): Promise<SaveResult> {
  const token = adminToken.trim()

  if (!token) {
    throw new Error('请先输入管理员密码。')
  }

  const response = await fetch('/api/backups/restore', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id }),
  })

  if (response.ok) {
    return (await response.json()) as SaveResult
  }

  const message = await response.text()
  throw new Error(message || `恢复备份失败：HTTP ${response.status}`)
}

export async function checkLinks(
  links: LinkCheckRequestItem[],
  adminToken: string,
): Promise<LinkCheckResponse> {
  const token = adminToken.trim()

  if (!token) {
    throw new Error('请先输入管理员密码。')
  }

  try {
    const response = await fetch('/api/link-check', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ links }),
    })

    if (response.ok) {
      return (await response.json()) as LinkCheckResponse
    }

    const message = await response.text()
    throw new Error(message || `检测网址失败：HTTP ${response.status}`)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('无法连接 Cloudflare 检测接口，请检查是否已经上传最新版本。')
    }

    throw error
  }
}

export function loadLocalDashboard() {
  try {
    const raw = localStorage.getItem(LOCAL_DASHBOARD_KEY)
    return raw ? sanitizeDashboard(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveLocalDashboard(dashboard: DashboardData) {
  localStorage.setItem(LOCAL_DASHBOARD_KEY, JSON.stringify(dashboard))
}

export function loadAdminToken() {
  return localStorage.getItem(LOCAL_ADMIN_TOKEN_KEY) || ''
}

export function saveAdminToken(token: string) {
  localStorage.setItem(LOCAL_ADMIN_TOKEN_KEY, token)
}

export function clearAdminToken() {
  localStorage.removeItem(LOCAL_ADMIN_TOKEN_KEY)
}
