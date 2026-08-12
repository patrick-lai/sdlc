# TestReel — condensed reference

Upstream: [greentfrapp/testreel](https://github.com/greentfrapp/testreel) · npm: `testreel`

TestReel records Playwright-driven demos to WebM / MP4 / GIF with animated cursor, macOS chrome, backgrounds, and zoom. **It has no caption action** — inject on-screen narration with Playwright `page.evaluate` (see `../scripts/caption-overlay.mjs`).

## Install

```bash
npm install testreel playwright
npx playwright install chromium
```

MP4 and GIF require `ffmpeg` on `PATH`. Prefer MP4 when available; otherwise WebM.

## CLI

```bash
npx testreel recording.json
npx testreel recording.json --format mp4
npx testreel recording.json --headed
npx testreel validate recording.json
```

Output defaults to `./testreel-output/` (video, PNGs, `output.json`).

> CLI definitions alone cannot show narration captions. For qa-demo deliverables, use the `recordPage` API (or a custom runner) so you can call the caption helper between steps.

## Definition shape

Formats: `.json`, `.jsonc`, `.yaml` / `.yml`.

```json
{
  "url": "http://localhost:6006/?path=/story/button--primary",
  "viewport": { "width": 1280, "height": 720 },
  "cursor": { "style": "pointer" },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#0f172a", "to": "#1e3a5f" },
    "padding": 48,
    "borderRadius": 12
  },
  "outputFormat": "mp4",
  "steps": [
    { "action": "wait", "ms": 1000 },
    { "action": "click", "selector": "button.primary", "zoom": 2 },
    { "action": "hideCursor" },
    { "action": "wait", "ms": 1500 },
    { "action": "showCursor" },
    { "action": "screenshot", "name": "primary-click" }
  ]
}
```

### Useful root fields

| Field | Notes |
|-------|--------|
| `url` | Required. Supports `${ENV}` substitution |
| `steps` | Required non-empty action list |
| `viewport` | Default `1280×720` |
| `outputFormat` | `webm` (default), `mp4`, `gif` |
| `cursor` | `true` or options (`style`, `size`, `idleHide`, …) |
| `chrome` | Window chrome; `{ "url": true }` shows address bar |
| `background` | Padding + solid `color` or `gradient` |
| `speed` | Global multiplier (`>1` faster) |
| `waitForSelector` | Wait before first step |
| `setup` | Pre-recording steps (not in video) — auth, etc. |

### Actions (common)

| Action | Purpose |
|--------|---------|
| `wait` | Pause (`ms`) |
| `click` | Click; optional `zoom` |
| `type` / `fill` | Keystroke typing vs instant fill |
| `hover` / `scroll` / `keyboard` | Pointer, scroll, keys |
| `navigate` | Go to URL |
| `zoom` | `{ selector, scale }` — `scale: 1` resets |
| `screenshot` | Named PNG |
| `waitForNetwork` | Wait for URL substring |
| `hideCursor` / `showCursor` | Fade cursor for explanation beats |

Per-step: `pauseAfter`, `timeout`, `waitFor`, `speed`.

## recordPage API (preferred for narrated demos)

```js
import { chromium } from 'playwright'
import { recordPage, hideCursor, showCursor } from 'testreel'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: './testreel-output', size: { width: 1280, height: 720 } },
})
const page = await context.newPage()
await page.goto(url)

const recorder = await recordPage(page, {
  outputDir: './testreel-output',
  chrome: { url: true },
  background: {
    gradient: { from: '#0f172a', to: '#1e3a5f' },
    padding: 48,
    borderRadius: 12,
  },
  outputFormat: 'mp4',
})

await recorder.click('.todo .toggle')
await hideCursor(page)
await page.waitForTimeout(1500)
await showCursor(page)

const result = await recorder.stop() // finalizes video; context closes
```

`recorder` methods: `click`, `type`, `fill`, `hover`, `scroll`, `zoom`, `screenshot`, `keyboard`, `navigate`, `wait`, `stop`.

Keep the raw Playwright `page` for caption `evaluate` calls and assertions.

## Narration recipe

1. `showCaption(page, text)` from `caption-overlay.mjs`
2. Optional `hideCursor(page)` for reading beats
3. `wait` 1.2–2.5s so captions are readable
4. `showCursor(page)` before the next interaction
5. Update or hide caption before the next beat

Title caption first; Result caption last.

## Polish tips

- Prefer dark slate gradients over default purple marketing gradients for SDLC demos
- Zoom on the control that proves the PR
- Keep demos under ~60–90s when possible
- Name screenshots after beats (`empty-state`, `after-submit`)
- On failure, keep `testreel-output/` partial artifacts
