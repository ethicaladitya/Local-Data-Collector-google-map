/**
 * Low-level DOM helpers for the Google Maps content script.
 *
 * IMPORTANT — fragility notice:
 * Google Maps is a closed, frequently-changing SPA with obfuscated,
 * auto-generated CSS class names (e.g. "hfpxzc", "DUwDvf"). Those class
 * names WILL change over time and across Maps experiments/locales. Where
 * possible we prefer stable signals — ARIA roles, data-item-id attributes,
 * and structural relationships — over class names, and we keep a couple of
 * fallback selectors per field. If extraction starts silently failing,
 * this file is the first place to update: open Maps, inspect the detail
 * panel, and adjust the selector lists below.
 */

/** Generic polling wait: resolves once `predicate()` returns a truthy value. */
export function waitFor<T>(
  predicate: () => T | null | undefined,
  { timeout = 8000, interval = 150 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const result = predicate()
      if (result) {
        resolve(result)
        return
      }
      if (Date.now() - start >= timeout) {
        reject(new Error('waitFor: timed out'))
        return
      }
      setTimeout(tick, interval)
    }
    tick()
  })
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sleeps a random duration in [min, max] ms. Used between scroll steps and
 * card opens so requests don't fire in an obviously robotic, fixed-interval
 * pattern — reduces the chance Google's anti-scraping heuristics flag the
 * tab and start throttling/blocking the page.
 */
export function randomSleep(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min)
  return sleep(ms)
}

/** The scrollable results list shown on the left when searching Maps. */
export function getFeedElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('div[role="feed"]')
}

/** True if the current page is a Maps search-results listing (has a feed). */
export function isMapsSearchResultsPage(): boolean {
  return (
    location.hostname === 'www.google.com' &&
    location.pathname.startsWith('/maps') &&
    getFeedElement() !== null
  )
}

/** Each result card inside the feed. Cards are anchors wrapping a result. */
export function getFeedCards(feed: HTMLElement): HTMLAnchorElement[] {
  // Result cards are anchors that link to an individual place and carry an
  // aria-label with the business name. This has been the stable shape of
  // each feed entry across recent Maps UI revisions.
  return Array.from(feed.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]'))
}

/** The "You've reached the end of the list" sentinel Maps renders when done. */
export function feedHasReachedEnd(feed: HTMLElement): boolean {
  const text = feed.textContent ?? ''
  return /reached the end of the list/i.test(text)
}

/** True if the current page is an individual place's own detail page. */
export function isMapsPlaceDetailPage(): boolean {
  return location.hostname === 'www.google.com' && location.pathname.startsWith('/maps/place/')
}

/** The detail panel root shown on a place's own page (or the side panel after opening one). */
export function getDetailPanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('div[role="main"]')
}

/** First matching element's trimmed text content, or '' if not found. */
export function queryText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const el = root.querySelector(selector)
    const text = el?.textContent?.trim()
    if (text) return text
  }
  return ''
}

/** First matching element's attribute value, or '' if not found. */
export function queryAttr(root: ParentNode, selectors: string[], attr: string): string {
  for (const selector of selectors) {
    const el = root.querySelector(selector)
    const value = el?.getAttribute(attr)?.trim()
    if (value) return value
  }
  return ''
}
