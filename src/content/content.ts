import type { Business, ExtractionDelayConfig, ExtractionRunState, RuntimeMessage } from '../types/business'
import { getFeedElement, isMapsPlaceDetailPage, isMapsSearchResultsPage, randomSleep, sleep } from './dom'
import { scrollFeedAndCollectHrefs } from './scroller'
import { extractCurrentDetailPanelWithRetry } from './extractor'
import { clearRunState, getRunState, getStopRequested, setProgress, setRunState } from '../utils/storage'

/**
 * Content script entry point, injected into every Google Maps page
 * (both search-results pages and individual place pages — see
 * manifest.config.ts).
 *
 * Extraction works by navigating the tab directly to each business's own
 * Maps URL, one at a time, rather than clicking cards open inside the
 * results feed. Clicking a card relies on Google Maps' internal SPA
 * routing/jsaction handlers firing correctly for a synthetic click, which
 * proved unreliable in practice (silent failures with nothing extracted).
 * A direct page load is the same action a real user takes when they click
 * a result and is far more reliable — every field (phone, website, hours)
 * gets a single, fully-rendered place page to read from.
 *
 * The tradeoff is that every business visit is a full page navigation,
 * which destroys and recreates this script's JS context. So all run state
 * (the remaining queue, counts, config) lives in chrome.storage.local —
 * see ../utils/storage.ts — and is read back on every load via bootstrap()
 * to pick up where the previous page left off.
 */

/** In-memory mirror of the stop flag, kept in sync for the in-page scroll loop. */
let stopRequestedDuringScroll = false
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'stopRequested' in changes) {
    stopRequestedDuringScroll = Boolean(changes.stopRequested.newValue)
  }
})

async function sendBusiness(business: Business): Promise<void> {
  const message: RuntimeMessage = { type: 'BUSINESS_EXTRACTED', business }
  await chrome.runtime.sendMessage(message)
}

/**
 * Runs `fn` and, if it throws anything unexpected (a storage write failing,
 * the extension context going away mid-navigation, etc.), surfaces it as a
 * visible error instead of leaving the run silently wedged on whatever page
 * it happened to be on. Without this, an unhandled rejection here would
 * just stop the chain dead — chrome.storage.local would still say
 * status: 'running' forever, the popup would show no further progress, and
 * Stop would have nothing left to interrupt.
 */
async function withFailSafe(state: ExtractionRunState, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error('[Local Business Extractor] Run halted unexpectedly', err)
    await clearRunState()
    await setProgress({
      status: 'error',
      discovered: state.discovered,
      extracted: state.extracted,
      failed: state.failed,
      message: `Stopped unexpectedly: ${err instanceof Error ? err.message : 'unknown error'}. Click Start to begin a new run.`,
    })
  }
}

/** Extracts the business on the current page (if any) and advances the run. */
async function continueRun(state: ExtractionRunState): Promise<void> {
  if (await getStopRequested()) {
    await clearRunState()
    await setProgress({
      status: 'stopped',
      discovered: state.discovered,
      extracted: state.extracted,
      failed: state.failed,
      message: 'Extraction stopped by user.',
    })
    return
  }

  let { extracted, failed } = state

  await setProgress({
    status: 'running',
    discovered: state.discovered,
    extracted,
    failed,
    message: `Extracting ${extracted + failed + 1} of ${state.discovered}…`,
  })

  try {
    const business = await extractCurrentDetailPanelWithRetry()
    await sendBusiness(business)
    extracted += 1
  } catch (err) {
    console.warn('[Local Business Extractor] Failed to extract', location.href, err)
    failed += 1
  }

  if (state.queue.length === 0) {
    await clearRunState()
    await setProgress({
      status: 'completed',
      discovered: state.discovered,
      extracted,
      failed,
      message: `Done. Extracted ${extracted} of ${state.discovered} businesses.`,
    })
    return
  }

  const [nextHref, ...rest] = state.queue
  const nextState: ExtractionRunState = {
    status: 'running',
    currentHref: nextHref,
    queue: rest,
    discovered: state.discovered,
    extracted,
    failed,
    config: state.config,
  }
  await setRunState(nextState)
  await setProgress({
    status: 'running',
    discovered: state.discovered,
    extracted,
    failed,
    message: `Extracted ${extracted + failed} of ${state.discovered}. Moving to next…`,
  })

  // Pace requests so they don't fire back-to-back at machine speed, which
  // is one of the easiest signals anti-scraping heuristics key off of. The
  // delay range is user-configurable from the popup (see ExtractionDelayConfig).
  await randomSleep(state.config.minDelayMs, state.config.maxDelayMs)

  if (await getStopRequested()) {
    await clearRunState()
    await setProgress({
      status: 'stopped',
      discovered: state.discovered,
      extracted,
      failed,
      message: 'Extraction stopped by user.',
    })
    return
  }

  location.href = nextHref
}

/** On script load, resume an in-progress run if this page is the next item in its queue. */
async function bootstrap(): Promise<void> {
  const state = await getRunState()
  if (!state || state.status !== 'running') return

  // Guard against resuming on the wrong page — e.g. stale state left over
  // from a previous run on a page that isn't a place page at all. A
  // navigation can occasionally take a moment to settle (client-side
  // redirects, slow loads), so retry briefly rather than bailing
  // instantly and leaving the run silently "stuck" with nothing left to
  // ever advance it again.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (isMapsPlaceDetailPage()) {
      await withFailSafe(state, () => continueRun(state))
      return
    }
    await sleep(300)
  }

  // Never landed on a place page — surface this instead of leaving the
  // popup showing "running" with no further progress forever.
  await clearRunState()
  await setProgress({
    status: 'error',
    discovered: state.discovered,
    extracted: state.extracted,
    failed: state.failed,
    message: 'Stopped unexpectedly: navigation did not land on a Google Maps place page. Click Start to begin a new run.',
  })
}

async function startExtraction(config: ExtractionDelayConfig): Promise<void> {
  if (!isMapsSearchResultsPage()) {
    await setProgress({
      status: 'error',
      discovered: 0,
      extracted: 0,
      failed: 0,
      message: 'No Google Maps results feed found on this page. Run a search first.',
    })
    return
  }

  const emptyState: ExtractionRunState = {
    status: 'running',
    currentHref: null,
    queue: [],
    discovered: 0,
    extracted: 0,
    failed: 0,
    config,
  }

  await withFailSafe(emptyState, async () => {
    stopRequestedDuringScroll = false
    await setProgress({ status: 'running', discovered: 0, extracted: 0, failed: 0, message: 'Scrolling results feed…' })

    const feed = getFeedElement()!
    const { hrefs } = await scrollFeedAndCollectHrefs(feed, {
      shouldStop: () => stopRequestedDuringScroll,
      onProgress: (discoveredCount) =>
        setProgress({
          status: 'running',
          discovered: discoveredCount,
          extracted: 0,
          failed: 0,
          message: `Found ${discoveredCount} businesses so far…`,
        }),
    })

    if (stopRequestedDuringScroll) {
      await setProgress({ status: 'stopped', discovered: hrefs.length, extracted: 0, failed: 0, message: 'Extraction stopped by user.' })
      return
    }

    if (hrefs.length === 0) {
      await setProgress({
        status: 'error',
        discovered: 0,
        extracted: 0,
        failed: 0,
        message: 'No businesses found in the results feed.',
      })
      return
    }

    const [firstHref, ...rest] = hrefs
    await setRunState({
      status: 'running',
      currentHref: firstHref,
      queue: rest,
      discovered: hrefs.length,
      extracted: 0,
      failed: 0,
      config,
    })
    await setProgress({
      status: 'running',
      discovered: hrefs.length,
      extracted: 0,
      failed: 0,
      message: `Loaded ${hrefs.length} businesses. Starting extraction…`,
    })

    await randomSleep(config.minDelayMs, config.maxDelayMs)
    location.href = firstHref
  })
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_EXTRACTION':
      startExtraction(message.config)
      sendResponse({ ok: true })
      return undefined
    case 'PING_MAPS_PAGE':
      sendResponse({ ok: isMapsSearchResultsPage() })
      return undefined
    default:
      return undefined
  }
})

bootstrap()
