import type { Business } from '../types/business'

/**
 * Thin promise-based wrapper around a single IndexedDB database used to
 * persist extracted business records.
 *
 * This module is imported by both the background service worker and the
 * popup page. Both run under the extension's own origin
 * (chrome-extension://<id>), so they share the same IndexedDB database —
 * the background worker writes records as they stream in from the content
 * script, and the popup reads them directly for display/CSV export without
 * needing to proxy every read through the worker.
 */

const DB_NAME = 'local-business-extractor'
const DB_VERSION = 1
const STORE_NAME = 'businesses'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('extractedAt', 'extractedAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

/** Insert or overwrite a business record (keyed by its deduplicated id). */
export async function putBusiness(business: Business): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(business)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Fetch every stored business record, ordered by extraction time. */
export async function getAllBusinesses(): Promise<Business[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as Business[])
    request.onerror = () => reject(request.error)
  })
}

/** Check whether a business id already exists (used for dedup before insert). */
export async function hasBusiness(id: string): Promise<boolean> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getKey(id)
    request.onsuccess = () => resolve(request.result !== undefined)
    request.onerror = () => reject(request.error)
  })
}

/** Wipe all stored records — used when the user starts a fresh extraction run. */
export async function clearBusinesses(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Count stored records without pulling all of them into memory. */
export async function countBusinesses(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
