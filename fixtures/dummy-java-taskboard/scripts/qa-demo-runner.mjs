#!/usr/bin/env node
/**
 * qa-demo narrated runner for the dummy Java Task Board fixture.
 * Imports caption helper from the qa-demo skill.
 */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
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

function ensureDeps() {
  const candidates = [FIXTURE_ROOT, process.cwd(), SKILL_ROOT]
  for (const root of candidates) {
    if (
      tryResolveFrom(root, 'testreel') &&
      (tryResolveFrom(root, 'playwright') || tryResolveFrom(root, 'playwright-core'))
    ) {
      return { root, cleanup: false }
    }
  }
  try {
    requireHere.resolve('testreel')
    requireHere.resolve('playwright')
    return { root: __dirname, cleanup: false }
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
  return { root: scratch, cleanup: true }
}

function loadFrom(root, id) {
  return createRequire(join(root, 'package.json'))(id)
}

async function main() {
  const captionPath = join(SKILL_ROOT, 'scripts/caption-overlay.mjs')
  if (!existsSync(captionPath)) {
    throw new Error(`Missing caption helper at ${captionPath}`)
  }

  const { root, cleanup } = ensureDeps()
  const { chromium } = loadFrom(root, 'playwright')
  const { recordPage, hideCursor, showCursor } = loadFrom(root, 'testreel')
  const { showCaption, updateCaption, hideCaption } = await import(pathToFileURL(captionPath).href)

  const format = hasFfmpeg() ? 'mp4' : 'webm'
  console.log(`[qa-demo] Target: ${BASE_URL}`)
  console.log(`[qa-demo] Output: ${OUT_DIR} (${format})`)

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  })
  const page = await context.newPage()
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  const recorder = await recordPage(page, {
    outputDir: OUT_DIR,
    chrome: { url: true },
    cursor: { style: 'pointer', size: 48 },
    background: {
      gradient: { from: '#0052CC', to: '#0747A6' },
      padding: 48,
      borderRadius: 12,
    },
    outputFormat: format,
    clean: true,
  })

  try {
    // Title beat
    await showCaption(page, 'QA: Java Task Board dummy fixture')
    await hideCursor(page)
    await page.waitForTimeout(1800)
    await showCursor(page)

    await page.getByTestId('task-board-app').waitFor({ state: 'visible' })

    // Happy path: set priority + add task
    await updateCaption(page, 'Setting priority to High')
    await recorder.click('[data-testid="task-priority"]')
    await page.selectOption('[data-testid="task-priority"]', 'HIGH')
    await page.waitForTimeout(400)

    await updateCaption(page, 'Adding a high-priority task')
    await recorder.type('[data-testid="task-title"]', 'Prove qa-demo on Java fixture', {
      delay: 25,
    })
    await recorder.click('[data-testid="add-task"]', { zoom: 1.6 })
    await page.waitForTimeout(600)

    const taskTitle = page.getByTestId('task-title-1')
    await taskTitle.waitFor({ state: 'visible', timeout: 5000 })
    await page.getByTestId('priority-1').waitFor({ state: 'visible' })

    // Complete
    await updateCaption(page, 'Marking the task complete')
    await recorder.click('[data-testid="toggle-1"]', { zoom: 2 })
    await page.waitForTimeout(500)
    await page.locator('.task.completed').waitFor({ state: 'visible', timeout: 5000 })

    // Proof: completed filter
    await updateCaption(page, 'Filtering to Completed')
    await recorder.click('[data-testid="filter-completed"]')
    await page.waitForTimeout(500)
    await taskTitle.waitFor({ state: 'visible' })

    // Edge: active empty state
    await showCaption(page, 'Proof: Active filter is empty')
    await recorder.click('[data-testid="filter-active"]')
    await page.waitForTimeout(400)
    await hideCursor(page)
    await page.getByTestId('empty-state').waitFor({ state: 'visible' })
    await page.getByText('No active tasks.').waitFor({ state: 'visible' })
    await recorder.zoom({ selector: '[data-testid="empty-state"]', scale: 1.8, duration: 700 })
    await page.waitForTimeout(1400)
    await recorder.zoom({ scale: 1, duration: 400 })
    await showCursor(page)

    // Validation error proof
    await updateCaption(page, 'Proof: empty title is rejected')
    await recorder.click('[data-testid="filter-all"]')
    await page.waitForTimeout(300)
    await recorder.click('[data-testid="add-task"]')
    await page.getByTestId('form-error').waitFor({ state: 'visible' })
    await page.waitForTimeout(800)

    await showCaption(page, 'Result: Task Board happy path + proofs work')
    await hideCursor(page)
    await page.waitForTimeout(1800)
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
      await recorder.stop()
    } catch {
      // ignore
    }
    throw err
  } finally {
    await browser.close().catch(() => {})
    if (cleanup) rmSync(root, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
