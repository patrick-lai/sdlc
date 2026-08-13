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

Produce a **viewer-facing proof** that a PR/feature works: boot the right surface, walk the happy path (+ 1–2 proof moments), assert critical UI states, and deliver a polished [TestReel](https://github.com/greentfrapp/testreel) video with **on-screen narration captions** on every major beat, and run **axe-core accessibility scans** on every major asserted UI state.

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
| **Target** | Local path, git URL, or GitHub/Bitbucket-style PR URL |
| **What to prove** | PR title/body, feature description, acceptance criteria |
| **Preferred surface** (optional) | Storybook / Playwright / Cypress / app URL |

If given a PR URL:

1. Fetch metadata, description, review context, and changed files with the available provider CLI/API. Do not require a specific company tool.
2. Identify base and source revisions. Checkout the source branch only when the current workspace is not already on it; preserve unrelated work.
3. Map acceptance criteria and changed files to likely UI entry points (components, routes, stories, e2e specs).
4. Treat links to an older demo as context, not proof for the current revision.

### 1b. Decide whether a visual demo applies

Before installing or booting anything, classify the change:

- **Visual:** user-facing component, route, interaction, state, or rendered documentation changed → continue.
- **Mixed:** UI plus backend/config changes → record the UI slice this reel proves and list the rest as residual risk.
- **Non-visual:** backend protocol, build tooling, data migration, or config-only change with no truthful browser-visible behavior → stop cleanly with `NOT_APPLICABLE`. Name the inspected files and recommend the appropriate unit/integration/API proof. Do not invent a mock UI just to produce a video.

### 2. Discover boot path

Inspect the target repo. Read `package.json` (and workspace roots), README, CI configs, and framework configs. Prefer surfaces in this order:

1. **Storybook** — `.storybook/`, `storybook` deps, scripts like `storybook` / `build-storybook`
2. **Existing e2e/integration demos** — Playwright/Cypress specs that exercise the feature
3. **Local app preview** — `dev` / `start` / `preview` (Vite, Next, etc.)
4. **Static docs site** — Docusaurus, VitePress, etc.

Also check: `docker-compose*`, Turborepo/Nx/pnpm workspaces, and the manifest/build metadata that identifies the package owning the UI change. In a monorepo, use package-scoped scripts rather than booting or installing the entire repository when possible.

**Write down** the chosen path, owning package, command, and why (1–3 sentences). See [references/boot-detection.md](references/boot-detection.md).

### 3. Boot

1. Install target-repo dependencies only when required (`npm` / `pnpm` / `yarn` / `bun` — match the lockfile). Never rewrite its lockfile merely to add TestReel; install recording dependencies in a temporary scratch directory when the repo does not already own them.
2. Start the chosen surface in the background and capture its PID/log path.
3. Wait until healthy (HTTP 200 on the expected URL/port, or Storybook “Local:” URL in logs) with a bounded timeout.
4. Capture **base URL** (e.g. `http://localhost:6006`, `http://localhost:3000`).
5. Register cleanup before recording: stop only the server/browser processes you started. Preserve logs and partial artifacts on failure.

For authenticated apps, use an existing repository-approved test account or Playwright `storageState`. Complete login before recording; never place passwords, tokens, cookies, SSO screens, or 2FA prompts in captions, logs, screenshots, or video. If operator login is required, pause for it and begin the reel only after the authenticated landing page is ready.

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
4. **Accessibility checkpoints** — scan the initial state and each materially changed state after its Playwright assertions
5. **Result beat** — closing “what we proved” caption

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
    "gradient": { "from": "#0052CC", "to": "#0747A6" },
    "padding": 48,
    "borderRadius": 12
  },
  "outputFormat": "mp4"
}
```

Prefer `mp4` when `ffmpeg` is available; otherwise `webm`.

### 5. Narration (required)

Every major beat MUST show an on-screen caption. Captions **prove a claim**, they do not narrate the click.

```js
await showCaption(page, {
  kicker: '02 · complete',
  claim: 'TB-1 flips to Done and stays checked',
  detail: 'Task.markComplete — completed filter will still list it',
})
```

| | Write this | Not this |
|---|---|---|
| **Kicker** | Beat + contract (`03 · list(COMPLETED)`) | `step 3`, `click` |
| **Claim** | What a reviewer should see now | “Clicking the toggle” |
| **Detail** | The behavior/API being proved | Internal selectors, file names |

Include:

1. **Title card** — PR/feature + the one sentence of what this reel proves
2. Caption **before** each interaction, then zoom/wait on the resulting state
3. **Result** — list the claims that actually held (not “feature works”)

Read time: 2.0–2.8s after a 3-line caption (`hideCursor` during the wait). Assert the claim with Playwright before advancing — if the assert fails, the reel is PARTIAL.

Use the helper:

```js
import {
  showCaption,
  updateCaption,
  hideCaption,
} from './scripts/caption-overlay.mjs'
```

Caption element id is always `__sdlc_caption`. Position: bottom-left lower-third by default; top only if the UI under test occupies the bottom edge.

### 6. Record with TestReel

1. Ensure `testreel` + Playwright are available. Prefer a temporary scratch directory unless the target repo already declares them, so QA does not dirty the target manifest or lockfile:

   ```bash
   scratch=$(mktemp -d)
   npm install --prefix "$scratch" testreel playwright axe-core
   npm exec --prefix "$scratch" -- playwright install chromium
   ```

   If browser installation is blocked, report the exact command and failure; do not claim the feature failed. If `ffmpeg` is absent, record WebM rather than installing system packages without permission.

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
       gradient: { from: '#0052CC', to: '#0747A6' },
       padding: 48,
       borderRadius: 12,
     },
     outputFormat: hasFfmpeg ? 'mp4' : 'webm',
   })

   await showCaption(page, {
     kicker: 'QA demo',
     claim: featureTitle,
     detail: 'Proving the happy path plus one failure and one empty state',
   })
   await hideCursor(page)
   await page.waitForTimeout(2400)
   await showCursor(page)

   // …interactions via recorder.click / type / zoom …
   // showCaption (kicker/claim/detail) before each beat; hideCursor while they read

   await showCaption(page, {
     kicker: 'Result',
     claim: 'Happy path, validation, and empty state all held',
     detail: 'Do not say PASS unless every Playwright assert above succeeded',
   })
   await hideCursor(page)
   await page.waitForTimeout(2400)

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

### 7. Prove interactions and accessibility

Assert critical UI states with Playwright expects / visible selectors (in the runner or a companion check):

- Key copy, controls, or routes from the PR are visible
- Happy-path outcome is on screen (toast, list item, enabled button, URL change)
- Edge/proof moment behaves as claimed

Accessibility is required for visual demos:

1. Load `axe-core` from the scratch dependencies and import `scanAccessibility`, `mergeAccessibilityScans`, and `assertNoBlockingViolations` from `scripts/a11y-scan.mjs`.
2. Scan the initial rendered state and every major state after its interaction assertions. Exclude only qa-demo's injected `#__sdlc_caption`; do not exclude product UI to make a scan pass.
3. Write the merged result to `a11y-summary.json`. Deduplicate violations by rule while preserving story/state IDs and affected nodes.
4. Treat `critical` or `serious` violations as blocking. Report `moderate` and `minor` violations without hiding them.
5. If axe-core cannot run, the overall visual QA verdict cannot be PASS: use PARTIAL when interactions passed, or BLOCKED when no meaningful proof completed.

```js
const axeSource = loadFrom(scratchRoot, 'axe-core').source
const scans = []
scans.push(await scanAccessibility(page, {
  axeSource,
  label: 'after save',
  storyId: storyId,
  exclude: ['#__sdlc_caption'],
}))
const a11y = mergeAccessibilityScans(scans)
writeFileSync(join(outputDir, 'a11y-summary.json'), JSON.stringify(a11y, null, 2))
assertNoBlockingViolations(a11y)
```

Result rules:

- **PASS:** every planned critical assertion passed, axe-core ran on all major states with no critical/serious violations, the video finalized, and the named artifact paths exist from this run.
- **PARTIAL:** at least one meaningful claim passed, but a later assertion, recording finalization, auth boundary, coverage item, or accessibility scan did not complete.
- **FAIL:** the target surface booted but no core acceptance claim held, or the exercised behavior contradicted the requirement.
- **NOT_APPLICABLE:** the inspected change has no truthful browser-visible behavior. No video is required.
- **BLOCKED** is not a feature verdict: use it only when tooling, credentials, dependencies, or startup prevented testing.

If recording fails mid-way, keep partial output under `testreel-output/`, report which step failed and what was already proven, and never promote an older artifact to current proof. Record the tested revision and fresh artifact timestamps in the report.

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
- **Result:** PASS | PARTIAL | FAIL | NOT_APPLICABLE | BLOCKED
- **Artifacts:** `testreel-output/….mp4`, screenshots, `a11y-summary.json`
- **Accessibility:** states scanned, violation rules, blocking count
- **Revision:** tested commit/source revision
- **Residual risks:** …
```

## Caption helper

Path: [scripts/caption-overlay.mjs](scripts/caption-overlay.mjs)

| Export | Purpose |
|--------|---------|
| `showCaption(page, text, options?)` | Create/update `#__sdlc_caption` |
| `updateCaption(page, text)` | Change text only |
| `hideCaption(page)` | Remove the banner |

Accessibility helper: [scripts/a11y-scan.mjs](scripts/a11y-scan.mjs) — scans one state, merges/deduplicates results, and blocks critical/serious violations.

Copy or import this file into the target project’s scratch runner as needed. Do not reinvent the overlay styles.

## References

- [references/testreel.md](references/testreel.md) — CLI, definition shape, polish options
- [references/boot-detection.md](references/boot-detection.md) — Storybook / Playwright / Cypress / Vite / Next heuristics
- [scripts/smoke-testreel.mjs](scripts/smoke-testreel.mjs) — self-contained narrated + axe-core smoke against TodoMVC / example.com
- [scripts/a11y-scan.mjs](scripts/a11y-scan.mjs) — reusable axe-core scan/merge/blocking helpers

## Quality bar

- Captions on **every** major beat (title + interactions + result)
- Viewer can understand the video **without audio**
- Prefer the real feature UI over unrelated pages
- Axe-core scans on initial + every major asserted state; no PASS when a11y is `notRun`
- No fake pass: if you could not boot or assert, say so clearly
- Clean up background servers you started when done (best effort)
