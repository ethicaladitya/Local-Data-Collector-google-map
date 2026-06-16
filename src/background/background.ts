import type { RuntimeMessage } from '../types/business'
import { hasBusiness, putBusiness } from '../db/indexedDb'

/**
 * MV3 service worker.
 *
 * Its only job is persistence: content scripts run on www.google.com and
 * cannot reach the extension's own IndexedDB database (different origin),
 * so every extracted record is sent here via chrome.runtime.sendMessage to
 * be deduplicated and written to storage. Progress/run-state coordination
 * lives directly in chrome.storage.local (shared by all extension
 * contexts, including content scripts) — see ../utils/storage.ts — so this
 * worker doesn't need to relay or cache any of that itself.
 */

async function handleBusinessExtracted(message: Extract<RuntimeMessage, { type: 'BUSINESS_EXTRACTED' }>) {
  const { business } = message
  const alreadyStored = await hasBusiness(business.id)
  if (!alreadyStored) {
    await putBusiness(business)
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'BUSINESS_EXTRACTED') {
    handleBusinessExtracted(message).then(() => sendResponse({ ok: true }))
    return true // keep the message channel open for the async response
  }
  return undefined
})
