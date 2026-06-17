import { useEffect } from 'react'
import { usePopupStore } from './store'
import type { Business } from '../types/business'

/** Maps an ExtractionStatus to a small colored status dot + label. */
function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === 'running'
      ? 'status-dot--running'
      : status === 'completed'
        ? 'status-dot--completed'
        : status === 'error'
          ? 'status-dot--error'
          : status === 'stopped'
            ? 'status-dot--stopped'
            : 'status-dot--idle'

  return (
    <span className="status-badge">
      <span className={`status-dot ${colorClass}`} />
      {status}
    </span>
  )
}

/** A single extracted business shown with everything useful for pitching a website. */
function BusinessCard({ business }: { business: Business }) {
  return (
    <div className="business-card">
      <div className="business-card__header">
        <span className="business-card__name">{business.name}</span>
        {business.rating !== null && (
          <span className="business-card__rating">
            ★ {business.rating}
            {business.reviewCount !== null && <span className="business-card__review-count"> ({business.reviewCount})</span>}
          </span>
        )}
      </div>
      {business.category && <div className="business-card__category">{business.category}</div>}
      <div className="business-card__rows">
        {business.address && <div className="business-card__row">📍 {business.address}</div>}
        {business.phone && <div className="business-card__row">📞 {business.phone}</div>}
        {business.website && (
          <div className="business-card__row">
            🌐{' '}
            <a href={business.website} target="_blank" rel="noreferrer">
              {business.website.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {business.hours && <div className="business-card__row business-card__row--muted">🕒 {business.hours}</div>}
      </div>
      {business.description && <p className="business-card__description">{business.description}</p>}
      {business.reviewsSummary && (
        <p className="business-card__reviews-summary">
          <span className="business-card__reviews-summary-label">What reviews say: </span>
          {business.reviewsSummary}
        </p>
      )}
    </div>
  )
}

export default function App() {
  const {
    progress,
    businesses,
    isMapsPage,
    error,
    minDelaySeconds,
    maxDelaySeconds,
    init,
    start,
    stop,
    clearData,
    downloadCsv,
    setMinDelaySeconds,
    setMaxDelaySeconds,
  } = usePopupStore()

  useEffect(() => {
    init()
  }, [init])

  const isRunning = progress.status === 'running'
  const total = progress.discovered || progress.extracted + progress.failed
  const percentComplete = total > 0 ? Math.round(((progress.extracted + progress.failed) / total) * 100) : 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Local Business Extractor</h1>
        <StatusBadge status={progress.status} />
      </header>

      {!isMapsPage && !isRunning && (
        <div className="banner banner--warning">
          Open a Google Maps search results page (e.g. search "coffee shops in Austin") to start extracting.
        </div>
      )}

      {error && <div className="banner banner--error">{error}</div>}

      <div className="progress-section">
        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${percentComplete}%` }} />
        </div>
        <p className="progress-message">{progress.message}</p>
        <div className="progress-stats">
          <span>Discovered: {progress.discovered}</span>
          <span>Extracted: {progress.extracted}</span>
          <span>Failed: {progress.failed}</span>
        </div>
      </div>

      <div className="delay-section">
        <label className="delay-label">
          Delay between listings (seconds)
          <div className="delay-inputs">
            <input
              type="number"
              min={0}
              step={0.5}
              value={minDelaySeconds}
              disabled={isRunning}
              onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
              aria-label="Minimum delay in seconds"
            />
            <span className="delay-separator">to</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={maxDelaySeconds}
              disabled={isRunning}
              onChange={(e) => setMaxDelaySeconds(Number(e.target.value))}
              aria-label="Maximum delay in seconds"
            />
          </div>
        </label>
        <p className="delay-hint">A wider, larger range looks less robotic and reduces the chance of being rate-limited.</p>
      </div>

      <div className="actions">
        <button className="btn btn--primary" onClick={start} disabled={isRunning || !isMapsPage}>
          Start Extraction
        </button>
        <button className="btn btn--secondary" onClick={stop} disabled={!isRunning}>
          Stop Extraction
        </button>
        <div className="actions-row">
          <button className="btn btn--outline" onClick={downloadCsv} disabled={businesses.length === 0}>
            Download CSV ({businesses.length})
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (confirm('Clear all extracted data? This cannot be undone.')) clearData()
            }}
            disabled={isRunning || businesses.length === 0}
            title="Delete all extracted records and reset"
          >
            Clear Data
          </button>
        </div>
      </div>

      {businesses.length > 0 && (
        <div className="results-section">
          <p className="results-heading">Extracted so far ({businesses.length})</p>
          <div className="results-list">
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        </div>
      )}

      <footer className="app-footer">Data is stored locally in your browser via IndexedDB.</footer>
    </div>
  )
}
