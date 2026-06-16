/**
 * Deduplication key derivation for extracted businesses.
 *
 * Google Maps can show the same business multiple times while scrolling
 * (the feed re-renders/re-orders cards as it lazy-loads), and the same
 * place can also appear under slightly different DOM nodes. We derive a
 * stable id from the normalized name + address so repeated sightings of
 * the same place collapse to a single record instead of duplicating rows
 * in the CSV.
 */

/** Lowercase, trim, and collapse whitespace/punctuation noise for comparison. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** A small, fast, non-cryptographic string hash (djb2) for compact ids. */
function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(0 + i)
  }
  // Force unsigned and base36-encode for a short, URL/key-safe id.
  return (hash >>> 0).toString(36)
}

/** Build the dedup id used as the IndexedDB primary key for a business. */
export function buildBusinessId(name: string, address: string): string {
  const key = `${normalize(name)}|${normalize(address)}`
  return hashString(key)
}
