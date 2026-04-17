import './StatusPanel.css'

// StatusPanel shows the backup / restore progress log.
// In later milestones this will be populated with live data.
function StatusPanel() {
  return (
    <section className="status-panel" aria-label="Backup and Restore Status">
      <div className="status-panel__header">
        <h2 className="status-panel__title">Backup / Restore Status</h2>
        <span className="status-panel__badge status-panel__badge--idle">Idle</span>
      </div>

      <div className="status-panel__log" role="log" aria-live="polite">
        <p className="status-panel__log-empty">
          No activity yet. Connect both accounts and start a backup or restore.
        </p>

        {/* Example log rows — will be driven by state in later milestones */}
        <ul className="status-panel__log-list" aria-label="Activity log">
          <li className="status-panel__log-item status-panel__log-item--info">
            <span className="status-panel__log-dot" />
            Waiting for accounts to be connected…
          </li>
        </ul>
      </div>

      <div className="status-panel__actions">
        <button className="status-panel__btn status-panel__btn--backup" disabled>
          ⬇ Backup
        </button>
        <button className="status-panel__btn status-panel__btn--restore" disabled>
          ⬆ Restore
        </button>
      </div>
    </section>
  )
}

export default StatusPanel
