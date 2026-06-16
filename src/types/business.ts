/**
 * Core data model shared across the content script, background worker,
 * and popup UI.
 */

/** A single extracted Google Maps business listing. */
export interface Business {
  /** Stable hash of name+address, used as the IndexedDB key and for dedup. */
  id: string
  name: string
  category: string
  rating: number | null
  reviewCount: number | null
  address: string
  phone: string
  website: string
  hours: string
  latitude: number | null
  longitude: number | null
  /** Google's short "About" blurb for the business, when shown on its page. */
  description: string
  /** Best-effort capture of Google's AI-generated review summary, when shown. */
  reviewsSummary: string
  /** ISO timestamp of when this record was captured. */
  extractedAt: string
}

/** CSV column order — also doubles as the canonical field order for export. */
export const CSV_COLUMNS = [
  'name',
  'category',
  'rating',
  'review_count',
  'address',
  'phone',
  'website',
  'hours',
  'latitude',
  'longitude',
  'description',
  'reviews_summary',
] as const

export type ExtractionStatus = 'idle' | 'running' | 'stopped' | 'completed' | 'error'

/** Live progress snapshot, persisted to chrome.storage.local so it survives page navigation. */
export interface ExtractionProgress {
  status: ExtractionStatus
  /** Number of result cards discovered in the feed so far. */
  discovered: number
  /** Number of cards successfully extracted and stored. */
  extracted: number
  /** Number of cards that failed extraction after retries. */
  failed: number
  /** Human-readable description of the current step. */
  message: string
}

/** User-configurable pacing between consecutive business page visits. */
export interface ExtractionDelayConfig {
  minDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_DELAY_CONFIG: ExtractionDelayConfig = {
  minDelayMs: 3000,
  maxDelayMs: 6000,
}

/**
 * Persisted run state for an in-progress extraction.
 *
 * Each business is visited by navigating the tab directly to its Maps URL
 * (a full page load), which destroys and re-creates the content script's
 * JS context every time. This state is the only thing that survives that —
 * it lives in chrome.storage.local and is read back on every content
 * script load to decide "am I mid-run, and what's next."
 */
export interface ExtractionRunState {
  status: ExtractionStatus
  /** The Maps URL currently being visited/extracted (null between runs). */
  currentHref: string | null
  /** Remaining hrefs to visit after currentHref. */
  queue: string[]
  discovered: number
  extracted: number
  failed: number
  config: ExtractionDelayConfig
}

// ---- Message protocol between popup <-> background <-> content script ----
//
// Progress and run state live in chrome.storage.local, which every
// extension context (popup, background, content scripts) can read/write
// directly — so most of this protocol is just the two actions only a
// content script can perform (scrolling/navigating the page).

export type RuntimeMessage =
  | { type: 'START_EXTRACTION'; config: ExtractionDelayConfig }
  | { type: 'PING_MAPS_PAGE' }
  | { type: 'BUSINESS_EXTRACTED'; business: Business }
