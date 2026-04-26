import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearAdminToken,
  loadAdminToken,
  loadDashboard,
  saveAdminToken,
  saveDashboard,
} from './api'
import {
  createEmptyGroup,
  createEmptyLink,
  faviconUrl,
  isSafeUrl,
  moveItem,
  normalizeUrl,
} from './dashboard'
import { isImportFileTooLarge, parseDashboardImport } from './importers'
import type { DashboardData, LinkItem } from './types'

function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [query, setQuery] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [adminToken, setAdminToken] = useState(loadAdminToken)
  const [tokenDraft, setTokenDraft] = useState('')
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [status, setStatus] = useState('正在加载...')
  const [isSaving, setIsSaving] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState('')
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

  const visibleLinks = useMemo(() => {
    if (!activeGroup) {
      return []
    }

    const keyword = query.trim().toLocaleLowerCase()

    if (!keyword || isEditing) {
      return activeGroup.links
    }

    return activeGroup.links.filter((link) => {
      return (
        link.title.toLocaleLowerCase().includes(keyword) ||
        link.url.toLocaleLowerCase().includes(keyword)
      )
    })
  }, [activeGroup, isEditing, query])

  const totalLinks = useMemo(() => {
    return dashboard?.groups.reduce((count, group) => count + group.links.length, 0) ?? 0
  }, [dashboard])

  function updateDashboard(updater: (current: DashboardData) => DashboardData) {
    setDashboard((current) => {
      if (!current) {
        return current
      }

      return updater(current)
    })
    setStatus('有未保存修改')
  }

  function unlockEditing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = tokenDraft.trim()

    if (!token) {
      setStatus('请输入管理员密码')
      return
    }

    saveAdminToken(token)
    setAdminToken(token)
    setTokenDraft('')
    setShowTokenForm(false)
    setIsEditing(true)
    setStatus('已进入编辑模式')
  }

  function startEditing() {
    if (adminToken) {
      setIsEditing(true)
      setStatus('已进入编辑模式')
      return
    }

    setShowTokenForm(true)
  }

  function lockEditing() {
    setIsEditing(false)
    setShowTokenForm(false)
    setStatus('已退出编辑模式')
  }

  function forgetToken() {
    clearAdminToken()
    setAdminToken('')
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
      setStatus(result.mode === 'cloud' ? '已保存到 Cloudflare KV' : '已保存到本机')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  function addGroup() {
    const group = createEmptyGroup()

    updateDashboard((current) => ({
      ...current,
      groups: [...current.groups, group],
    }))
    setActiveGroupId(group.id)
  }

  function updateGroupName(groupId: string, name: string) {
    updateDashboard((current) => ({
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

    updateDashboard((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }))
  }

  function moveGroup(groupIndex: number, direction: -1 | 1) {
    updateDashboard((current) => ({
      ...current,
      groups: moveItem(current.groups, groupIndex, direction),
    }))
  }

  function addLink(groupId: string) {
    updateDashboard((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: [...group.links, createEmptyLink()],
            }
          : group,
      ),
    }))
  }

  function updateLink(groupId: string, linkId: string, patch: Partial<LinkItem>) {
    updateDashboard((current) => ({
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
    updateDashboard((current) => ({
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
  }

  function moveLink(groupId: string, linkIndex: number, direction: -1 | 1) {
    updateDashboard((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              links: moveItem(group.links, linkIndex, direction),
            }
          : group,
      ),
    }))
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
    if (!file) {
      return
    }

    try {
      if (isImportFileTooLarge(file)) {
        setStatus('导入失败，文件不能超过 10MB')
        return
      }

      const text = await file.text()
      const result = parseDashboardImport(file.name, text)
      const skippedText =
        result.skipped.length > 0 ? `，跳过 ${result.skipped.length} 条无效地址` : ''

      setDashboard(result.dashboard)
      setStatus(
        `已导入 ${result.groupCount} 个分组、${result.linkCount} 个网站${skippedText}，点击保存后写入 Cloudflare KV`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? `导入失败：${error.message}` : '导入失败，请检查文件')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
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
          <span className="status">
            {status} · {dashboard.groups.length} 个分组 · {totalLinks} 个网站
          </span>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索网站"
            aria-label="搜索网站"
          />

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

      {isEditing ? (
        <section className="editor-actions">
          <button type="button" className="ghost-button" onClick={addGroup}>
            新增分组
          </button>
          <button type="button" className="ghost-button danger" onClick={forgetToken}>
            清除密码
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.itabdata"
            hidden
            onChange={(event) => importJson(event.target.files?.[0])}
          />
        </section>
      ) : null}

      <section className="dashboard-layout">
        <aside className="group-sidebar" aria-label="分组">
          <div className="sidebar-label">分组</div>
          <div className="group-tabs">
            {dashboard.groups.map((group) => (
              <button
                type="button"
                className={`group-tab ${
                  group.id === activeGroup?.id ? 'is-active' : ''
                }`}
                onClick={() => setActiveGroupId(group.id)}
                key={group.id}
              >
                <span className="group-tab-name">{group.name}</span>
                <span className="group-tab-count">{group.links.length}</span>
              </button>
            ))}
          </div>
        </aside>

        {activeGroup ? (
          <section className="group-section active-group-panel">
            <div className="group-header">
              <div className="group-title-area">
                {isEditing ? (
                  <label className="field-label compact-label">
                    分组名称
                    <input
                      className="group-input"
                      value={activeGroup.name}
                      onChange={(event) =>
                        updateGroupName(activeGroup.id, event.target.value)
                      }
                      aria-label="分组名称"
                    />
                  </label>
                ) : (
                  <>
                    <h2>{activeGroup.name}</h2>
                    <span className="group-meta">
                      {activeGroup.links.length} 个网站
                    </span>
                  </>
                )}
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
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => deleteGroup(activeGroup.id)}
                    aria-label="删除分组"
                    title="删除分组"
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>

            <div className="link-grid">
              {visibleLinks.map((link, linkIndex) =>
                isEditing ? (
                  <article className="link-editor" key={link.id}>
                    <div className="editor-line">
                      <label className="field-label">
                        网站名称
                        <input
                          value={link.title}
                          onChange={(event) =>
                            updateLink(activeGroup.id, link.id, {
                              title: event.target.value,
                            })
                          }
                          placeholder="例如：GitHub"
                          aria-label="网站名称"
                        />
                      </label>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => moveLink(activeGroup.id, linkIndex, -1)}
                          disabled={linkIndex === 0}
                          aria-label="上移网站"
                          title="上移网站"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => moveLink(activeGroup.id, linkIndex, 1)}
                          disabled={linkIndex === activeGroup.links.length - 1}
                          aria-label="下移网站"
                          title="下移网站"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => deleteLink(activeGroup.id, link.id)}
                          aria-label="删除网站"
                          title="删除网站"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <label className="field-label">
                      网站地址
                      <input
                        value={link.url}
                        onChange={(event) =>
                          updateLink(activeGroup.id, link.id, {
                            url: event.target.value,
                          })
                        }
                        placeholder="例如：https://github.com"
                        aria-label="网站地址"
                      />
                    </label>
                    <label className="field-label">
                      图标地址
                      <input
                        value={link.icon || ''}
                        onChange={(event) =>
                          updateLink(activeGroup.id, link.id, {
                            icon: event.target.value,
                          })
                        }
                        placeholder="可留空，默认自动获取 favicon"
                        aria-label="图标地址"
                      />
                    </label>
                    {!isSafeUrl(link.url) ? (
                      <span className="field-error">只支持 http 或 https 地址</span>
                    ) : null}
                  </article>
                ) : (
                  <a
                    className="link-card"
                    href={normalizeUrl(link.url)}
                    target="_blank"
                    rel="noreferrer noopener"
                    key={link.id}
                  >
                    <img
                      src={link.icon || faviconUrl(link.url)}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                    <span>{link.title}</span>
                    <small>{normalizeUrl(link.url).replace(/^https?:\/\//, '')}</small>
                  </a>
                ),
              )}
            </div>

            {isEditing ? (
              <button
                type="button"
                className="add-link-button"
                onClick={() => addLink(activeGroup.id)}
              >
                新增网站
              </button>
            ) : null}

            {visibleLinks.length === 0 ? (
              <section className="empty-panel">
                {query.trim() ? '当前分组没有匹配的网站' : '当前分组还没有网站'}
              </section>
            ) : null}
          </section>
        ) : (
          <section className="empty-panel">还没有分组，进入编辑模式后新增分组</section>
        )}
      </section>
    </main>
  )
}

export default App
