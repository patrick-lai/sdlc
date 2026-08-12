---
name: qa-demo
description: >
  QA a pull request or feature by booting the best available demo surface
  (Storybook → e2e/integration → local app preview → docs), proving the change
  end-to-end, and recording a polished narrated TestReel video with on-screen
  caption overlays. Use when the user asks to QA a PR, demo a feature, record a
  TestReel, prove Storybook/e2e works, create a walkthrough video, or show that
  a UI change works for reviewers.
---

# qa-demo

Produce a **viewer-facing proof** that a PR/feature works: boot the right surface, walk the happy path (+ 1–2 proof moments), assert critical UI states, and deliver a polished [TestReel](https://github.com/greentfrapp/testreel) video with **on-screen narration captions** on every major beat.

TestReel has **no built-in caption action**. You MUST inject DOM caption banners via Playwright `page.evaluate` (use `scripts/caption-overlay.mjs`) between steps, and use `hideCursor` / `showCursor` plus waits for “explain this moment” beats.

## When to use

- “QA this PR with a TestReel”
- “Record a Storybook demo of the new Button”
- “Prove the filter panel works end-to-end”
- “Demo this feature for reviewers”

## Workflow

Follow these stages in order. Document decisions briefly as you go (boot path, base URL, demo plan).

### 1. Intake

Collect (ask only for what is missing):

| Input | Examples |
|-------|----------|
| **Target** | Local path, git URL, or PR URL (`https://github.com/org/repo/pull/123`) |
| **What to prove** | PR title/body, feature description, acceptance criteria |
| **Preferred surface** (optional) | Storybook / Playwright / Cypress / app URL |

If given a PR URL:

1. Fetch PR metadata + changed files (`gh pr view`, `gh pr diff`, or GitHub API).
2. Checkout the PR head locally when needed (`gh pr checkout <n>`).
3. Map changed files → likely UI entry points (components, routes, stories, e2e specs).

### 2. Discover boot path

Inspect the target repo. Read `package.json` (and workspace roots), README, CI configs, and framework configs. Prefer surfaces in this order:

1. **Storybook** — `.storybook/`, `storybook` deps, scripts like `storybook` / `build-storybook`
2. **Existing e2e/integration demos** — Playwright/Cypress specs that exercise the feature
3. **Local app preview** — `dev` / `start` / `preview` (Vite, Next, etc.)
4. **Static docs site** — Docusaurus, VitePress, etc.

Also check: `docker-compose*`, Turborepo/Nx/pnpm workspaces, monorepo package that owns the UI change.

**Write down** the chosen path and why (1–3 sentences). See [references/boot-detection.md](references/boot-detection.md).

### 3. Boot

1. Install deps if `node_modules` is missing (`npm` / `pnpm` / `yarn` / `bun` — match the lockfile).
2. Start the chosen surface in the background.
3. Wait until healthy (HTTP 200 on the expected URL/port, or Storybook “Local:” URL in logs).
4. Capture **base URL** (e.g. `http://localhost:6006`, `http://localhost:3000`).

Common defaults:

| Surface | Typical command | Default URL |
|---------|-----------------|-------------|
| Storybook | `npm run storybook -- --ci` | `http://localhost:6006` |
| Vite/Next dev | `npm run dev` | `http://localhost:5173` / `3000` |
| Playwright UI/report | Use existing config `baseURL` | from `playwright.config.*` |
| Cypress | `npx cypress open` / headed run against app URL | app + Cypress |

If boot fails, try the next surface in the preference order. Do not invent a stack that is not in the repo.

### 4. Plan the demo

Map the PR/feature to a **viewer-facing walkthrough**:

1. **Title beat** — what PR/feature this proves
2. **Happy path** — primary user flow (3–8 interaction beats)
3. **1–2 proof/edge moments** — empty state, validation error, disabled → enabled, before/after, etc.
4. **Result beat** — closing “what we proved” caption

Write either:

- A **narrated runner script** (preferred — required for captions) using TestReel `recordPage` + this skill’s caption helper, **or**
- A TestReel **definition** (JSON/JSONC/YAML) for the interaction skeleton, then execute it via a small Node script that injects captions between steps (TestReel CLI alone cannot show captions).

Polish defaults (see [references/testreel.md](references/testreel.md)):

```json
{
  "viewport": { "width": 1280, "height": 720 },
  "cursor": { "style": "pointer", "size": 48 },
  "chrome": { "url": true },
  "background": {
    "gradient": { "from": "#0f172a", "to": "#1e3a5f" },
    "padding": 48,
    "borderRadius": 12
  },
  "outputFormat": "mp4"
}
```

Prefer `mp4` when `ffmpeg` is available; otherwise `webm`.

### 5. Narration (required)

Every major beat MUST show an on-screen caption. Captions are **audience-facing**, short, and present-tense:

- Good: “Opening the new Filter panel”, “Verifying empty state”, “Submitting the form”
- Bad: “clicking div.css-x7”, “running assert #3”, internal file names

Include:

1. **Title card** at start (PR number/title or feature name)
2. Caption before each major interaction or reveal
3. **Result** caption at the end

Use the helper:

```js
import {
  showCaption,
  updateCaption,
  hideCaption,
} from './scripts/caption-overlay.mjs'
```

Pattern for an “explain this moment” beat:

```js
import { hideCursor, showCursor } from 'testreel'

await showCaption(page, 'Verifying empty state')
await hideCursor(page)
await page.waitForTimeout(1800) // let viewers read
await showCursor(page)
await hideCaption(page)
```

Caption element id is always `__sdlc_caption`. Style guidelines live in the helper (high contrast, large type, safe margins). Position: bottom banner by default; top only if the UI under test occupies the bottom edge.

### 6. Record with TestReel

1. Ensure `testreel` + Playwright are available (scratch dir or project):

   ```bash
   npm install testreel playwright
   npx playwright install chromium
   ```

2. Prefer a **Node runner** with `recordPage` so you can `page.evaluate` captions between steps. Example shape:

   ```js
   import { chromium } from 'playwright'
   import { recordPage, hideCursor, showCursor } from 'testreel'
   import { showCaption, hideCaption } from './caption-overlay.mjs'

   const browser = await chromium.launch()
   const context = await browser.newContext({
     viewport: { width: 1280, height: 720 },
     recordVideo: { dir: './testreel-output', size: { width: 1280, height: 720 } },
   })
   const page = await context.newPage()
   await page.goto(baseUrl)

   const recorder = await recordPage(page, {
     outputDir: './testreel-output',
     chrome: { url: true },
     background: {
       gradient: { from: '#0f172a', to: '#1e3a5f' },
       padding: 48,
       borderRadius: 12,
     },
     outputFormat: hasFfmpeg ? 'mp4' : 'webm',
   })

   await showCaption(page, `QA: ${featureTitle}`)
   await hideCursor(page)
   await page.waitForTimeout(2000)
   await showCursor(page)

   // …interactions via recorder.click / type / zoom …
   // showCaption before each major beat; hideCursor during long waits

   await showCaption(page, 'Result: feature works end-to-end')
   await hideCursor(page)
   await page.waitForTimeout(2000)

   const result = await recorder.stop()
   await browser.close()
   ```

3. Alternatively for non-narrated validation only: `npx testreel recording.json` (still prefer a narrated runner for delivery).

4. Use **zoom** on important UI, **pauseAfter**/waits after key actions, and **hideCursor** during explanation waits.

Validate the toolchain anytime with the bundled smoke:

```bash
# from this skill directory (or repo root via npm run smoke:testreel)
node scripts/smoke-testreel.mjs
```

### 7. Prove

Assert critical UI states with Playwright expects / visible selectors (in the runner or a companion check):

- Key copy, controls, or routes from the PR are visible
- Happy-path outcome is on screen (toast, list item, enabled button, URL change)
- Edge/proof moment behaves as claimed

If recording fails mid-way:

- Keep partial output under `testreel-output/`
- Report which step failed and what was already proven
- Do not claim full pass

### 8. Deliver

Hand back:

1. **Video path** (and format)
2. **Screenshots** (named beats if captured)
3. Short **QA report**:

```markdown
## QA Demo Report

- **Target:** …
- **What we proved:** …
- **Boot method:** Storybook @ http://localhost:6006 (why: …)
- **Result:** PASS | FAIL | PARTIAL
- **Artifacts:** `testreel-output/….mp4`, screenshots…
- **Residual risks:** …
```

## Caption helper

Path: [scripts/caption-overlay.mjs](scripts/caption-overlay.mjs)

| Export | Purpose |
|--------|---------|
| `showCaption(page, text, options?)` | Create/update `#__sdlc_caption` |
| `updateCaption(page, text)` | Change text only |
| `hideCaption(page)` | Remove the banner |

Copy or import this file into the target project’s scratch runner as needed. Do not reinvent the overlay styles.

## References

- [references/testreel.md](references/testreel.md) — CLI, definition shape, polish options
- [references/boot-detection.md](references/boot-detection.md) — Storybook / Playwright / Cypress / Vite / Next heuristics
- [scripts/smoke-testreel.mjs](scripts/smoke-testreel.mjs) — self-contained narrated smoke against TodoMVC / example.com

## Quality bar

- Captions on **every** major beat (title + interactions + result)
- Viewer can understand the video **without audio**
- Prefer the real feature UI over unrelated pages
- No fake pass: if you could not boot or assert, say so clearly
- Clean up background servers you started when done (best effort)
