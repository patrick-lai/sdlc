#!/usr/bin/env node
/**
 * Self-contained smoke: prove TestReel + caption overlays work.
 *
 * Records a short narrated demo against Playwright's public TodoMVC demo
 * (falls back to example.com if TodoMVC is unreachable).
 *
 * Run from repo root:
 *   npm run smoke:testreel
 *
 * Or from this directory (after installing deps into a scratch folder):
 *   node scripts/smoke-testreel.mjs
 *
 * Env:
 *   SDLC_SMOKE_URL   Override target URL
 *   SDLC_SMOKE_OUT   Output directory (default: ./testreel-output/smoke)
 */

import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const requireHere = createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_URL = 'https://demo.playwright.dev/todomvc'
const FALLBACK_URL = 'https://example.com'
const OUT_DIR = resolve(process.env.SDLC_SMOKE_OUT || join(process.cwd(), 'testreel-output', 'smoke'))

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  return r.status === 0
}

function tryResolveFrom(root, id) {
  try {
    createRequire(join(root, 'package.json')).resolve(id)
    return true
  } catch {
    return false
  }
}

/** Prefer full `playwright`; fall back to `playwright-core` when that is all that is installed. */
function resolvePlaywrightId(root) {
  if (tryResolveFrom(root, 'playwright')) return 'playwright'
  if (tryResolveFrom(root, 'playwright-core')) return 'playwright-core'
  return null
}

function ensureDeps() {
  for (const root of [process.cwd(), __dirname]) {
    if (!tryResolveFrom(root, 'testreel')) continue
    const playwrightId = resolvePlaywrightId(root)
    if (playwrightId) return { root, cleanup: false, playwrightId }
  }

  // Also accept deps resolvable from this script's install location
  try {
    requireHere.resolve('testreel')
    try {
      requireHere.resolve('playwright')
      return { root: __dirname, cleanup: false, playwrightId: 'playwright' }
    } catch {
      requireHere.resolve('playwright-core')
      return { root: __dirname, cleanup: false, playwrightId: 'playwright-core' }
    }
  } catch {
    // install scratch copy below
  }

  // Install into a scratch directory so the skill repo stays clean
  const scratch = mkdtempSync(join(tmpdir(), 'sdlc-testreel-smoke-'))
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'sdlc-testreel-smoke', private: true, type: 'module' }, null, 2),
  )
  console.log(`[smoke] Installing testreel + playwright into ${scratch}`)
  const install = spawnSync('npm', ['install', 'testreel', 'playwright', '--no-fund', '--no-audit'], {
    cwd: scratch,
    stdio: 'inherit',
    env: process.env,
  })
  if (install.status !== 0) {
    throw new Error('npm install testreel playwright failed')
  }
  const pw = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    cwd: scratch,
    stdio: 'inherit',
    env: process.env,
  })
  if (pw.status !== 0) {
    throw new Error('npx playwright install chromium failed')
  }
  return { root: scratch, cleanup: true, playwrightId: 'playwright' }
}

function loadFrom(root, id) {
  return createRequire(join(root, 'package.json'))(id)
}

async function urlReachable(url) {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  const captionPath = join(__dirname, 'caption-overlay.mjs')
  if (!existsSync(captionPath)) {
    throw new Error(`Missing caption helper at ${captionPath}`)
  }

  const { root, cleanup, playwrightId } = ensureDeps()
  let browser
  let recorder

  try {
    const { chromium } = loadFrom(root, playwrightId)
    const { recordPage, hideCursor, showCursor } = loadFrom(root, 'testreel')
    const captions = await import(pathToFileURL(captionPath).href)
    const { showCaption, updateCaption, hideCaption } = captions

    let url = process.env.SDLC_SMOKE_URL || DEFAULT_URL
    const useTodoMvc = !process.env.SDLC_SMOKE_URL && (await urlReachable(DEFAULT_URL))
    if (!process.env.SDLC_SMOKE_URL && !useTodoMvc) {
      console.warn(`[smoke] ${DEFAULT_URL} unreachable; falling back to ${FALLBACK_URL}`)
      url = FALLBACK_URL
    }

    const format = hasFfmpeg() ? 'mp4' : 'webm'
    console.log(`[smoke] Recording narrated demo → ${url}`)
    console.log(`[smoke] Output: ${OUT_DIR} (${format})`)

    // Clean before Playwright starts writing its context video. Letting
    // TestReel clean after newContext() can unlink the in-flight .webm.
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })
    browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: OUT_DIR,
        size: { width: 1280, height: 720 },
      },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })

    recorder = await recordPage(page, {
      outputDir: OUT_DIR,
      chrome: { url: true },
      cursor: { style: 'pointer', size: 48 },
      background: {
        gradient: { from: '#0052CC', to: '#0747A6' },
        padding: 48,
        borderRadius: 12,
      },
      outputFormat: format,
      clean: false,
    })

    await showCaption(page, {
      kicker: 'QA demo smoke',
      claim: 'TestReel + caption overlays are wired',
      detail: 'Toolchain check — not a product proof',
    })
    await hideCursor(page)
    await page.waitForTimeout(2000)
    await showCursor(page)

    if (useTodoMvc || url.includes('todomvc')) {
      await updateCaption(page, {
        kicker: '01 · add',
        claim: 'New todo is typed into the list',
        detail: 'Item text must appear after Enter',
      })
      await recorder.type('.new-todo', 'Ship qa-demo skill', { delay: 40 })
      await recorder.keyboard('Enter')
      await page.waitForTimeout(600)

      await updateCaption(page, {
        kicker: '02 · complete',
        claim: 'The todo flips to completed',
        detail: 'li.completed must be visible after the toggle',
      })
      await recorder.click('.todo-list li:first-child .toggle', { zoom: 2 })
      await page.waitForTimeout(500)

      await showCaption(page, {
        kicker: '03 · proof',
        claim: 'Completed state is on screen',
        detail: 'Zoom the list row — this is the assert the smoke requires',
      })
      await hideCursor(page)
      await recorder.zoom({ selector: '.todo-list', scale: 1.8, duration: 700 })
      await page.waitForTimeout(1800)
      await recorder.zoom({ scale: 1, duration: 500 })
      await showCursor(page)

      const completed = page.locator('.todo-list li.completed')
      await completed.waitFor({ state: 'visible', timeout: 5000 })
    } else {
      await updateCaption(page, {
        kicker: 'Fallback',
        claim: 'Example Domain heading is visible',
        detail: 'TodoMVC was unreachable — this only proves navigation',
      })
      await hideCursor(page)
      await page.waitForTimeout(1600)
      await showCursor(page)
      await page.getByRole('heading', { name: /example domain/i }).waitFor({ state: 'visible' })
      await recorder.screenshot('example-heading')
    }

    await showCaption(page, {
      kicker: 'Result',
      claim: 'Caption overlay + TestReel record/stop succeeded',
      detail: 'Use the Task Board runner for a product-level proof reel',
    })
    await hideCursor(page)
    await page.waitForTimeout(1800)
    await hideCaption(page)

    const result = await recorder.stop()
    console.log('[smoke] PASS')
    console.log(`[smoke] Video: ${result.video}`)
    if (result.screenshots?.length) {
      console.log(`[smoke] Screenshots: ${result.screenshots.join(', ')}`)
    }
  } catch (err) {
    console.error('[smoke] FAIL — keeping partial output if any')
    try {
      await recorder?.stop()
    } catch {
      // ignore double-stop / finalize errors
    }
    throw err
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (cleanup) {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
