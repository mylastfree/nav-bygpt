import {
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type AdminTokenStorageMode,
  checkLinks,
  clearAdminToken,
  downloadBackup,
  loadAdminToken,
  loadAdminTokenMode,
  loadBackups,
  loadDashboard,
  loadHealth,
  restoreBackup,
  saveAdminToken,
  saveDashboard,
  saveLinkClick,
  saveLocalDashboard,
} from './api'
import {
  CARD_LAYOUT_OPTIONS,
  GROUP_COLOR_OPTIONS,
  WALLPAPER_INTENSITY_OPTIONS,
  WALLPAPER_PRESET_OPTIONS,
  clearLinkIcons,
  createGroupFromName,
  createLinkFromInput,
  deleteLinks,
  faviconUrl,
  type DuplicateLinkGroup,
  findDuplicateLinkIds,
  findDuplicateLinks,
  incrementLinkClickCount,
  isSafeUrl,
  moveItem,
  moveLinksToGroup,
  nextThemePreference,
  normalizeUrl,
  reorderLinkInGroup,
} from './dashboard'
import { isImportFileTooLarge, parseDashboardImport } from './importers'
import {
  applyLinkCheckResults,
  confirmLinkCheckResult,
  createImportPreview,
  getDashboardHealth,
  getStoredLinkCheckResults,
  mergeImportedDashboard,
  removeDuplicateLinksByUrl,
  type ImportPreview,
  type LinkCheckResult,
} from './maintenance'
import { APP_VERSION } from './version'
import type {
  CardLayout,
  BackupSummary,
  DashboardData,
  GroupColor,
  HealthStatus,
  LinkCheckRequestItem,
  LinkItem,
  WallpaperIntensity,
  WallpaperPreset,
} from './types'

type QuickEditDraft =
  | {
      kind: 'group'
      mode: 'create' | 'edit'
      groupId?: string
      name: string
    }
  | {
      kind: 'link'
      mode: 'create' | 'edit'
      groupId: string
      linkId?: string
      title: string
      url: string
      icon: string
    }

type SearchScope = 'group' | 'all'
type CheckFilter = 'issues' | 'broken' | 'limited' | 'ok' | 'all'

type VisibleLink = {
  groupId: string
  groupName: string
  link: LinkItem
}

type PendingImportDraft = {
  fileName: string
  sourceName: string
  dashboard: DashboardData
  preview: ImportPreview
  skippedCount: number
}

type UndoEntry = {
  label: string
  dashboard: DashboardData
}

const cardLayoutLabels: Record<CardLayout, string> = {
  comfortable: '舒适卡片',
  compact: '紧凑卡片',
  list: '列表模式',
}

const wallpaperPresetLabels: Record<WallpaperPreset, string> = {
  none: '无背景',
  paper: '柔和纸面',
  'dark-desk': '深色工作台',
  'blue-gray': '清晨蓝灰',
  'soft-green': '绿色护眼',
  'warm-gray': '暖灰',
}

const wallpaperIntensityLabels: Record<WallpaperIntensity, string> = {
  normal: '标准',
  soft: '更淡',
}

const groupColorLabels: Record<GroupColor, string> = {
  slate: '灰',
  blue: '蓝',
  green: '绿',
  amber: '黄',
  rose: '红',
  purple: '紫',
  teal: '青',
}

const linkCheckStatusLabels: Record<NonNullable<LinkItem['check']>['status'], string> = {
  ok: '正常',
  limited: '无法确认',
  broken: '疑似失效',
}

const LINK_CHECK_BATCH_SIZE = 50

function getReplaceImportWarning(preview: ImportPreview) {
  if (preview.replaceLinkCount === 0 && preview.currentLinkCount > 0) {
    return `导入文件里没有网站，覆盖后会清空当前 ${preview.currentLinkCount} 个网站。`
  }

  if (preview.replaceGroupCount === 0 && preview.currentGroupCount > 0) {
    return `导入文件里没有分组，覆盖后会清空当前 ${preview.currentGroupCount} 个分组。`
  }

  if (preview.removedLinkCount > 0) {
    return `覆盖后网站数量会从 ${preview.currentLinkCount} 个变成 ${preview.replaceLinkCount} 个，减少 ${preview.removedLinkCount} 个。`
  }

  return ''
}

function getImportConfirmationMessage(
  mode: 'merge' | 'replace',
  preview: ImportPreview,
) {
  if (mode === 'merge' && preview.importedLinkCount === 0) {
    return '导入文件里没有可用网站，继续合并不会新增内容。确定继续？'
  }

  if (mode === 'replace') {
    const warning = getReplaceImportWarning(preview)

    if (warning) {
      return `${warning}\n\n建议先导出当前数据，并确认 KV 备份可用。确定覆盖当前数据吗？`
    }
  }

  return ''
}

function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(1)} KB`
}

function backupDownloadFileName(backup: BackupSummary) {
  const timestamp = backup.createdAt.replace(/[^a-zA-Z0-9._-]/g, '-')
  return `nav-backup-${timestamp}.json`
}

function downloadBackupJson(dashboard: DashboardData, fileName: string) {
  const blob = new Blob([JSON.stringify(dashboard, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [query, setQuery] = useState('')
  const [searchScope, setSearchScope] = useState<SearchScope>('group')
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(() => new Set())
  const [batchTargetGroupId, setBatchTargetGroupId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [adminToken, setAdminToken] = useState(loadAdminToken)
  const [adminTokenMode, setAdminTokenMode] = useState(loadAdminTokenMode)
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [status, setStatus] = useState('正在加载...')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState('')
  const [quickEdit, setQuickEdit] = useState<QuickEditDraft | null>(null)
  const [draggingLinkId, setDraggingLinkId] = useState('')
  const [dragOverLinkId, setDragOverLinkId] = useState('')
  const [suppressedClickLinkId, setSuppressedClickLinkId] = useState('')
  const [highlightedLinkId, setHighlightedLinkId] = useState('')
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImportDraft | null>(null)
  const [backups, setBackups] = useState<BackupSummary[]>([])
  const [showBackups, setShowBackups] = useState(false)
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [isRestoringBackup, setIsRestoringBackup] = useState(false)
  const [isCheckingLinks, setIsCheckingLinks] = useState(false)
  const [checkFilter, setCheckFilter] = useState<CheckFilter>('issues')
  const [linkCheckProgress, setLinkCheckProgress] = useState({ done: 0, total: 0 })
  const [currentLinkCheckResults, setCurrentLinkCheckResults] = useState<LinkCheckResult[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let isMounted = true

    loadDashboard()
      .then((data) => {
        if (!isMounted) {
          return
        }

        setDashboard(data)
        setStatus('已就绪')
      })
      .catch(() => {
        if (isMounted) {
          setStatus('加载失败，请刷新重试')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (dashboard) {
      document.documentElement.dataset.theme = dashboard.settings.theme
      document.documentElement.dataset.cardLayout =
        dashboard.settings.cardLayout ?? 'comfortable'
      document.documentElement.dataset.wallpaper =
        dashboard.settings.wallpaper?.preset ?? 'none'
      document.documentElement.dataset.wallpaperIntensity =
        dashboard.settings.wallpaper?.intensity ?? 'normal'
      document.title = dashboard.settings.title
    }
  }, [dashboard])

  useEffect(() => {
    if (!dashboard) {
      return
    }

    if (dashboard.groups.length === 0) {
      if (activeGroupId) {
        setActiveGroupId('')
      }
      return
    }

    if (!dashboard.groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(dashboard.groups[0].id)
    }
  }, [activeGroupId, dashboard])

  useEffect(() => {
    if (!dashboard || dashboard.groups.length === 0) {
      if (batchTargetGroupId) {
        setBatchTargetGroupId('')
      }
      return
    }

    if (!dashboard.groups.some((group) => group.id === batchTargetGroupId)) {
      setBatchTargetGroupId(dashboard.groups[0].id)
    }
  }, [batchTargetGroupId, dashboard])

  const activeGroup = useMemo(() => {
    if (!dashboard || dashboard.groups.length === 0) {
      return null
    }

    return (
      dashboard.groups.find((group) => group.id === activeGroupId) ??
      dashboard.groups[0]
    )
  }, [activeGroupId, dashboard])

  const activeGroupIndex = useMemo(() => {
    if (!dashboard || !activeGroup) {
      return -1
    }

    return dashboard.groups.findIndex((group) => group.id === activeGroup.id)
  }, [activeGroup, dashboard])

  const visibleLinkItems = useMemo<VisibleLink[]>(() => {
    if (!dashboard || !activeGroup) {
      return []
    }

    const keyword = query.trim().toLocaleLowerCase()
    const sourceGroups =
      searchScope === 'all' && !isEditing && keyword ? dashboard.groups : [activeGroup]

    return sourceGroups.flatMap((group) =>
      group.links
        .map((link) => ({
          groupId: group.id,
          groupName: group.name,
          link,
        }))
        .filter((item) => {
          if (!keyword || isEditing) {
            return true
          }

          return (
            item.link.title.toLocaleLowerCase().includes(keyword) ||
            item.link.url.toLocaleLowerCase().includes(keyword) ||
            item.groupName.toLocaleLowerCase().includes(keyword)
          )
        }),
    )
  }, [activeGroup, dashboard, isEditing, query, searchScope])

  const totalLinks = useMemo(() => {
    return dashboard?.groups.reduce((count, group) => count + group.links.length, 0) ?? 0
  }, [dashboard])

  const duplicateLinks = useMemo(() => {
    return dashboard ? findDuplicateLinks(dashboard) : []
  }, [dashboard])

  const duplicateLinkIds = useMemo(() => {
    return findDuplicateLinkIds(duplicateLinks)
  }, [duplicateLinks])

  const storedLinkCheckResults = useMemo(() => {
    return dashboard ? getStoredLinkCheckResults(dashboard) : []
  }, [dashboard])

  const visibleLinkCheckResults =
    currentLinkCheckResults.length > 0 ? currentLinkCheckResults : storedLinkCheckResults

  const brokenLinkResults = useMemo(() => {
    return visibleLinkCheckResults.filter((item) => item.status === 'broken')
  }, [visibleLinkCheckResults])

  const limitedLinkResults = useMemo(() => {
    return visibleLinkCheckResults.filter((item) => item.status === 'limited')
  }, [visibleLinkCheckResults])

  const okLinkCount = useMemo(() => {
    return visibleLinkCheckResults.filter((item) => item.status === 'ok').length
  }, [visibleLinkCheckResults])

  const filteredLinkCheckResults = useMemo(() => {
    if (checkFilter === 'all') {
      return visibleLinkCheckResults
    }

    if (checkFilter === 'issues') {
      return visibleLinkCheckResults.filter((item) => item.status === 'broken')
    }

    return visibleLinkCheckResults.filter((item) => item.status === checkFilter)
  }, [checkFilter, visibleLinkCheckResults])

  const problemLinkChecks = useMemo(() => {
    return visibleLinkCheckResults.filter((check) => check.status === 'broken')
  }, [visibleLinkCheckResults])

  const problemLinkStatusById = useMemo(() => {
    return new Map(problemLinkChecks.map((check) => [check.linkId, check.status]))
  }, [problemLinkChecks])

  const dashboardHealth = useMemo(() => {
    return dashboard ? getDashboardHealth(dashboard, backups) : null
  }, [backups, dashboard])

  const latestNonEmptyBackup = useMemo(() => {
    return backups.find((backup) => backup.linkCount > 0) ?? null
  }, [backups])

  const isGlobalSearch = !isEditing && searchScope === 'all' && query.trim().length > 0
  const canDragSortLinks = Boolean(isEditing && activeGroup && !isGlobalSearch)
  const selectedCount = selectedLinkIds.size
  const pendingImportWarning = pendingImport
    ? getReplaceImportWarning(pendingImport.preview)
    : ''

  function setUnsavedStatus(message = '已修改') {
    setHasUnsavedChanges(true)
    setStatus(`${message}，请记得保存到 Cloudflare KV`)
  }

  function updateDashboard(updater: (current: DashboardData) => DashboardData) {
    setDashboard((current) => {
      if (!current) {
        return current
      }

      return updater(current)
    })
    setUnsavedStatus()
  }

  function rememberUndo(label: string, previousDashboard: DashboardData) {
    setUndoEntry({
      label,
      dashboard: previousDashboard,
    })
  }

  function updateDashboardWithUndo(
    label: string,
    updater: (current: DashboardData) => DashboardData,
  ) {
    if (!dashboard) {
      return
    }

    rememberUndo(label, dashboard)
    setDashboard(updater(dashboard))
    setUnsavedStatus(`${label}已完成`)
  }

  function undoLastChange() {
    if (!undoEntry) {
      return
    }

    setDashboard(undoEntry.dashboard)
    setActiveGroupId(undoEntry.dashboard.groups[0]?.id ?? '')
    setSelectedLinkIds(new Set())
    setCurrentLinkCheckResults([])
    setUndoEntry(null)
    setUnsavedStatus(`已撤销：${undoEntry.label}`)
  }

  function unlockEditing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = tokenDraft.trim()

    if (!token) {
      setStatus('请输入管理员密码')
      return
    }

    saveAdminToken(token, adminTokenMode)
    setAdminToken(token)
    setTokenDraft('')
    setShowTokenForm(false)
    setIsEditing(true)
    setStatus('已进入编辑模式')
  }

  function startEditing() {
    if (adminToken) {
      setIsEditing(true)
      setStatus(
        `已进入编辑模式，密码保存方式：${
          adminTokenMode === 'device' ? '记住此设备' : '本次会话'
        }`,
      )
      return
    }

    setShowTokenForm(true)
  }

  function updateAdminTokenMode(mode: AdminTokenStorageMode) {
    setAdminTokenMode(mode)

    if (!adminToken) {
      return
    }

    saveAdminToken(adminToken, mode)
    setStatus(`密码保存方式已改为：${mode === 'device' ? '记住此设备' : '本次会话'}`)
  }

  function lockEditing() {
    if (
      hasUnsavedChanges &&
      !confirm('当前有未保存修改。点“完成”只是退出编辑模式，不会保存到 Cloudflare KV。\n\n确定退出编辑模式吗？')
    ) {
      return
    }

    setIsEditing(false)
    setShowTokenForm(false)
    setStatus(
      hasUnsavedChanges
        ? '已退出编辑模式，但仍有未保存修改，请回到编辑模式保存到 Cloudflare KV'
        : '已退出编辑模式',
    )
  }

  function forgetToken() {
    clearAdminToken()
    setAdminToken('')
    setAdminTokenMode('session')
    setIsEditing(false)
    setShowTokenForm(false)
    setStatus('已清除本机保存的管理员密码')
  }

  async function handleSave() {
    if (!dashboard) {
      return
    }

    setIsSaving(true)
    setStatus('正在保存...')

    try {
      const result = await saveDashboard(dashboard, adminToken)
      setDashboard((current) =>
        current
          ? {
              ...current,
              updatedAt: result.updatedAt,
            }
          : current,
      )
      setHasUnsavedChanges(false)
      setStatus(result.mode === 'cloud' ? '已保存到 Cloudflare KV' : '已保存到本机')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  async function openBackupPanel() {
    setIsLoadingBackups(true)
    setStatus('正在读取备份...')

    try {
      const items = await loadBackups(adminToken)
      setBackups(items)
      setShowBackups(true)
      setStatus(items.length > 0 ? `已读取 ${items.length} 个备份` : '还没有 KV 备份')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取备份失败')
    } finally {
      setIsLoadingBackups(false)
    }
  }

  async function refreshHealthStatus() {
    setStatus('正在读取部署诊断...')

    try {
      const info = await loadHealth()
      setHealthStatus(info)
      setStatus(info.ok ? '部署诊断已刷新' : '部署诊断提示需要检查配置')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取部署诊断失败')
    }
  }

  async function downloadBackupById(backup: BackupSummary) {
    setStatus('正在下载备份...')

    try {
      const data = await downloadBackup(backup.id, adminToken)
      downloadBackupJson(data, backupDownloadFileName(backup))
      setStatus('已下载备份 JSON')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '下载备份失败')
    }
  }

  function getRestoreBackupConfirmation(backup: BackupSummary) {
    return [
      '恢复这个备份？',
      '',
      `备份时间：${formatBackupDate(backup.createdAt)}`,
      `分组：${backup.groupCount}`,
      `网站：${backup.linkCount}`,
      '',
      '恢复前会先自动备份当前 KV 数据。',
    ].join('\n')
  }

  async function restoreBackupById(backup: BackupSummary) {
    if (!dashboard) {
      return
    }

    if (!confirm(getRestoreBackupConfirmation(backup))) {
      return
    }

    const previousDashboard = dashboard
    setIsRestoringBackup(true)
    setStatus('正在恢复备份...')

    try {
      const result = await restoreBackup(backup.id, adminToken)
      const data = await loadDashboard()

      rememberUndo('恢复备份', previousDashboard)
      setDashboard(data)
      setActiveGroupId(data.groups[0]?.id ?? '')
      setSelectedLinkIds(new Set())
      setCurrentLinkCheckResults([])
      setShowBackups(false)
      setHasUnsavedChanges(false)
      setStatus(`已恢复备份，更新时间 ${formatBackupDate(result.updatedAt)}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '恢复备份失败')
    } finally {
      setIsRestoringBackup(false)
    }
  }

  async function restoreLatestNonEmptyBackup() {
    if (!latestNonEmptyBackup) {
      await openBackupPanel()
      return
    }

    await restoreBackupById(latestNonEmptyBackup)
  }

  async function runLinkCheck() {
    if (!dashboard || isCheckingLinks) {
      return
    }

    const links: LinkCheckRequestItem[] = dashboard.groups.flatMap((group) =>
      group.links.map((link) => ({
        id: link.id,
        url: normalizeUrl(link.url),
      })),
    )

    if (links.length === 0) {
      setStatus('还没有可检测的网址')
      return
    }

    const linkMetaById = new Map(
      dashboard.groups.flatMap((group) =>
        group.links.map((link): [
          string,
          {
            groupId: string
            groupName: string
            title: string
            url: string
          },
        ] => [
          link.id,
          {
            groupId: group.id,
            groupName: group.name,
            title: link.title,
            url: normalizeUrl(link.url),
          },
        ]),
      ),
    )

    setIsCheckingLinks(true)
    setCheckFilter('issues')
    setCurrentLinkCheckResults([])
    setLinkCheckProgress({ done: 0, total: links.length })
    setStatus(`正在检测 ${links.length} 个网址...`)

    try {
      const results: LinkCheckResult[] = []
      let checkedAt = new Date().toISOString()

      for (let index = 0; index < links.length; index += LINK_CHECK_BATCH_SIZE) {
        const batch = links.slice(index, index + LINK_CHECK_BATCH_SIZE)
        const response = await checkLinks(
          batch,
          adminToken,
        )
        checkedAt = response.checkedAt || checkedAt

        for (const result of response.results) {
          const meta = linkMetaById.get(result.id)

          if (!meta) {
            continue
          }

          results.push({
            linkId: result.id,
            groupId: meta.groupId,
            groupName: meta.groupName,
            title: meta.title,
            url: result.url || meta.url,
            status: result.check.status,
            reason: result.check.reason,
            checkedAt: result.check.checkedAt || response.checkedAt,
          })
        }

        setCurrentLinkCheckResults([...results])
        setLinkCheckProgress({
          done: Math.min(index + batch.length, links.length),
          total: links.length,
        })
      }

      rememberUndo('检测网址', dashboard)
      updateDashboard((current) => applyLinkCheckResults(current, results, checkedAt))
      setCurrentLinkCheckResults(results)
      setHighlightedLinkId('')

      const brokenCount = results.filter((result) => result.status === 'broken').length
      const limitedCount = results.filter((result) => result.status === 'limited').length
      const statusMessage =
        brokenCount > 0
          ? `已检测 ${results.length} 个网址，发现 ${brokenCount} 条疑似失效，${limitedCount} 条无法确认`
          : limitedCount > 0
            ? `已检测 ${results.length} 个网址，没有发现明确失效，${limitedCount} 条无法确认`
            : `已检测 ${results.length} 个网址，暂未发现疑似失效`
      setUnsavedStatus(statusMessage)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '检测网址失败')
    } finally {
      setIsCheckingLinks(false)
    }
  }

  function startQuickAddGroup() {
    setQuickEdit({
      kind: 'group',
      mode: 'create',
      name: '',
    })
  }

  function startQuickEditGroup(groupId: string, name: string) {
    setQuickEdit({
      kind: 'group',
      mode: 'edit',
      groupId,
      name,
    })
  }

  function startQuickAddLink(groupId: string) {
    setQuickEdit({
      kind: 'link',
      mode: 'create',
      groupId,
      title: '',
      url: '',
      icon: '',
    })
  }

  function startQuickEditLink(groupId: string, link: LinkItem) {
    setQuickEdit({
      kind: 'link',
      mode: 'edit',
      groupId,
      linkId: link.id,
      title: link.title,
      url: link.url,
      icon: link.icon || '',
    })
  }

  function updateQuickEditField(field: 'name' | 'title' | 'url' | 'icon', value: string) {
    setQuickEdit((current) =>
      current
        ? ({
            ...current,
            [field]: value,
          } as QuickEditDraft)
        : current,
    )
  }

  function saveQuickEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!quickEdit) {
      return
    }

    if (quickEdit.kind === 'group') {
      if (quickEdit.mode === 'create') {
        const group = createGroupFromName(quickEdit.name)

        updateDashboardWithUndo('新增分组', (current) => ({
          ...current,
          groups: [...current.groups, group],
        }))
        setActiveGroupId(group.id)
      } else if (quickEdit.groupId) {
        updateGroupName(quickEdit.groupId, quickEdit.name.trim() || '新分组')
      }

      setQuickEdit(null)
      return
    }

    if (!isSafeUrl(quickEdit.url)) {
      setStatus('只支持 http 或 https 地址')
      return
    }

    if (quickEdit.mode === 'create') {
      const link = createLinkFromInput({
        title: quickEdit.title,
        url: quickEdit.url,
        icon: quickEdit.icon,
      })

      updateDashboardWithUndo('新增网址', (current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === quickEdit.groupId
            ? {
                ...group,
                links: [...group.links, link],
              }
            : group,
        ),
      }))
    } else if (quickEdit.linkId) {
      updateLink(quickEdit.groupId, quickEdit.linkId, {
        title: quickEdit.title.trim() || '新网站',
        url: normalizeUrl(quickEdit.url),
        icon: quickEdit.icon.trim() || undefined,
      })
    }

    setQuickEdit(null)
  }

  function updateGroupName(groupId: string, name: string) {
    updateDashboardWithUndo('编辑分组', (current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              name,
            }
          : group,
      ),
    }))
  }

  function deleteGroup(groupId: string) {
    if (!confirm('删除这个分组和里面的所有网站？')) {
      return
    }

    updateDashboardWithUndo('删除分组', (current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }))
    setSelectedLinkIds(new Set())
    setCurrentLinkCheckResults((current) =>
      current.filter((item) => item.groupId !== groupId),
    )
  }

  function moveGroup(groupIndex: number, direction: -1 | 1) {
    updateDashboardWithUndo('调整分组排序', (current) => ({
      ...current,
      groups: moveItem(current.groups, groupIndex, direction),
    }))
  }

  function updateLink(groupId: string, linkId: string, patch: Partial<LinkItem>) {
    updateDashboardWithUndo('编辑网址', (current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: group.links.map((link) =>
                link.id === linkId
                  ? {
                      ...link,
                      ...patch,
                    }
                  : link,
              ),
            }
          : group,
      ),
    }))
  }

  function deleteLink(groupId: string, linkId: string) {
    updateDashboardWithUndo('删除网址', (current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: group.links.filter((link) => link.id !== linkId),
            }
          : group,
        ),
    }))
    setSelectedLinkIds((current) => {
      const next = new Set(current)
      next.delete(linkId)
      return next
    })
    setCurrentLinkCheckResults((current) =>
      current.filter((item) => item.linkId !== linkId),
    )
  }

  function findLinkForCheck(groupId: string, linkId: string) {
    const group = dashboard?.groups.find((item) => item.id === groupId)

    return group?.links.find((link) => link.id === linkId) ?? null
  }

  function locateLink(groupId: string, linkId: string) {
    setActiveGroupId(groupId)
    setSearchScope('group')
    setQuery('')
    setHighlightedLinkId(linkId)

    window.setTimeout(() => {
      document
        .getElementById(`link-card-${linkId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  function confirmHealthyLink(linkId: string) {
    updateDashboardWithUndo('确认链接正常', (current) =>
      confirmLinkCheckResult(current, linkId, new Date().toISOString()),
    )
    setCurrentLinkCheckResults((current) =>
      current.map((item) =>
        item.linkId === linkId
          ? {
              ...item,
              status: 'ok',
              reason: '手动确认正常',
            }
          : item,
      ),
    )
    setHighlightedLinkId('')
    setUnsavedStatus('已确认链接没问题')
  }

  function removeDuplicateGroup(duplicate: DuplicateLinkGroup) {
    if (!confirm('保留第一个网址，删除其它重复项？')) {
      return
    }

    updateDashboardWithUndo('整理重复网址', (current) =>
      removeDuplicateLinksByUrl(current, duplicate.url),
    )
    setHighlightedLinkId('')
    setUnsavedStatus('已整理重复网址')
  }

  function toggleLinkSelection(linkId: string) {
    setSelectedLinkIds((current) => {
      const next = new Set(current)

      if (next.has(linkId)) {
        next.delete(linkId)
      } else {
        next.add(linkId)
      }

      return next
    })
  }

  function moveSelectedLinks() {
    const targetGroupId = batchTargetGroupId || activeGroupId

    if (!targetGroupId || selectedLinkIds.size === 0) {
      return
    }

    updateDashboardWithUndo('移动选中网址', (current) =>
      moveLinksToGroup(current, selectedLinkIds, targetGroupId),
    )
    setActiveGroupId(targetGroupId)
    setSelectedLinkIds(new Set())
  }

  function deleteSelectedLinks() {
    if (selectedLinkIds.size === 0) {
      return
    }

    if (!confirm(`删除选中的 ${selectedLinkIds.size} 个网站？`)) {
      return
    }

    updateDashboardWithUndo('删除选中网址', (current) =>
      deleteLinks(current, selectedLinkIds),
    )
    setCurrentLinkCheckResults((current) =>
      current.filter((item) => !selectedLinkIds.has(item.linkId)),
    )
    setSelectedLinkIds(new Set())
  }

  function clearSelectedIcons() {
    if (selectedLinkIds.size === 0) {
      return
    }

    updateDashboardWithUndo('清空选中图标', (current) =>
      clearLinkIcons(current, selectedLinkIds),
    )
    setSelectedLinkIds(new Set())
  }

  async function recordLinkClick(groupId: string, linkId: string) {
    if (!adminToken || !dashboard) {
      return
    }

    const nextDashboard = incrementLinkClickCount(dashboard, groupId, linkId)
    setDashboard(nextDashboard)
    saveLocalDashboard(nextDashboard)

    if (hasUnsavedChanges) {
      setUnsavedStatus('点击次数已本地记录')
      return
    }

    try {
      const result = await saveLinkClick(groupId, linkId, adminToken)
      setDashboard((current) =>
        current
          ? {
              ...current,
              updatedAt: result.updatedAt,
            }
          : current,
      )
      setHasUnsavedChanges(false)
      setStatus(result.mode === 'cloud' ? '点击次数已自动保存' : '点击次数已记录到本机')
    } catch (error) {
      setHasUnsavedChanges(true)
      setStatus(
        error instanceof Error
          ? `点击次数已本地记录，自动保存失败：${error.message}`
          : '点击次数已本地记录，自动保存失败',
      )
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setQuery('')
      return
    }

    if (event.key !== 'Enter' || isEditing) {
      return
    }

    const first = visibleLinkItems[0]
    if (!first) {
      return
    }

    event.preventDefault()
    void recordLinkClick(first.groupId, first.link.id)
    window.open(normalizeUrl(first.link.url), '_blank', 'noopener,noreferrer')
  }

  function handleLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
    groupId: string,
    linkId: string,
  ) {
    if (suppressedClickLinkId === linkId || draggingLinkId === linkId) {
      event.preventDefault()
      setSuppressedClickLinkId('')
      return
    }

    if (isEditing) {
      event.preventDefault()
      return
    }

    void recordLinkClick(groupId, linkId)
  }

  function handleLinkDragStart(
    event: DragEvent<HTMLElement>,
    groupId: string,
    linkId: string,
  ) {
    if (!canDragSortLinks || groupId !== activeGroup?.id) {
      event.preventDefault()
      return
    }

    setDraggingLinkId(linkId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', linkId)
  }

  function handleLinkDragOver(
    event: DragEvent<HTMLElement>,
    groupId: string,
    linkId: string,
  ) {
    if (
      !canDragSortLinks ||
      groupId !== activeGroup?.id ||
      !draggingLinkId ||
      draggingLinkId === linkId
    ) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverLinkId(linkId)
  }

  function handleLinkDrop(
    event: DragEvent<HTMLElement>,
    groupId: string,
    targetLinkId: string,
  ) {
    if (!canDragSortLinks || groupId !== activeGroup?.id) {
      resetLinkDrag()
      return
    }

    event.preventDefault()
    const sourceLinkId = draggingLinkId || event.dataTransfer.getData('text/plain')
    setDraggingLinkId('')
    setDragOverLinkId('')

    if (!sourceLinkId || sourceLinkId === targetLinkId) {
      return
    }

    setSuppressedClickLinkId(sourceLinkId)
    window.setTimeout(() => {
      setSuppressedClickLinkId((current) => (current === sourceLinkId ? '' : current))
    }, 250)

    updateDashboardWithUndo('调整网址排序', (current) =>
      reorderLinkInGroup(current, groupId, sourceLinkId, targetLinkId),
    )
  }

  function resetLinkDrag() {
    setDraggingLinkId('')
    setDragOverLinkId('')
  }

  function updateSetting<K extends keyof DashboardData['settings']>(
    key: K,
    value: DashboardData['settings'][K],
  ) {
    updateDashboard((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: value,
      },
    }))
  }

  function updateWallpaper<K extends keyof NonNullable<DashboardData['settings']['wallpaper']>>(
    key: K,
    value: NonNullable<DashboardData['settings']['wallpaper']>[K],
  ) {
    updateDashboard((current) => ({
      ...current,
      settings: {
        ...current.settings,
        wallpaper: {
          preset: current.settings.wallpaper?.preset ?? 'none',
          intensity: current.settings.wallpaper?.intensity ?? 'normal',
          [key]: value,
        },
      },
    }))
  }

  function updateGroupColor(groupId: string, color: GroupColor) {
    updateDashboard((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              color,
            }
          : group,
      ),
    }))
  }

  function toggleFrontTheme() {
    if (!dashboard) {
      return
    }

    const theme = nextThemePreference(dashboard.settings.theme)
    updateSetting('theme', theme)
    setUnsavedStatus(theme === 'dark' ? '已切换到深色' : '已切换到浅色')
  }

  function exportJson() {
    if (!dashboard) {
      return
    }

    const blob = new Blob([JSON.stringify(dashboard, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `startpage-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('已导出 JSON 备份')
  }

  async function importJson(file: File | undefined) {
    if (!file || !dashboard) {
      return
    }

    try {
      if (isImportFileTooLarge(file)) {
        setStatus('导入失败，文件不能超过 10MB')
        return
      }

      const text = await file.text()
      const result = parseDashboardImport(file.name, text)

      setPendingImport({
        fileName: file.name,
        sourceName: result.source === 'itab' ? 'iTab .itabdata' : '本程序 JSON',
        dashboard: result.dashboard,
        preview: createImportPreview(dashboard, result.dashboard),
        skippedCount: result.skipped.length,
      })
      setStatus('已解析导入文件，请确认合并或覆盖')
    } catch (error) {
      setStatus(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请检查文件')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function applyPendingImport(mode: 'merge' | 'replace') {
    if (!pendingImport || !dashboard) {
      return
    }

    const confirmationMessage = getImportConfirmationMessage(mode, pendingImport.preview)

    if (confirmationMessage && !confirm(confirmationMessage)) {
      return
    }

    if (mode === 'merge') {
      updateDashboardWithUndo('导入数据', (current) =>
        mergeImportedDashboard(current, pendingImport.dashboard),
      )
      setUnsavedStatus('已合并导入，重复网址已跳过')
    } else {
      updateDashboardWithUndo('导入数据', () => pendingImport.dashboard)
      setActiveGroupId(pendingImport.dashboard.groups[0]?.id ?? '')
      setUnsavedStatus('已覆盖当前数据')
    }

    setSelectedLinkIds(new Set())
    setCurrentLinkCheckResults([])
    setPendingImport(null)
  }

  function formatBackupDate(value: string) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleString('zh-CN', { hour12: false })
  }

  if (!dashboard) {
    return (
      <main className="page-shell">
        <section className="loading-panel">{status}</section>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          {isEditing ? (
            <input
              className="title-input"
              value={dashboard.settings.title}
              onChange={(event) => updateSetting('title', event.target.value)}
              aria-label="站点标题"
            />
          ) : (
            <h1>{dashboard.settings.title}</h1>
          )}
          <span className={`status ${hasUnsavedChanges ? 'status-unsaved' : ''}`}>
            {hasUnsavedChanges ? <span className="status-flag">未保存</span> : null}
            <span>
              {status} · v{APP_VERSION} · {dashboard.groups.length} 个分组 · {totalLinks} 个网站
            </span>
          </span>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索网站"
            aria-label="搜索网站"
          />
          <select
            className="select-input compact-select"
            value={searchScope}
            onChange={(event) => setSearchScope(event.target.value as SearchScope)}
            aria-label="搜索范围"
            disabled={isEditing}
          >
            <option value="group">当前分组</option>
            <option value="all">全部分组</option>
          </select>
          <button
            type="button"
            className="icon-button theme-toggle-button"
            onClick={toggleFrontTheme}
            aria-label={dashboard.settings.theme === 'dark' ? '切换浅色' : '切换深色'}
            title={dashboard.settings.theme === 'dark' ? '切换浅色' : '切换深色'}
          >
            {dashboard.settings.theme === 'dark' ? '☀' : '☾'}
          </button>

          {isEditing ? (
            <>
              <select
                className="select-input"
                value={dashboard.settings.theme}
                onChange={(event) =>
                  updateSetting(
                    'theme',
                    event.target.value as DashboardData['settings']['theme'],
                  )
                }
                aria-label="主题"
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
              <button type="button" className="ghost-button" onClick={exportJson}>
                导出
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => fileInputRef.current?.click()}
              >
                导入
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  if (showBackups) {
                    setShowBackups(false)
                    return
                  }

                  void openBackupPanel()
                }}
                disabled={isLoadingBackups || isRestoringBackup}
              >
                {isLoadingBackups ? '读取中' : showBackups ? '关闭备份' : '备份/恢复'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void runLinkCheck()}
                disabled={isCheckingLinks || totalLinks === 0}
              >
                {isCheckingLinks ? '检测中' : '检测网址'}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? '保存中' : '保存'}
              </button>
              <button type="button" className="ghost-button" onClick={lockEditing}>
                完成
              </button>
            </>
          ) : (
            <button type="button" className="primary-button" onClick={startEditing}>
              编辑
            </button>
          )}
        </div>
      </header>

      {showTokenForm ? (
        <form className="token-panel" onSubmit={unlockEditing}>
          <input
            type="password"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="管理员密码"
            aria-label="管理员密码"
            autoFocus
          />
          <div className="token-storage-options" role="radiogroup" aria-label="密码保存方式">
            <label>
              <input
                type="radio"
                name="admin-token-mode"
                value="session"
                checked={adminTokenMode === 'session'}
                onChange={() => setAdminTokenMode('session')}
              />
              本次会话
            </label>
            <label>
              <input
                type="radio"
                name="admin-token-mode"
                value="device"
                checked={adminTokenMode === 'device'}
                onChange={() => setAdminTokenMode('device')}
              />
              记住此设备
            </label>
          </div>
          <button type="submit" className="primary-button">
            解锁
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowTokenForm(false)}
          >
            取消
          </button>
        </form>
      ) : null}

      {undoEntry ? (
        <section className="notice-panel compact-notice undo-panel">
          <div>
            <strong>可以撤销最近一次操作</strong>
            <span>{undoEntry.label}</span>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="primary-button"
              onClick={undoLastChange}
              disabled={isSaving}
            >
              撤销
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setUndoEntry(null)}
            >
              忽略
            </button>
          </div>
        </section>
      ) : null}

      {isEditing ? (
        <section className="editor-actions">
          <div className="admin-token-mode-panel" aria-label="当前密码保存方式">
            <span>密码保存方式：</span>
            <div className="token-storage-options" role="radiogroup" aria-label="密码保存方式">
              <label>
                <input
                  type="radio"
                  name="active-admin-token-mode"
                  value="session"
                  checked={adminTokenMode === 'session'}
                  onChange={() => updateAdminTokenMode('session')}
                />
                本次会话
              </label>
              <label>
                <input
                  type="radio"
                  name="active-admin-token-mode"
                  value="device"
                  checked={adminTokenMode === 'device'}
                  onChange={() => updateAdminTokenMode('device')}
                />
                记住此设备
              </label>
            </div>
          </div>
          <button type="button" className="ghost-button danger" onClick={forgetToken}>
            清除密码
          </button>
          {selectedCount > 0 ? (
            <div className="batch-actions">
              <span className="batch-status">已选 {selectedCount} 个网站</span>
              <select
                className="select-input compact-select"
                value={batchTargetGroupId}
                onChange={(event) => setBatchTargetGroupId(event.target.value)}
                aria-label="移动到分组"
              >
                {dashboard.groups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-button" onClick={moveSelectedLinks}>
                移动
              </button>
              <button type="button" className="ghost-button" onClick={clearSelectedIcons}>
                清图标
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setSelectedLinkIds(new Set())}
              >
                取消选择
              </button>
              <button type="button" className="ghost-button danger" onClick={deleteSelectedLinks}>
                删除
              </button>
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.itabdata"
            hidden
            onChange={(event) => importJson(event.target.files?.[0])}
          />
        </section>
      ) : null}

      {isEditing && dashboardHealth ? (
        <section className="notice-panel health-panel">
          <div className="maintenance-heading">
            <div>
              <strong>数据健康</strong>
              <span>
                最近备份：
                {dashboardHealth.lastBackupAt
                  ? formatBackupDate(dashboardHealth.lastBackupAt)
                  : '暂未读取'}
              </span>
            </div>
            <div className="row-actions">
              {latestNonEmptyBackup ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void restoreLatestNonEmptyBackup()}
                  disabled={isRestoringBackup}
                >
                  恢复最近非空备份
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button"
                onClick={() => void openBackupPanel()}
                disabled={isLoadingBackups || isRestoringBackup}
              >
                查看备份
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void refreshHealthStatus()}
              >
                部署诊断
              </button>
            </div>
          </div>
          <div className="health-grid">
            <span>分组 {dashboardHealth.groupCount}</span>
            <span>网站 {dashboardHealth.linkCount}</span>
            <span>重复组 {dashboardHealth.duplicateGroupCount}</span>
            <span>多余重复 {dashboardHealth.duplicateLinkCount}</span>
            <span>疑似失效 {dashboardHealth.brokenCount}</span>
            <span>无法确认 {dashboardHealth.limitedCount}</span>
            <span>正常 {dashboardHealth.okCount}</span>
            <span>本地约 {formatStorageSize(dashboardHealth.storageBytes)}</span>
            {healthStatus ? (
              <>
                <span>部署 v{healthStatus.version}</span>
                <span>KV {healthStatus.kvBound ? '已绑定' : '未绑定'}</span>
                <span>密码 {healthStatus.adminTokenConfigured ? '已配置' : '未配置'}</span>
                <span>线上网站 {healthStatus.dashboardLinkCount}</span>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {isEditing ? (
        <section className="notice-panel appearance-panel">
          <div className="maintenance-heading">
            <div>
              <strong>外观</strong>
              <span>调整卡片密度、背景和当前分组颜色。</span>
            </div>
          </div>
          <div className="appearance-grid">
            <label className="field-label">
              卡片布局
              <select
                className="select-input"
                value={dashboard.settings.cardLayout ?? 'comfortable'}
                onChange={(event) =>
                  updateSetting('cardLayout', event.target.value as CardLayout)
                }
              >
                {CARD_LAYOUT_OPTIONS.map((layout) => (
                  <option value={layout} key={layout}>
                    {cardLayoutLabels[layout]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              背景
              <select
                className="select-input"
                value={dashboard.settings.wallpaper?.preset ?? 'none'}
                onChange={(event) =>
                  updateWallpaper('preset', event.target.value as WallpaperPreset)
                }
              >
                {WALLPAPER_PRESET_OPTIONS.map((preset) => (
                  <option value={preset} key={preset}>
                    {wallpaperPresetLabels[preset]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              背景强度
              <select
                className="select-input"
                value={dashboard.settings.wallpaper?.intensity ?? 'normal'}
                onChange={(event) =>
                  updateWallpaper('intensity', event.target.value as WallpaperIntensity)
                }
              >
                {WALLPAPER_INTENSITY_OPTIONS.map((intensity) => (
                  <option value={intensity} key={intensity}>
                    {wallpaperIntensityLabels[intensity]}
                  </option>
                ))}
              </select>
            </label>
            {activeGroup ? (
              <div className="field-label">
                当前分组颜色
                <div className="color-swatch-row" role="group" aria-label="当前分组颜色">
                  {GROUP_COLOR_OPTIONS.map((color) => (
                    <button
                      type="button"
                      className={`color-swatch is-color-${color} ${
                        (activeGroup.color ?? 'slate') === color ? 'is-selected' : ''
                      }`}
                      onClick={() => updateGroupColor(activeGroup.id, color)}
                      aria-label={`设置分组颜色：${groupColorLabels[color]}`}
                      title={groupColorLabels[color]}
                      key={color}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {isEditing && showBackups ? (
        <section className="notice-panel compact-notice backup-panel">
          <div className="maintenance-heading">
            <div>
              <strong>KV 备份</strong>
              <span>保存、导入和恢复前会自动留下备份；恢复动作仍需要管理员密码。</span>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => void openBackupPanel()}
              disabled={isLoadingBackups || isRestoringBackup}
            >
              刷新
            </button>
          </div>
          {latestNonEmptyBackup ? (
            <div className="backup-recovery-callout">
              <div>
                <strong>最近非空备份</strong>
                <span>
                  {formatBackupDate(latestNonEmptyBackup.createdAt)} ·{' '}
                  {latestNonEmptyBackup.groupCount} 个分组 ·{' '}
                  {latestNonEmptyBackup.linkCount} 个网站
                </span>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => void restoreLatestNonEmptyBackup()}
                disabled={isRestoringBackup}
              >
                恢复最近非空备份
              </button>
            </div>
          ) : null}
          {backups.length > 0 ? (
            <div className="backup-list">
              {backups.map((backup) => (
                <article className="backup-card" key={backup.id}>
                  <div className="backup-main">
                    <strong>{formatBackupDate(backup.createdAt)}</strong>
                    <span className="backup-meta">
                      {backup.groupCount} 个分组 · {backup.linkCount} 个网站
                    </span>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void downloadBackupById(backup)}
                      disabled={isRestoringBackup}
                    >
                      下载 JSON
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void restoreBackupById(backup)}
                      disabled={isRestoringBackup}
                    >
                      恢复
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="backup-empty">还没有可恢复的 KV 备份。</p>
          )}
        </section>
      ) : null}

      <section className="dashboard-layout">
        <aside className="group-sidebar" aria-label="分组">
          <div className="sidebar-label">分组</div>
          <div className="group-tabs">
            {dashboard.groups.map((group) => (
              <div
                className={`group-tab is-color-${group.color ?? 'slate'} ${
                  group.id === activeGroup?.id ? 'is-active' : ''
                }`}
                key={group.id}
              >
                <button
                  type="button"
                  className="group-tab-main"
                  onClick={() => setActiveGroupId(group.id)}
                >
                  <span className="group-tab-name">{group.name}</span>
                  <span className="group-tab-count">{group.links.length}</span>
                </button>

                {isEditing ? (
                  <span className="quick-actions">
                    <button
                      type="button"
                      className="quick-icon-button"
                      onClick={() => startQuickEditGroup(group.id, group.name)}
                      aria-label="编辑分组"
                      title="编辑分组"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="quick-icon-button danger"
                      onClick={() => deleteGroup(group.id)}
                      aria-label="删除分组"
                      title="删除分组"
                    >
                      ×
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
            {isEditing ? (
              <button
                type="button"
                className="group-add-tab"
                onClick={startQuickAddGroup}
                aria-label="新增分组"
                title="新增分组"
              >
                +
              </button>
            ) : null}
          </div>
        </aside>

        {activeGroup ? (
          <section className="group-section active-group-panel">
            <div className="group-header">
              <div className="group-title-area">
                <h2>{isGlobalSearch ? '全部搜索结果' : activeGroup.name}</h2>
                <span className="group-meta">
                  {isGlobalSearch
                    ? `${visibleLinkItems.length} 个匹配网站`
                    : `${activeGroup.links.length} 个网站`}
                </span>
              </div>

              {isEditing ? (
                <div className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveGroup(activeGroupIndex, -1)}
                    disabled={activeGroupIndex <= 0}
                    aria-label="上移分组"
                    title="上移分组"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => moveGroup(activeGroupIndex, 1)}
                    disabled={activeGroupIndex === dashboard.groups.length - 1}
                    aria-label="下移分组"
                    title="下移分组"
                  >
                    ↓
                  </button>
                </div>
              ) : null}
            </div>

            {isEditing && duplicateLinks.length > 0 ? (
              <section className="notice-panel compact-notice duplicate-panel">
                <div className="maintenance-heading">
                  <div>
                    <strong>发现 {duplicateLinks.length} 组重复网址</strong>
                    <span>重复卡片已高亮，可以先定位确认，再编辑、删除或批量整理。</span>
                  </div>
                </div>
                <div className="duplicate-list">
                  {duplicateLinks.map((duplicate) => (
                    <article className="duplicate-card" key={duplicate.url}>
                      <div className="duplicate-url">{duplicate.url}</div>
                      {duplicate.occurrences.map((item) => (
                        <div className="duplicate-occurrence" key={`${item.groupId}-${item.link.id}`}>
                          <div className="duplicate-occurrence-main">
                            <strong>
                              {item.groupName} / {item.link.title}
                            </strong>
                            <span>{normalizeUrl(item.link.url)}</span>
                          </div>
                          <div className="row-actions duplicate-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => locateLink(item.groupId, item.link.id)}
                            >
                              定位
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                locateLink(item.groupId, item.link.id)
                                startQuickEditLink(item.groupId, item.link)
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => deleteLink(item.groupId, item.link.id)}
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() =>
                                window.open(
                                  normalizeUrl(item.link.url),
                                  '_blank',
                                  'noopener,noreferrer',
                                )
                              }
                            >
                              打开
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="row-actions">
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => removeDuplicateGroup(duplicate)}
                        >
                          保留第一个，删除其它
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {isEditing ? (
              <section className="notice-panel maintenance-panel">
                <div className="maintenance-heading">
                  <div>
                    <strong>网址维护</strong>
                    <span>
                      {visibleLinkCheckResults.length > 0
                        ? `最近检测：正常 ${okLinkCount} 个，疑似失效 ${brokenLinkResults.length} 个，无法确认 ${limitedLinkResults.length} 个`
                        : '批量检测当前全部网站，集中查看疑似失效链接。'}
                    </span>
                  </div>
                  <div className="row-actions">
                    <label className="field-label inline-field">
                      检测结果筛选
                      <select
                        className="select-input compact-select"
                        value={checkFilter}
                        onChange={(event) => setCheckFilter(event.target.value as CheckFilter)}
                        aria-label="检测结果筛选"
                      >
                        <option value="issues">只看疑似失效</option>
                        <option value="broken">疑似失效</option>
                        <option value="limited">无法确认</option>
                        <option value="ok">正常</option>
                        <option value="all">全部</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void runLinkCheck()}
                      disabled={isCheckingLinks || totalLinks === 0}
                    >
                      {isCheckingLinks ? '检测中' : '批量检测网站'}
                    </button>
                  </div>
                </div>

                {isCheckingLinks ? (
                  <span className="check-progress">
                    正在检测 {linkCheckProgress.done} / {linkCheckProgress.total}
                  </span>
                ) : null}

                {visibleLinkCheckResults.length > 0 ? (
                  <div className="check-results">
                    <section className="check-result-section">
                      <h3>检测结果</h3>
                      {filteredLinkCheckResults.length > 0 ? (
                        <div className="check-result-list">
                          {filteredLinkCheckResults.map((item) => (
                            <article
                              className={`check-result is-${item.status}`}
                              key={`${item.groupId}-${item.linkId}`}
                            >
                              <div className="check-result-main">
                                <span className="link-check-status">
                                  {linkCheckStatusLabels[item.status]}
                                </span>
                                <strong>
                                  {item.groupName} / {item.title}
                                </strong>
                                <span>{normalizeUrl(item.url)}</span>
                              </div>
                              <span className="check-reason">{item.reason}</span>
                              <div className="row-actions check-actions">
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => locateLink(item.groupId, item.linkId)}
                                >
                                  定位
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() => {
                                    const link = findLinkForCheck(item.groupId, item.linkId)

                                    locateLink(item.groupId, item.linkId)
                                    if (link) {
                                      startQuickEditLink(item.groupId, link)
                                    }
                                  }}
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button danger"
                                  onClick={() => deleteLink(item.groupId, item.linkId)}
                                >
                                  删除
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button"
                                  onClick={() =>
                                    window.open(
                                      normalizeUrl(item.url),
                                      '_blank',
                                      'noopener,noreferrer',
                                    )
                                  }
                                >
                                  打开
                                </button>
                                {item.status !== 'ok' ? (
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => confirmHealthyLink(item.linkId)}
                                  >
                                    确认没问题
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <span className="check-empty">当前筛选没有需要处理的链接。</span>
                      )}
                    </section>
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="link-grid">
              {visibleLinkItems.map(({ groupId, groupName, link }) => (
                <article
                  id={`link-card-${link.id}`}
                  className={`link-card-shell ${
                    draggingLinkId === link.id ? 'is-dragging' : ''
                  } ${dragOverLinkId === link.id ? 'is-drag-over' : ''} ${
                    isEditing && duplicateLinkIds.has(link.id) ? 'is-duplicate' : ''
                  } ${
                    isEditing && problemLinkStatusById.get(link.id)
                      ? `has-link-check is-${problemLinkStatusById.get(link.id)}`
                      : ''
                  } ${isEditing && highlightedLinkId === link.id ? 'is-located' : ''}`}
                  draggable={canDragSortLinks}
                  onDragStart={(event) => handleLinkDragStart(event, groupId, link.id)}
                  onDragOver={(event) => handleLinkDragOver(event, groupId, link.id)}
                  onDrop={(event) => handleLinkDrop(event, groupId, link.id)}
                  onDragEnd={resetLinkDrag}
                  key={link.id}
                >
                  {isEditing ? (
                    <label className="select-link-card">
                      <input
                        type="checkbox"
                        checked={selectedLinkIds.has(link.id)}
                        onChange={() => toggleLinkSelection(link.id)}
                        aria-label={`选择 ${link.title}`}
                      />
                    </label>
                  ) : null}

                  {isEditing ? (
                    <span className="card-actions">
                      <button
                        type="button"
                        className="quick-icon-button"
                        onClick={() => startQuickEditLink(groupId, link)}
                        aria-label="编辑网站"
                        title="编辑网站"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="quick-icon-button danger"
                        onClick={() => deleteLink(groupId, link.id)}
                        aria-label="删除网站"
                        title="删除网站"
                      >
                        ×
                      </button>
                    </span>
                  ) : null}

                  {isEditing && duplicateLinkIds.has(link.id) ? (
                    <span className="editor-badge">重复</span>
                  ) : null}

                  {isEditing && problemLinkStatusById.get(link.id) ? (
                    <span className="editor-badge health-badge">
                      {linkCheckStatusLabels[problemLinkStatusById.get(link.id)!]}
                    </span>
                  ) : null}

                  <a
                    className="link-card"
                    href={normalizeUrl(link.url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(event) => handleLinkClick(event, groupId, link.id)}
                  >
                    <img
                      src={link.icon || faviconUrl(link.url)}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden'
                      }}
                      onLoad={(event) => {
                        event.currentTarget.style.visibility = 'visible'
                      }}
                    />
                    <span className="link-card-title">{link.title}</span>
                    <small>{normalizeUrl(link.url).replace(/^https?:\/\//, '')}</small>
                    <span className="click-count">{link.clickCount ?? 0}</span>
                    {isGlobalSearch ? (
                      <em className="link-group-name">{groupName}</em>
                    ) : null}
                  </a>
                </article>
              ))}

              {isEditing ? (
                <button
                  type="button"
                  className="add-card"
                  onClick={() => startQuickAddLink(activeGroup.id)}
                  aria-label="新增网站"
                  title="新增网站"
                >
                  +
                </button>
              ) : null}
            </div>

            {visibleLinkItems.length === 0 ? (
              <section className="empty-panel">
                {query.trim()
                  ? isGlobalSearch
                    ? '全部分组没有匹配的网站'
                    : '当前分组没有匹配的网站'
                  : '当前分组还没有网站'}
              </section>
            ) : null}
          </section>
        ) : (
          <section className="empty-panel">还没有分组，进入编辑模式后新增分组</section>
        )}
      </section>

      {pendingImport ? (
        <div className="import-preview-backdrop">
          <section
            className="import-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-preview-title"
          >
            <div className="import-preview-body">
              <h3 className="quick-edit-title" id="import-preview-title">
                导入预览
              </h3>
              <p className="import-preview-file">
                {pendingImport.fileName} · {pendingImport.sourceName}
              </p>
              <div className="import-preview-grid">
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.currentLinkCount}</strong>
                  <small>当前网站</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.importedGroupCount}</strong>
                  <small>导入分组</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.importedLinkCount}</strong>
                  <small>导入网站</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.duplicateUrlCount}</strong>
                  <small>重复网址</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.mergeLinkCount}</strong>
                  <small>合并后网站</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.replaceLinkCount}</strong>
                  <small>覆盖后网站</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.preview.removedLinkCount}</strong>
                  <small>覆盖将减少</small>
                </span>
                <span className="import-preview-stat">
                  <strong>{pendingImport.skippedCount}</strong>
                  <small>跳过地址</small>
                </span>
              </div>
              {pendingImportWarning ? (
                <p className="import-preview-warning">{pendingImportWarning}</p>
              ) : null}
              {pendingImport.skippedCount > 0 ? (
                <p className="field-error">
                  已跳过内部地址或无效地址 {pendingImport.skippedCount} 条。
                </p>
              ) : null}
            </div>
            <div className="import-preview-footer" aria-label="导入确认操作">
              <span className="import-preview-footer-title">确认导入方式</span>
              <div className="import-preview-actions">
                <button type="button" className="ghost-button" onClick={exportJson}>
                  先导出当前数据
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => applyPendingImport('merge')}
                >
                  合并导入
                </button>
                <button
                  type="button"
                  className="ghost-button danger"
                  onClick={() => applyPendingImport('replace')}
                >
                  覆盖当前全部数据
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setPendingImport(null)}
                >
                  取消
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {quickEdit ? (
        <div className="quick-edit-backdrop">
          <section
            className="quick-edit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-edit-title"
          >
            <form className="quick-edit-form" onSubmit={saveQuickEdit}>
              <h3 className="quick-edit-title" id="quick-edit-title">
                {quickEdit.kind === 'group'
                  ? quickEdit.mode === 'create'
                    ? '新增分组'
                    : '编辑分组'
                  : quickEdit.mode === 'create'
                    ? '新增网站'
                    : '编辑网站'}
              </h3>

              {quickEdit.kind === 'group' ? (
                <label className="field-label">
                  分组名称
                  <input
                    value={quickEdit.name}
                    onChange={(event) => updateQuickEditField('name', event.target.value)}
                    placeholder="例如：常用"
                    aria-label="分组名称"
                    autoFocus
                  />
                </label>
              ) : (
                <>
                  <label className="field-label">
                    网站名称
                    <input
                      value={quickEdit.title}
                      onChange={(event) =>
                        updateQuickEditField('title', event.target.value)
                      }
                      placeholder="例如：GitHub"
                      aria-label="网站名称"
                      autoFocus
                    />
                  </label>
                  <label className="field-label">
                    网站地址
                    <input
                      value={quickEdit.url}
                      onChange={(event) => updateQuickEditField('url', event.target.value)}
                      placeholder="例如：https://github.com"
                      aria-label="网站地址"
                    />
                  </label>
                  <label className="field-label">
                    图标地址
                    <input
                      value={quickEdit.icon}
                      onChange={(event) => updateQuickEditField('icon', event.target.value)}
                      placeholder="可留空，默认自动获取 favicon"
                      aria-label="图标地址"
                    />
                  </label>
                  {quickEdit.url.trim() && !isSafeUrl(quickEdit.url) ? (
                    <span className="field-error">只支持 http 或 https 地址</span>
                  ) : null}
                </>
              )}

              <div className="dialog-actions">
                <button type="button" className="ghost-button" onClick={() => setQuickEdit(null)}>
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={quickEdit.kind === 'link' && !quickEdit.url.trim()}
                >
                  保存
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
