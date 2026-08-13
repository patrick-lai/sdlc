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

for (const name of ['pr-warden', 'qa-demo', 'fe-pr-review']) assertMirror(name)

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

const feReview = fs.readFileSync(path.join(root, 'skills/fe-pr-review/SKILL.md'), 'utf8')
for (const marker of [
  'qa-demo',
  'H0',
  'UNVERIFIED',
  'Agent agreement is not proof',
  'review-graph.mjs',
  '--dry-run',
  '--qa-report',
  'audit.json',
  'read-only',
  'full feature-gate path',
  'report.html',
  'Statlas',
  'every facet',
  'historical regression probes',
  'fail-fast',
  'pre-fix',
]) {
  assert.ok(feReview.includes(marker), `fe-pr-review missing public contract: ${marker}`)
}

const feContracts = fs.readFileSync(path.join(root, 'skills/fe-pr-review/references/contracts.md'), 'utf8')
for (const marker of ['not-run', 'stale', 'candidates.json', 'Runner safety', 'Filesystem safety', 'gateRequirement', 'report.json', 'Historical regression evidence', 'pre-fix behavior']) {
  assert.ok(feContracts.includes(marker), `fe-pr-review contracts missing: ${marker}`)
}

const fePersonas = fs.readFileSync(path.join(root, 'skills/fe-pr-review/references/personas.md'), 'utf8')
const personaIds = ['repository-contract', 'correctness-platform', 'accessibility-ui', 'rollout-gates', 'privacy-security-data', 'product-tests']
for (const id of personaIds) assert.ok(fePersonas.includes(id), `personas reference missing ${id}`)
for (const marker of ['Historical regression probes', 'CI-surface parity', 'runtime/service-descriptor substitution', 'dynamic-key boundaries', 'temporal history/cache', 'side-effect liveness', 'test-oracle validity']) {
  assert.ok(fePersonas.includes(marker), `personas reference missing historical probe marker: ${marker}`)
}

const feGraph = fs.readFileSync(path.join(root, 'skills/fe-pr-review/scripts/review-graph.mjs'), 'utf8')
for (const id of personaIds) assert.ok(feGraph.includes(`'${id}'`), `review-graph missing persona ${id}`)
for (const facet of ['fg-requirement', 'fg-off-path', 'fg-on-path-states', 'fg-persistence-rollback', 'fg-tests', 'fg-cleanup']) assert.ok(feGraph.includes(`'${facet}'`), `review-graph missing gate facet ${facet}`)
for (const facet of ['ci-surface-parity', 'runtime-config-substitution', 'dependency-resolution-risk', 'dynamic-key-boundaries', 'schema-selection-compatibility', 'temporal-history-cache', 'side-effect-liveness', 'test-oracle-validity']) assert.ok(feGraph.includes(`'${facet}'`), `review-graph missing historical probe ${facet}`)
assert.ok(!/^import .* from '(?!node:|\.)/m.test(feGraph), 'review-graph must stay dependency-free')
for (const forbidden of [/--dangerously/, /--yolo/, /bypassPermissions/, /https?:\/\/(?!github\.com|example)/]) {
  assert.ok(!forbidden.test(feGraph), `review-graph must not contain ${forbidden}`)
}

// Every declared package script must point at a file that exists.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const [name, script] of Object.entries(pkg.scripts)) {
  const target = script.match(/(?:^|\s)((?:skills|scripts)\/[^\s]+\.mjs)/)?.[1]
  if (target) assert.ok(fs.existsSync(path.join(root, target)), `script ${name} points at missing ${target}`)
}
for (const required of ['test:skills', 'test:pr-warden', 'test:fe-pr-review', 'smoke:install']) {
  assert.ok(pkg.scripts[required], `package.json missing script ${required}`)
}
assert.ok(pkg.files.includes('skills') && pkg.files.includes('plugins'), 'package files must ship skills and plugins')
assert.equal(Object.keys(pkg.dependencies || {}).length, 0, 'skills must stay dependency-free')
assert.equal(Object.keys(pkg.devDependencies || {}).length, 0, 'skills must stay dependency-free')

// Marketplace entries must resolve to a real plugin with a matching manifest.
const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'))
const marketplaceNames = marketplace.plugins.map((entry) => entry.name)
for (const name of ['qa-demo', 'pr-warden', 'fe-pr-review']) {
  assert.ok(marketplaceNames.includes(name), `marketplace missing plugin ${name}`)
  const entry = marketplace.plugins.find((plugin) => plugin.name === name)
  assert.equal(entry.source, `./plugins/${name}`)
  assert.deepEqual(entry.skills, [`./skills/${name}`])
  const manifestPath = path.join(root, 'plugins', name, '.claude-plugin/plugin.json')
  assert.ok(fs.existsSync(manifestPath), `missing plugin manifest for ${name}`)
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, entry.version, `${name} plugin/marketplace version drift`)
  assert.ok(fs.existsSync(path.join(root, 'plugins', name, 'skills', name, 'SKILL.md')))
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
for (const marker of ['fe-pr-review', 'npm run test:fe-pr-review', 'plugins/fe-pr-review']) {
  assert.ok(readme.includes(marker), `README missing fe-pr-review reference: ${marker}`)
}

console.log('PASS: public skill contracts, mirrors, packaging, and internal-leak guard')
