# Local Business Extractor

A Chrome Extension (Manifest V3) that extracts business information from
Google Maps search results — name, category, rating, review count, address,
phone, website, hours, coordinates, Google's "About" description, and (when
shown) Google's AI-generated review summary — so you can use it as a data
source for building and pitching a business a website.

## Folder structure

```
gmaps-business-details/
├── manifest.config.ts        # MV3 manifest, defined in TS (read by @crxjs/vite-plugin)
├── vite.config.ts            # Vite build config (React + CRX plugin)
├── tsconfig.json
├── package.json
├── public/
│   └── icons/                # icon16.png, icon48.png, icon128.png
├── src/
│   ├── types/
│   │   └── business.ts       # Business model, CSV columns, message protocol, run-state shape
│   ├── db/
│   │   └── indexedDb.ts      # IndexedDB read/write/dedup-check helpers
│   ├── utils/
│   │   ├── dedupe.ts         # Stable id derivation (name + address hash)
│   │   ├── csv.ts            # CSV serialization + browser download
│   │   └── storage.ts        # chrome.storage.local helpers (progress, run state, delay config)
│   ├── content/              # Injected into Google Maps pages
│   │   ├── dom.ts            # Low-level selectors / wait helpers
│   │   ├── scroller.ts       # Auto-scrolls the results feed to lazy-load all cards
│   │   ├── extractor.ts      # Scrapes the detail panel on a business's own page, retries on failure
│   │   └── content.ts        # Drives the run: scroll, queue businesses, navigate, extract, repeat
│   ├── background/
│   │   └── background.ts     # Service worker: dedupes + persists records to IndexedDB
│   └── popup/                # React popup UI
│       ├── popup.html
│       ├── main.tsx
│       ├── App.tsx           # Status, delay inputs, progress bar, live results table
│       ├── store.ts          # Zustand store (start/stop/refresh/CSV export)
│       └── popup.css
└── dist/                     # Build output — load THIS folder into Chrome
```

## Architecture overview

- **Popup (React + Zustand)** never touches the Maps DOM directly. Starting
  a run sends a `START_EXTRACTION` message (with the configured delay) to
  the content script on the active tab; stopping just writes a flag to
  `chrome.storage.local` directly. The popup reads progress and the live
  business list straight from storage/IndexedDB rather than polling the tab.
- **Content script extracts one business at a time by navigating the tab
  directly to that business's own Maps URL** (`/maps/place/...`) — the same
  action a real user takes when clicking a search result. An earlier version
  tried to click each result card open inside the results feed and read a
  transient side panel; that relied on Google's internal SPA click routing
  firing correctly for a synthetic click, which proved unreliable and could
  silently fail to extract anything. Visiting each business's own page is
  far more robust: it's a complete, fully-rendered page with phone/website/
  hours readily available.
- Because every business visit is a full page navigation, **the content
  script's JS context is destroyed and recreated on every single business**.
  All run state (remaining queue, counts, delay config) is persisted to
  `chrome.storage.local` after every step — see
  [`utils/storage.ts`](src/utils/storage.ts) — and read back by
  `bootstrap()` in [`content.ts`](src/content/content.ts) on each new page
  load so the run picks up exactly where it left off.
- **Background service worker** is the persistence layer: content scripts
  run on `www.google.com` and can't reach the extension's own IndexedDB
  (different origin), so each extracted record is sent here via
  `chrome.runtime.sendMessage`, deduplicated, and written to IndexedDB
  immediately — not batched until the run finishes.

### Reliability notes

- **Lazy loading**: the scroller polls `feed.scrollHeight`, scrolls to the
  bottom, and waits for either Maps' "You've reached the end of the list"
  sentinel or several consecutive scrolls with no new cards before stopping.
- **Deduplication**: each business's id is a hash of its normalized name +
  address ([dedupe.ts](src/utils/dedupe.ts)), so the same place encountered
  twice collapses to one row.
- **Retry**: reading the detail panel is wrapped in
  [`extractCurrentDetailPanelWithRetry`](src/content/extractor.ts) (3
  attempts with backoff) to absorb transient render delays.
- **Saved incrementally**: every successfully extracted business is sent to
  the background worker and written to IndexedDB immediately — you can
  open the popup and click **Download CSV** at any point mid-run, not just
  after it finishes.
- **Live results table**: the popup shows a running table of every business
  extracted so far (refreshed as records land), in addition to the progress
  bar and discovered/extracted/failed counters.
- **Configurable delay**: the popup has a "Delay between listings (seconds)"
  min/max range, used to randomly pace navigation between businesses. Wider
  and larger ranges look less like a bot and reduce the chance Google
  rate-limits or blocks the tab — increase it if you see a lot of failures.

> **Note on selector fragility**: Google Maps uses obfuscated, frequently
> changing CSS class names. The extraction selectors in
> [`extractor.ts`](src/content/extractor.ts) and [`dom.ts`](src/content/dom.ts)
> favor stable signals (ARIA roles/labels, `data-item-id` attributes) with
> class-name fallbacks, but if Google changes its markup you may need to
> update the selector lists there.

## Build instructions

Requires Node.js 18+.

```bash
npm install
npm run build
```

This produces a `dist/` folder containing the built extension (manifest,
popup, content script, background worker, icons).

For active development with hot reload:

```bash
npm run dev
```

This starts a Vite dev server; load the `dist/` folder it generates the
same way as a production build (see below) — `@crxjs/vite-plugin` injects
HMR so most popup/content-script edits apply without a manual reload.

## Chrome installation instructions

1. Run `npm install && npm run build` (or `npm run dev` for development).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `dist/` folder inside this project.
6. The "Local Business Extractor" icon should appear in your toolbar (pin
   it via the puzzle-piece icon if it's hidden).

## Usage

1. Go to `https://www.google.com/maps` and run a search (e.g. "plumbers in
   Denver") so a results feed appears on the left.
2. Click the extension icon. Optionally adjust **Delay between listings**
   (defaults to 3–6 seconds) — wider/larger ranges are safer against rate
   limiting but slower.
3. Press **Start Extraction**. The tab will scroll the feed to load every
   result, then navigate through each business's own page one at a time —
   you'll see the URL change as it works. Keep the popup open (or reopen it
   anytime) to watch live progress and a card for each business extracted
   so far (name, rating, category, address, phone, clickable website link,
   hours, Google's "About" description, and its AI review summary if shown).
4. Press **Stop Extraction** at any time to halt early — already-extracted
   records are kept, and the next visited page will stop itself.
5. Press **Download CSV** at any point — even mid-run — to export everything
   collected so far, with columns: `name, category, rating, review_count,
   address, phone, website, hours, latitude, longitude, description,
   reviews_summary`.

Data persists in IndexedDB between popup opens/closes and across extraction
runs (new runs add to, rather than replace, existing records, thanks to
deduplication).
