import './StatusPanel.css'
import { useImportedBackup } from '../../context/BackupContext'
import { useAuth } from '../../hooks/useAuth'
import { useBackup } from '../../hooks/useBackup'
import { useRestoreResults } from '../../hooks/useRestoreResults'

function StatusPanel() {
  const { status, logs } = useImportedBackup()
  const { source, destination } = useAuth()
  const { startBackup } = useBackup()
  const { startRestore } = useRestoreResults()

  const statusBadgeText = {
    IDLE: 'IDLE',
    BACKING_UP: 'BACKING UP',
    RESTORING: 'RESTORING',
    COMPLETE: 'COMPLETE',
    ERROR: 'ERROR',
  }

  const statusBadgeClass = {
    IDLE: 'status-panel__badge--idle',
    BACKING_UP: 'status-panel__badge--active',
    RESTORING: 'status-panel__badge--active',
    COMPLETE: 'status-panel__badge--complete',
    ERROR: 'status-panel__badge--error',
  }

  const isBackupDisabled = !source?.user || status !== 'IDLE'
  const isRestoreDisabled = !destination?.user || status !== 'IDLE'

  return (
    <section className="status-panel" aria-label="Backup and Restore Status">
      <div className="status-panel__header">
        <h2 className="status-panel__title">Backup / Restore Status</h2>
        <span className={`status-panel__badge ${statusBadgeClass[status]}`}>
          {statusBadgeText[status]}
        </span>
      </div>

      <div className="status-panel__log" role="log" aria-live="polite">
        {logs.length === 0 ? (
          <p className="status-panel__log-empty">
            No activity yet. Connect both accounts and start a backup or restore.
          </p>
        ) : (
          <ul className="status-panel__log-list" aria-label="Activity log">
            {logs.map((log, idx) => (
              <li 
                key={idx} 
                className={`status-panel__log-item status-panel__log-item--${log.type}`}
              >
                <span className="status-panel__log-dot" />
                {log.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="status-panel__actions">
        <button className="status-panel__btn status-panel__btn--backup" disabled={isBackupDisabled}>
          ⬇ Backup
        </button>
        <button className="status-panel__btn status-panel__btn--restore" disabled={isRestoreDisabled}>
          ⬆ Restore
        </button>
      </div>
    </section>
  )
}

export default StatusPanel
