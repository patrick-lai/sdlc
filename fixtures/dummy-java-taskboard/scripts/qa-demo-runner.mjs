#!/usr/bin/env node
/**
 * qa-demo narrated runner for the dummy Java Task Board fixture.
 * Imports caption helper from the qa-demo skill.
 */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const requireHere = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = resolve(__dirname, '..')
const SKILL_ROOT = resolve(FIXTURE_ROOT, '../../skills/qa-demo')
const BASE_URL = process.env.SDLC_QA_URL || 'http://localhost:8877'
const OUT_DIR = resolve(process.env.SDLC_QA_OUT || join(FIXTURE_ROOT, 'testreel-output', 'demo'))

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0
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
  const candidates = [FIXTURE_ROOT, process.cwd(), SKILL_ROOT]
  for (const root of candidates) {
    if (!tryResolveFrom(root, 'testreel')) continue
    const playwrightId = resolvePlaywrightId(root)
    if (playwrightId) return { root, cleanup: false, playwrightId }
  }
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
    // install scratch
  }

  const scratch = mkdtempSync(join(tmpdir(), 'sdlc-qa-demo-dummy-'))
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'sdlc-qa-demo-dummy', private: true, type: 'module' }, null, 2),
  )
  console.log(`[qa-demo] Installing testreel + playwright into ${scratch}`)
  const install = spawnSync('npm', ['install', 'testreel', 'playwright', '--no-fund', '--no-audit'], {
    cwd: scratch,
    stdio: 'inherit',
    env: process.env,
  })
  if (install.status !== 0) throw new Error('npm install testreel playwright failed')
  const pw = spawnSync('npx', ['playwright', 'install', 'chromium'], {
    cwd: scratch,
    stdio: 'inherit',
    env: process.env,
  })
  if (pw.status !== 0) throw new Error('npx playwright install chromium failed')
  return { root: scratch, cleanup: true, playwrightId: 'playwright' }
}

function loadFrom(root, id) {
  return createRequire(join(root, 'package.json'))(id)
}

async function main() {
  const captionPath = join(SKILL_ROOT, 'scripts/caption-overlay.mjs')
  if (!existsSync(captionPath)) {
    throw new Error(`Missing caption helper at ${captionPath}`)
  }

  const { root, cleanup, playwrightId } = ensureDeps()
  let browser
  let recorder

  try {
    const { chromium } = loadFrom(root, playwrightId)
    const { recordPage, hideCursor, showCursor } = loadFrom(root, 'testreel')
    const { showCaption, hideCaption } = await import(pathToFileURL(captionPath).href)

    const format = hasFfmpeg() ? 'mp4' : 'webm'
    console.log(`[qa-demo] Target: ${BASE_URL}`)
    console.log(`[qa-demo] Output: ${OUT_DIR} (${format})`)

    // Clean before Playwright starts writing its context video. Letting
    // TestReel clean after newContext() can unlink the in-flight .webm.
    rmSync(OUT_DIR, { recursive: true, force: true })
    mkdirSync(OUT_DIR, { recursive: true })
    browser = await chromium.launch()
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
    })
    const page = await context.newPage()
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

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

    const newTitle = 'Prove qa-demo on Java fixture'

    await showCaption(page, {
      kicker: 'QA · TaskBoardService',
      claim: 'Prove add, complete, list filters, and blank-title reject',
      detail: 'Static UI mirrors com.example.taskboard — no invented backend',
    })
    await hideCursor(page)
    await page.waitForTimeout(2400)
    await showCursor(page)

    await page.getByTestId('task-board-app').waitFor({ state: 'visible' })
    await page.getByTestId('status').getByText('0 tasks').waitFor({ state: 'visible' })

    await showCaption(page, {
      kicker: '01 · addTask',
      claim: 'High-priority issue lands on the board',
      detail: 'Priority HIGH + title must persist on the new row',
    })
    await recorder.click('[data-testid="task-priority"]')
    await page.selectOption('[data-testid="task-priority"]', 'HIGH')
    await recorder.type('[data-testid="task-title"]', newTitle, { delay: 22 })
    await recorder.click('[data-testid="add-task"]')
    await page.waitForTimeout(400)

    const taskTitle = page.getByTestId('task-title-1')
    await taskTitle.waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('priority-1').getByText('HIGH').waitFor({ state: 'visible' })
    await page.getByTestId('status').getByText('1 tasks · 1 active · 0 completed').waitFor({
      state: 'visible',
    })
    await hideCursor(page)
    await recorder.zoom({ selector: '[data-testid="task-1"]', scale: 1.7, duration: 600 })
    await recorder.screenshot('added-high-priority')
    await page.waitForTimeout(2200)
    await recorder.zoom({ scale: 1, duration: 400 })
    await showCursor(page)

    await showCaption(page, {
      kicker: '02 · complete',
      claim: 'The row flips to Done and stays checked',
      detail: 'Task.markComplete — status line should read 0 active · 1 completed',
    })
    await recorder.click('[data-testid="toggle-1"]', { zoom: 2 })
    await page.locator('.task.completed').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('status').getByText('1 tasks · 0 active · 1 completed').waitFor({
      state: 'visible',
    })
    await hideCursor(page)
    await page.waitForTimeout(2000)
    await showCursor(page)

    await showCaption(page, {
      kicker: '03 · list(COMPLETED)',
      claim: 'Completed filter still shows the same issue',
      detail: 'list(COMPLETED) is not an empty list after markComplete',
    })
    await recorder.click('[data-testid="filter-completed"]')
    await taskTitle.waitFor({ state: 'visible' })
    await page.getByTestId('priority-1').waitFor({ state: 'visible' })
    await recorder.screenshot('completed-filter')
    await hideCursor(page)
    await page.waitForTimeout(2000)
    await showCursor(page)

    await showCaption(page, {
      kicker: '04 · list(ACTIVE)',
      claim: 'Active filter is empty — copy names the contract',
      detail: 'Empty state is not a blank list. list(ACTIVE) has no open tasks.',
    })
    await recorder.click('[data-testid="filter-active"]')
    await page.getByTestId('empty-state').waitFor({ state: 'visible' })
    await page.getByText(/No active tasks/).waitFor({ state: 'visible' })
    await hideCursor(page)
    await recorder.zoom({ selector: '[data-testid="empty-state"]', scale: 1.7, duration: 600 })
    await recorder.screenshot('active-empty')
    await page.waitForTimeout(2200)
    await recorder.zoom({ scale: 1, duration: 400 })
    await showCursor(page)

    await showCaption(page, {
      kicker: '05 · validation',
      claim: 'Blank title is rejected — the completed row is untouched',
      detail: 'addTask throws; error stays visible; list count stays at 1',
    })
    await recorder.click('[data-testid="filter-all"]')
    await page.waitForTimeout(250)
    await recorder.click('[data-testid="add-task"]')
    await page.getByTestId('form-error').waitFor({ state: 'visible' })
    await page.getByText(/No row was added/).waitFor({ state: 'visible' })
    await page.getByTestId('status').getByText('1 tasks · 0 active · 1 completed').waitFor({
      state: 'visible',
    })
    await recorder.screenshot('blank-title-rejected')
    await hideCursor(page)
    await page.waitForTimeout(2200)
    await showCursor(page)

    await showCaption(page, {
      kicker: 'Result',
      claim: 'addTask, markComplete, both filters, and blank-title reject held',
      detail: 'Counts, HIGH badge, completed row, empty-state copy, and error all asserted',
    })
    await hideCursor(page)
    await page.waitForTimeout(2400)
    await hideCaption(page)

    const result = await recorder.stop()
    console.log('[qa-demo] PASS')
    console.log(`[qa-demo] Video: ${result.video}`)
    if (result.screenshots?.length) {
      console.log(`[qa-demo] Screenshots: ${result.screenshots.join(', ')}`)
    }
  } catch (err) {
    console.error('[qa-demo] FAIL — keeping partial output if any')
    try {
      await recorder?.stop()
    } catch {
      // ignore
    }
    throw err
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (cleanup) rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
