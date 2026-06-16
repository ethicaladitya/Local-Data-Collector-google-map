import { create } from 'zustand'
import type { Business, ExtractionDelayConfig, ExtractionProgress, RuntimeMessage } from '../types/business'
import { getAllBusinesses } from '../db/indexedDb'
import { downloadBusinessesCsv } from '../utils/csv'
import { DEFAULT_DELAY_CONFIG } from '../types/business'
import { clearRunState, getDelayConfig, getProgress, setDelayConfig, setProgress, setStopRequested } from '../utils/storage'

interface PopupState {
  progress: ExtractionProgress
  businesses: Business[]
  isMapsPage: boolean
  activeTabId: number | null
  error: string | null
  minDelaySeconds: number
  maxDelaySeconds: number

  init: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  refreshBusinesses: () => Promise<void>
  downloadCsv: () => Promise<void>
  setMinDelaySeconds: (value: number) => void
  setMaxDelaySeconds: (value: number) => void
}

const idleProgress: ExtractionProgress = {
  status: 'idle',
  discovered: 0,
  extracted: 0,
  failed: 0,
  message: 'Idle',
}

/** Looks up the user's active tab in the current window. */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

/** Sends a message to a tab's content script, resolving null instead of throwing if unreachable. */
async function sendToTab<T = unknown>(tabId: number, message: RuntimeMessage): Promise<T | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  } catch {
    // No content script listening yet (wrong page, or page still loading).
    return null
  }
}

let pollHandle: ReturnType<typeof setInterval> | null = null

export const usePopupStore = create<PopupState>((set, get) => ({
  progress: idleProgress,
  businesses: [],
  isMapsPage: false,
  activeTabId: null,
  error: null,
  minDelaySeconds: DEFAULT_DELAY_CONFIG.minDelayMs / 1000,
  maxDelaySeconds: DEFAULT_DELAY_CONFIG.maxDelayMs / 1000,

  async init() {
    const tab = await getActiveTab()
    if (tab?.id) {
      set({ activeTabId: tab.id })
      const pingResult = await sendToTab<{ ok: boolean }>(tab.id, { type: 'PING_MAPS_PAGE' })
      set({ isMapsPage: pingResult?.ok ?? false })
    } else {
      set({ error: 'No active tab found.', isMapsPage: false })
    }

    const config = await getDelayConfig()
    set({ minDelaySeconds: config.minDelayMs / 1000, maxDelaySeconds: config.maxDelayMs / 1000 })

    const progress = await getProgress()
    set({ progress })
    await get().refreshBusinesses()

    // Progress changes are written to chrome.storage.local from the
    // content script (potentially on a different page than the one the
    // popup was opened on, since extraction navigates the tab) — listen
    // for live updates rather than polling the tab.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !('progress' in changes)) return
      const newProgress = changes.progress.newValue as ExtractionProgress | undefined
      if (newProgress) {
        set({ progress: newProgress })
        get().refreshBusinesses()
      }
    })

    // IndexedDB writes don't fire chrome.storage events, so poll the
    // business list while a run is active to keep the live table fresh.
    if (pollHandle) clearInterval(pollHandle)
    pollHandle = setInterval(() => {
      if (get().progress.status === 'running') get().refreshBusinesses()
    }, 1500)
  },

  async start() {
    const { activeTabId, isMapsPage, minDelaySeconds, maxDelaySeconds } = get()
    if (!activeTabId) return
    if (!isMapsPage) {
      set({ error: 'Open a Google Maps search results page first.' })
      return
    }
    if (minDelaySeconds > maxDelaySeconds) {
      set({ error: 'Minimum delay cannot be greater than maximum delay.' })
      return
    }

    set({ error: null })
    const config: ExtractionDelayConfig = {
      minDelayMs: Math.max(0, minDelaySeconds) * 1000,
      maxDelayMs: Math.max(0, maxDelaySeconds) * 1000,
    }
    await setDelayConfig(config)
    await setStopRequested(false)
    await sendToTab(activeTabId, { type: 'START_EXTRACTION', config })
  },

  async stop() {
    // Stop is handled entirely through chrome.storage.local rather than by
    // messaging the tab, and takes effect immediately from here rather
    // than waiting for the content script to notice a flag:
    //  - a tab message could race with a navigation and silently fail to
    //    arrive while the page is mid-load;
    //  - if the content script's run loop ever gets wedged (an unexpected
    //    error stalls it without it checking the flag again), a "stop"
    //    that only sets a flag would never take effect and the UI would
    //    be stuck claiming "running" forever.
    // Clearing the run state directly guarantees the *next* page load
    // finds nothing to resume, and flipping progress to 'stopped' here
    // gives instant feedback regardless of what the content script is doing.
    await setStopRequested(true)
    await clearRunState()
    const current = get().progress
    await setProgress({ ...current, status: 'stopped', message: 'Extraction stopped by user.' })
  },

  async refreshBusinesses() {
    const businesses = await getAllBusinesses()
    // Newest first, so the live list shows what was just extracted.
    businesses.sort((a, b) => b.extractedAt.localeCompare(a.extractedAt))
    set({ businesses })
  },

  async downloadCsv() {
    const businesses = await getAllBusinesses()
    if (businesses.length === 0) {
      set({ error: 'No extracted businesses to export yet.' })
      return
    }
    set({ error: null })
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadBusinessesCsv(businesses, `local-business-extractor-${timestamp}.csv`)
  },

  setMinDelaySeconds(value) {
    set({ minDelaySeconds: value })
  },

  setMaxDelaySeconds(value) {
    set({ maxDelaySeconds: value })
  },
}))
