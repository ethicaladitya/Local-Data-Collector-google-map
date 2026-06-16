import {
  DEFAULT_DELAY_CONFIG,
  type ExtractionDelayConfig,
  type ExtractionProgress,
  type ExtractionRunState,
} from '../types/business'

/**
 * Thin wrappers around chrome.storage.local for the few keys this extension
 * shares across contexts (popup, background, content script).
 *
 * chrome.storage.local is used — rather than chrome.runtime messaging — as
 * the source of truth for progress/run state because the content script's
 * JS context is destroyed and recreated on every full page navigation
 * (which happens once per business, by design — see ExtractionRunState).
 * Storage is the only thing that reliably survives that.
 */

const KEYS = {
  progress: 'progress',
  runState: 'runState',
  stopRequested: 'stopRequested',
  delayConfig: 'delayConfig',
} as const

export const IDLE_PROGRESS: ExtractionProgress = {
  status: 'idle',
  discovered: 0,
  extracted: 0,
  failed: 0,
  message: 'Idle',
}

export async function getProgress(): Promise<ExtractionProgress> {
  const result = await chrome.storage.local.get(KEYS.progress)
  return (result[KEYS.progress] as ExtractionProgress | undefined) ?? IDLE_PROGRESS
}

export async function setProgress(progress: ExtractionProgress): Promise<void> {
  await chrome.storage.local.set({ [KEYS.progress]: progress })
}

export async function getRunState(): Promise<ExtractionRunState | null> {
  const result = await chrome.storage.local.get(KEYS.runState)
  return (result[KEYS.runState] as ExtractionRunState | undefined) ?? null
}

export async function setRunState(state: ExtractionRunState): Promise<void> {
  await chrome.storage.local.set({ [KEYS.runState]: state })
}

export async function clearRunState(): Promise<void> {
  await chrome.storage.local.remove(KEYS.runState)
}

export async function getStopRequested(): Promise<boolean> {
  const result = await chrome.storage.local.get(KEYS.stopRequested)
  return Boolean(result[KEYS.stopRequested])
}

export async function setStopRequested(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEYS.stopRequested]: value })
}

export async function getDelayConfig(): Promise<ExtractionDelayConfig> {
  const result = await chrome.storage.local.get(KEYS.delayConfig)
  return (result[KEYS.delayConfig] as ExtractionDelayConfig | undefined) ?? DEFAULT_DELAY_CONFIG
}

export async function setDelayConfig(config: ExtractionDelayConfig): Promise<void> {
  await chrome.storage.local.set({ [KEYS.delayConfig]: config })
}

/** Subscribes to live changes for a single chrome.storage.local key. */
export function onStorageKeyChanged<T>(key: keyof typeof KEYS, callback: (newValue: T | undefined) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const change = changes[KEYS[key]]
    if (change) callback(change.newValue as T | undefined)
  })
}
