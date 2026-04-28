import type { RestoreComparison } from '../backup'
import type { BackupSummary } from '../types'

export type RestorePreviewState = {
  backup: BackupSummary
  comparison: RestoreComparison | null
  isLoading: boolean
  error: string
}

type BackupsPanelProps = {
  backups: BackupSummary[]
  latestNonEmptyBackup: BackupSummary | null
  isLoadingBackups: boolean
  isRestoringBackup: boolean
  restorePreview: RestorePreviewState | null
  onRefresh: () => void
  onDownload: (backup: BackupSummary) => void
  onPreviewRestore: (backup: BackupSummary) => void
  onConfirmRestore: () => void
  onCancelRestore: () => void
  onRestoreLatest: () => void
}

function formatBackupDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDelta(value: number) {
  if (value === 0) {
    return '不变'
  }

  return value > 0 ? `+${value}` : String(value)
}

function restoreAgeLabel(comparison: RestoreComparison) {
  if (comparison.backupIsOlder) {
    return '这份备份比当前数据更旧，恢复后会回到备份时的内容。'
  }

  if (comparison.backupIsNewer) {
    return '这份备份比当前数据更新，请确认是不是你想恢复的版本。'
  }

  return '这份备份和当前数据的更新时间一致，请根据分组和网站数量确认。'
}

export function BackupsPanel({
  backups,
  latestNonEmptyBackup,
  isLoadingBackups,
  isRestoringBackup,
  restorePreview,
  onRefresh,
  onDownload,
  onPreviewRestore,
  onConfirmRestore,
  onCancelRestore,
  onRestoreLatest,
}: BackupsPanelProps) {
  const restoreDisabled = isRestoringBackup || Boolean(restorePreview?.isLoading)

  return (
    <section className="notice-panel compact-notice backup-panel">
      <div className="maintenance-heading">
        <div>
          <strong>KV 备份</strong>
          <span>保存、导入和恢复前会自动留下备份；恢复动作仍需要管理员密码。</span>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={onRefresh}
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
            onClick={onRestoreLatest}
            disabled={restoreDisabled}
          >
            恢复最近非空备份
          </button>
        </div>
      ) : null}

      {restorePreview ? (
        <div className="backup-restore-preview" role="alert">
          <div className="restore-preview-heading">
            <div>
              <strong>确认恢复备份</strong>
              <span>{formatBackupDate(restorePreview.backup.createdAt)}</span>
            </div>
            <span className="restore-preview-badge">恢复前会自动备份当前 KV 数据</span>
          </div>

          {restorePreview.isLoading ? (
            <p className="backup-empty">正在读取备份详情...</p>
          ) : restorePreview.error ? (
            <p className="backup-empty">{restorePreview.error}</p>
          ) : restorePreview.comparison ? (
            <>
              <div className="restore-comparison-grid" aria-label="当前数据和备份数据对比">
                <div>
                  <span>当前数据</span>
                  <strong>{restorePreview.comparison.current.groupCount} 个分组</strong>
                  <strong>{restorePreview.comparison.current.linkCount} 个网站</strong>
                  <small>{formatBackupDate(restorePreview.comparison.current.updatedAt)}</small>
                </div>
                <div>
                  <span>备份数据</span>
                  <strong>{restorePreview.comparison.backup.groupCount} 个分组</strong>
                  <strong>{restorePreview.comparison.backup.linkCount} 个网站</strong>
                  <small>{formatBackupDate(restorePreview.comparison.backup.updatedAt)}</small>
                </div>
                <div>
                  <span>恢复后变化</span>
                  <strong>分组 {formatDelta(restorePreview.comparison.groupDelta)}</strong>
                  <strong>网站 {formatDelta(restorePreview.comparison.linkDelta)}</strong>
                  <small>{restoreAgeLabel(restorePreview.comparison)}</small>
                </div>
              </div>
              <p className="restore-preview-note">
                确认后会把线上 dashboard 恢复为这份备份。当前线上数据会先另存一份新备份，避免误操作后没有退路。
              </p>
            </>
          ) : null}

          <div className="row-actions">
            <button type="button" className="ghost-button" onClick={onCancelRestore}>
              取消
            </button>
            <button
              type="button"
              className="primary-button danger-button"
              onClick={onConfirmRestore}
              disabled={
                isRestoringBackup ||
                restorePreview.isLoading ||
                Boolean(restorePreview.error) ||
                !restorePreview.comparison
              }
            >
              {isRestoringBackup ? '恢复中...' : '确认恢复'}
            </button>
          </div>
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
                  onClick={() => onDownload(backup)}
                  disabled={isRestoringBackup}
                >
                  下载 JSON
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => onPreviewRestore(backup)}
                  disabled={restoreDisabled}
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
  )
}
