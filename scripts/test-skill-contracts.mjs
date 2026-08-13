#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeAccessibilityScans, assertNoBlockingViolations } from '../skills/qa-demo/scripts/a11y-scan.mjs'
import { resolveSmokeMode } from '../skills/qa-demo/scripts/smoke-target.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function filesUnder(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(file))
    else out.push(file)
  }
  return out.sort()
}

function assertMirror(name) {
  const canonical = path.join(root, 'skills', name)
  const plugin = path.join(root, 'plugins', name, 'skills', name)
  const relative = (base) => filesUnder(base).map((file) => path.relative(base, file))
  assert.deepEqual(relative(plugin), relative(canonical), `${name} plugin file list drifted`)
  for (const file of relative(canonical)) {
    assert.deepEqual(
      fs.readFileSync(path.join(plugin, file)),
      fs.readFileSync(path.join(canonical, file)),
      `${name} plugin copy drifted at ${file}`,
    )
  }
}

for (const name of ['pr-warden', 'qa-demo']) assertMirror(name)

const publicRoots = ['README.md', '.claude-plugin', 'skills', 'plugins', 'fixtures']
const textExtensions = new Set(['.md', '.json', '.mjs', '.js', '.html', '.txt', '.yaml', '.yml'])
const publicFiles = publicRoots
  .flatMap((entry) => {
    const file = path.join(root, entry)
    return fs.statSync(file).isDirectory() ? filesUnder(file) : [file]
  })
  .filter((file) => textExtensions.has(path.extname(file)))
const banned = [
  /\btwg\b/i,
  /\bRaphael\b/i,
  /\bLumine\b/i,
  /\/Users\//,
  /atlassian-frontend-monorepo/i,
  /\.atlassian\.net/i,
]
for (const file of publicFiles) {
  const body = fs.readFileSync(file, 'utf8')
  for (const pattern of banned) {
    assert.ok(!pattern.test(body), `public/internal leak ${pattern} in ${path.relative(root, file)}`)
  }
}

const qa = fs.readFileSync(path.join(root, 'skills/qa-demo/SKILL.md'), 'utf8')
for (const marker of [
  'NOT_APPLICABLE',
  'BLOCKED',
  'storageState',
  'temporary scratch directory',
  'provider CLI/API',
  'tested commit/source revision',
  'axe-core',
  'scanAccessibility',
  'a11y-summary.json',
  'SDLC_SMOKE_MODE',
]) {
  assert.ok(qa.includes(marker), `qa-demo missing pressure-test contract: ${marker}`)
}

assert.equal(resolveSmokeMode('https://demo.playwright.dev/todomvc/'), 'todomvc')
assert.equal(resolveSmokeMode('https://example.com/'), 'example')
assert.equal(resolveSmokeMode('http://127.0.0.1:4173/preview'), 'generic')
assert.equal(resolveSmokeMode('http://127.0.0.1:4173/', 'todo'), 'todomvc')
assert.throws(() => resolveSmokeMode('https://example.com/', 'unknown'), /Unsupported SDLC_SMOKE_MODE/)

const a11ySummary = mergeAccessibilityScans([
  {
    violations: [
      {
        id: 'button-name',
        impact: 'critical',
        storyIds: ['story--one'],
        nodes: [{ target: ['button'] }],
      },
    ],
  },
  {
    violations: [
      {
        id: 'button-name',
        impact: 'critical',
        storyIds: ['story--two'],
        nodes: [{ target: ['button.secondary'] }],
      },
    ],
  },
])
assert.equal(a11ySummary.scans, 2)
assert.equal(a11ySummary.violations.length, 1)
assert.deepEqual(a11ySummary.violations[0].storyIds, ['story--one', 'story--two'])
assert.throws(() => assertNoBlockingViolations(a11ySummary), /button-name/)

const warden = fs.readFileSync(path.join(root, 'skills/pr-warden/SKILL.md'), 'utf8')
for (const marker of ['Never merge', '--html', 'GitHub', 'Bitbucket', '3 automatic repair attempts']) {
  assert.ok(warden.includes(marker), `pr-warden missing public contract: ${marker}`)
}

console.log('PASS: public skill contracts, mirrors, and internal-leak guard')
