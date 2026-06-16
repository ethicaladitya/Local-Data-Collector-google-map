import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// MV3 manifest, defined in TS so @crxjs/vite-plugin can resolve
// hashed build output paths for the content script / background worker.
export default defineManifest({
  manifest_version: 3,
  name: 'Local Business Extractor',
  description:
    'Extract business information (name, category, rating, address, phone, website, hours, coordinates) from Google Maps search results for building business websites.',
  version: pkg.version,
  icons: {
    16: 'public/icons/icon16.png',
    48: 'public/icons/icon48.png',
    128: 'public/icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: {
      16: 'public/icons/icon16.png',
      48: 'public/icons/icon48.png',
      128: 'public/icons/icon128.png',
    },
  },
  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      // Google Maps serves the search/results UI from /maps on both hosts below.
      matches: ['https://www.google.com/maps/*', 'https://www.google.com/maps'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['https://www.google.com/maps/*'],
})
