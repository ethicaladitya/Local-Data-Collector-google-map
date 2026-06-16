import { feedHasReachedEnd, getFeedCards, randomSleep } from './dom'

export interface ScrollResult {
  /** Unique place hrefs discovered in the feed, in feed order. */
  hrefs: string[]
}

/**
 * Repeatedly scrolls the results feed to the bottom so Google Maps lazy-loads
 * additional result cards, collecting every unique place href as it goes.
 *
 * Stops when either:
 *  - Maps renders its "You've reached the end of the list" sentinel, or
 *  - several consecutive scroll attempts produce no new cards (a safety net
 *    in case the sentinel text changes or the feed is shorter than one
 *    viewport and never needs to scroll).
 */
export async function scrollFeedAndCollectHrefs(
  feed: HTMLElement,
  options: {
    shouldStop: () => boolean
    onProgress: (discoveredCount: number) => void
    /** Min/max ms to randomly wait between scroll steps (jittered, not fixed). */
    scrollDelayRangeMs?: [number, number]
    maxStaleAttempts?: number
  },
): Promise<ScrollResult> {
  const { shouldStop, onProgress, scrollDelayRangeMs = [900, 2200], maxStaleAttempts = 6 } = options

  const seen = new Set<string>()
  let staleAttempts = 0

  while (!shouldStop()) {
    const cards = getFeedCards(feed)
    const beforeSize = seen.size
    for (const card of cards) {
      if (card.href) seen.add(card.href)
    }
    if (seen.size > beforeSize) {
      onProgress(seen.size)
      staleAttempts = 0
    } else {
      staleAttempts += 1
    }

    if (feedHasReachedEnd(feed)) break
    if (staleAttempts >= maxStaleAttempts) break

    // Scroll the feed panel itself (not the window) to the bottom to
    // trigger Maps' intersection-observer-based lazy loading.
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'auto' })
    await randomSleep(scrollDelayRangeMs[0], scrollDelayRangeMs[1])
  }

  return { hrefs: Array.from(seen) }
}
