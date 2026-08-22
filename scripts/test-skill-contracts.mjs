#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
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

for (const name of ['pr-warden', 'qa-demo', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion']) assertMirror(name)

const reviewLearningVariants = ['review-learn-from-me', 'review-learn-from-all']
const reviewLearningContractPath = path.join(root, 'templates/review-learn-contract.md')
const reviewLearningContract = fs.readFileSync(reviewLearningContractPath)
for (const name of reviewLearningVariants) {
  const canonical = path.join(root, 'skills', name)
  const plugin = path.join(root, 'plugins/review-learn/skills', name)
  const relative = (base) => filesUnder(base).map((file) => path.relative(base, file))
  assert.deepEqual(relative(plugin), relative(canonical), `${name} plugin file list drifted`)
  for (const file of relative(canonical)) {
    assert.deepEqual(
      fs.readFileSync(path.join(plugin, file)),
      fs.readFileSync(path.join(canonical, file)),
      `${name} plugin copy drifted at ${file}`,
    )
  }
  assert.deepEqual(
    fs.readFileSync(path.join(canonical, 'references/contract.md')),
    reviewLearningContract,
    `${name} shared contract drifted; run npm run sync:plugins`,
  )
}

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
  'Unbounded recursive delegation is forbidden',
  'at most four eligible PRs',
  'one top-level worker per PR concurrently',
  'absolute 30-minute deadline',
  'never more than six',
  'material overlap',
  'two focused probe children',
  'depth 2',
  'No depth 3',
  '--max-attempts 2',
  '--node-timeout-seconds 480',
  '--synthesis-timeout-seconds 240',
  '--run-timeout-seconds 1500',
  'Do not retry every provider',
  'Stop work that cannot fit the remaining time',
  'ACCEPT',
  'REJECT: defect',
  'REJECT: incomplete',
  'publication idempotency key',
  'publish-statlas.mjs',
  'Verify the returned Statlas URL is reachable',
  'Scheduled batch mode explicitly authorizes Statlas report publication only',
  'qa-demo',
  'opt-in',
  'explicitly requests',
  'H0',
  'UNVERIFIED',
  'Agent agreement is not proof',
  'review-graph.mjs',
  'audit.json',
  'read-only',
  'feature-gate path',
  'report.html',
  'Statlas',
  'every assigned facet',
  'Historical regression probes',
  'fail-fast',
  'pre-fix',
]) {
  assert.ok(feReview.includes(marker), `fe-pr-review missing public contract: ${marker}`)
}

const feContracts = fs.readFileSync(path.join(root, 'skills/fe-pr-review/references/contracts.md'), 'utf8')
for (const marker of [
  'at most four eligible PRs',
  'one top-level worker per PR concurrently',
  'absolute 30-minute deadline',
  '3-6 persona reviewers',
  'at most two focused probe children at depth 2',
  'Depth 3',
  '--max-workers 4',
  '--max-attempts 2',
  '--node-timeout-seconds 480',
  '--synthesis-timeout-seconds 240',
  '--run-timeout-seconds 1500',
  'Do not retry every provider',
  'ACCEPT',
  'REJECT: defect',
  'REJECT: incomplete',
  'idempotency key',
  'publish-statlas.mjs',
  'Verify the returned URL is reachable',
  'Automatic PR comments',
  'not-run',
  'opt-in',
  'gateRequirement',
  'report.json',
  'Runner safety',
  'Filesystem safety',
  'Historical regression evidence',
  'pre-fix behavior',
]) {
  assert.ok(feContracts.includes(marker), `fe-pr-review contracts missing: ${marker}`)
}
for (const marker of ['reproduction', 'rootCause', 'suggestedPatch']) {
  assert.ok(feContracts.includes(marker), `fe-pr-review contracts missing publishable finding field: ${marker}`)
}

const fePersonas = fs.readFileSync(path.join(root, 'skills/fe-pr-review/references/personas.md'), 'utf8')
const personaIds = ['repository-contract', 'correctness-platform', 'accessibility-ui', 'rollout-gates', 'privacy-security-data', 'product-tests']
for (const id of personaIds) assert.ok(fePersonas.includes(id), `personas reference missing ${id}`)
for (const marker of [
  '3-6 personas per PR',
  'no more than six',
  'Launch the first four selected persona reviewers concurrently',
  'material overlap',
  'two focused probe children at depth 2',
  'no depth 3',
  'disables probe children',
  'Historical regression probes',
  'CI-surface parity',
  'runtime or service-descriptor substitution',
  'dynamic-key boundaries',
  'temporal history or cache behavior',
  'side-effect liveness',
  'test-oracle validity',
]) {
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


const beReview = fs.readFileSync(path.join(root, 'skills/be-pr-review/SKILL.md'), 'utf8')
for (const marker of [
  'H0',
  'UNVERIFIED',
  'Agent agreement is not proof',
  'review-graph.mjs',
  '--dry-run',
  '--verification-report',
  'audit.json',
  'read-only',
  'historical regression probes',
  'Self-grill',
  'mixed-version',
  'partial writes',
  'migration',
  'rollback',
  'pre-fix',
]) assert.ok(beReview.includes(marker), `be-pr-review missing public contract: ${marker}`)

const beEvaluation = fs.readFileSync(path.join(root, 'skills/be-pr-review/references/evaluation.md'), 'utf8')
for (const marker of ['train/validation/holdout', 'recurring in at least three independent PRs', 'Negative controls', 'read-check-write races', 'derived-value consistency']) assert.ok(beEvaluation.includes(marker), `be-pr-review evaluation missing ${marker}`)
const beContracts = fs.readFileSync(path.join(root, 'skills/be-pr-review/references/contracts.md'), 'utf8')
for (const marker of ['read-check-write atomicity', 'fail-soft fallbacks', 'derived-value consistency', 'explicit verification obligations']) assert.ok(beContracts.includes(marker), `be-pr-review contracts missing ${marker}`)
for (const marker of ['reproduction', 'rootCause', 'suggestedPatch']) {
  assert.ok(beContracts.includes(marker), `be-pr-review contracts missing publishable finding field: ${marker}`)
}

const bePersonas = fs.readFileSync(path.join(root, 'skills/be-pr-review/references/personas.md'), 'utf8')
const bePersonaIds = ['repository-contract', 'api-compatibility', 'data-migrations', 'concurrency-reliability', 'security-observability-performance', 'tests-rollout']
for (const id of bePersonaIds) assert.ok(bePersonas.includes(id), `backend personas reference missing ${id}`)
const beGraph = fs.readFileSync(path.join(root, 'skills/be-pr-review/scripts/review-graph.mjs'), 'utf8')
for (const id of bePersonaIds) assert.ok(beGraph.includes(`'${id}'`), `backend review graph missing persona ${id}`)
for (const facet of ['mixed-version-deploy', 'transaction-partial-success', 'retry-idempotency', 'cancellation-deadlines', 'expand-migrate-contract', 'query-algorithm-resource', 'rollout-rollback', 'test-oracle-validity']) assert.ok(beGraph.includes(`'${facet}'`), `backend review graph missing facet ${facet}`)
assert.ok(!/^import .* from '(?!node:|\.)/m.test(beGraph), 'backend review graph must stay dependency-free')

const review = fs.readFileSync(path.join(root, 'skills/review/SKILL.md'), 'utf8')
for (const marker of [
  'name: review',
  'explicit pull request',
  'local or remote branch',
  'fe-pr-review',
  'be-pr-review',
  'H0 = worktree:',
  'staged and unstaged',
  'untracked file',
  'Do not route from extensions',
  'frontend',
  'backend',
  'both',
  'same target, base, complete snapshot, and logical `H0`',
  'self-authored PR',
  'PASSABLE',
  'BLOCKED',
  'UNVERIFIED',
  'Never merge',
  'leyline_memory_recall',
  '.agents/review-learnings.md',
  'review-learning.json',
  'untrusted historical evidence',
  'leyline_memory_mark_useful',
  'opt-in',
  'explicitly requested',
  'Scheduled batch mode',
  'at most four eligible',
  'one top-level worker per PR concurrently',
  'absolute 30-minute deadline',
  'Every admitted completed or timed-out PR gets a truthful Statlas report',
  'REJECT: defect',
  'REJECT: incomplete',
  'idempotency key',
  'Verify the returned URL is reachable',
  'Do not run broad builds or test suites',
  'retry every provider',
  'Automatic PR comments and Slack notifications are outside scheduled review',
]) assert.ok(review.includes(marker), `review missing unified routing contract: ${marker}`)

const blockerComment = fs.readFileSync(path.join(root, 'skills/review/references/blocking-pr-comment.md'), 'utf8')
for (const marker of ['### 🔴 Blocker:', '#### 🧪 How to reproduce', '#### 🔎 Root cause', '#### 🛠 Suggested fix', '#### ✅ Focused verification', 'sdlc-review:blocker', 'fingerprint']) {
  assert.ok(blockerComment.includes(marker), `blocking PR comment format missing ${marker}`)
}

const contractEditFiles = [
  'skills/fe-pr-review/SKILL.md',
  'skills/fe-pr-review/references/contracts.md',
  'skills/fe-pr-review/references/personas.md',
  'skills/review/SKILL.md',
  'scripts/test-skill-contracts.mjs',
]
for (const relative of contractEditFiles) {
  const body = fs.readFileSync(path.join(root, relative), 'utf8')
  assert.ok(!body.includes('\u2014'), `${relative} must not contain an em dash`)
}

for (const [name, body] of [['fe-pr-review', feReview], ['be-pr-review', beReview]]) {
  for (const marker of ['leyline_memory_recall', '.agents/review-learnings.md', 'review-learning.json', 'untrusted historical context', 'leyline_memory_mark_useful']) {
    assert.ok(body.includes(marker), `${name} missing learned-review contract: ${marker}`)
  }
}

const reviewLearnContract = reviewLearningContract.toString('utf8')
for (const marker of [
  'verified **human reviewer**',
  'most recent 15 distinct PRs the authenticated operator reviewed',
  'latest qualifying review event',
  'never rely on endpoint array order',
  'page far enough to prove the global top 15',
  'selection-manifest.json',
  'Do not backfill older PRs',
  'Do not use wording heuristics',
  '### `applied`',
  '### `rejected`',
  '### `undecidable`',
  'provider-recorded final PR source revision',
  'Patch evolution proves timing and code outcome, but never replaces the independent decision signal',
  'Status: active|superseded',
  'leyline_memory_record_review_comment',
  'Never create duplicate active memories merely to count agreement',
  'one repo-scoped memory per **distinct collapsed lesson**, not per source thread',
  'every corroborating reviewer and stable PR/comment ID',
  'intentionally excludes the mutable resolution',
  'leyline_memory_remember',
  'leyline_memory_recall',
  '.agents/review-learnings.md',
  'review-learn:v1',
  'deduplication key',
  'A zero-lesson result is valid',
]) assert.ok(reviewLearnContract.includes(marker), `shared review-learning contract missing: ${marker}`)

const reviewLearnFromMe = fs.readFileSync(path.join(root, 'skills/review-learn-from-me/SKILL.md'), 'utf8')
for (const marker of [
  'name: review-learn-from-me',
  '/review-learn-from-me',
  'currently authenticated user',
  'If no target is supplied',
  "shared contract's `recent-15` selection",
  '15 most recently reviewed PRs',
  'exactly matches that authenticated provider identity',
  'Never fall back to “probably me.”',
  `materialize the complete thread${'\u2014'}including all author, reviewer, and other human replies`,
  'Replies supply decision evidence but never become independently learned source comments',
  'non-matching source comments excluded before candidate-thread expansion',
  'references/contract.md',
]) assert.ok(reviewLearnFromMe.includes(marker), `review-learn-from-me missing identity/scale contract: ${marker}`)

const reviewLearnFromAll = fs.readFileSync(path.join(root, 'skills/review-learn-from-all/SKILL.md'), 'utf8')
for (const marker of [
  'name: review-learn-from-all',
  '/review-learn-from-all',
  'If no target is supplied',
  "shared contract's `recent-15` selection",
  '15 most recently reviewed PRs',
  'all provider-confirmed human reviewers except the PR author',
  '40 candidate threads per batch',
  'Do not write the knowledge backend during analysis batches',
  'Never silently truncate',
  '`INCOMPLETE`',
  'same trigger, scope, invariant, review action, and resolution',
  'do not pick by majority, seniority, or recency alone',
  'references/contract.md',
]) assert.ok(reviewLearnFromAll.includes(marker), `review-learn-from-all missing identity/scale contract: ${marker}`)

// Every declared package script must point at a file that exists.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
for (const [name, script] of Object.entries(pkg.scripts)) {
  const target = script.match(/(?:^|\s)((?:skills|scripts)\/[^\s]+\.mjs)/)?.[1]
  if (target) assert.ok(fs.existsSync(path.join(root, target)), `script ${name} points at missing ${target}`)
}
for (const required of ['test:skills', 'test:pr-warden', 'test:fe-pr-review', 'test:be-pr-review', 'smoke:install']) {
  assert.ok(pkg.scripts[required], `package.json missing script ${required}`)
}
assert.ok(pkg.files.includes('skills') && pkg.files.includes('plugins'), 'package files must ship skills and plugins')
assert.equal(Object.keys(pkg.dependencies || {}).length, 0, 'skills must stay dependency-free')
assert.equal(Object.keys(pkg.devDependencies || {}).length, 0, 'skills must stay dependency-free')

// Marketplace entries must resolve to a real plugin with a matching manifest.
const marketplace = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/marketplace.json'), 'utf8'))
const marketplaceNames = marketplace.plugins.map((entry) => entry.name)
for (const name of ['qa-demo', 'pr-warden', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion']) {
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

const reviewLearnPlugin = marketplace.plugins.find((plugin) => plugin.name === 'review-learn')
assert.ok(reviewLearnPlugin, 'marketplace missing plugin review-learn')
assert.equal(reviewLearnPlugin.source, './plugins/review-learn')
assert.deepEqual(reviewLearnPlugin.skills, reviewLearningVariants.map((name) => `./skills/${name}`))
const reviewLearnManifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins/review-learn/.claude-plugin/plugin.json'), 'utf8'))
assert.equal(reviewLearnManifest.name, 'review-learn')
assert.equal(reviewLearnManifest.version, reviewLearnPlugin.version, 'review-learn plugin/marketplace version drift')
for (const name of reviewLearningVariants) {
  assert.ok(fs.existsSync(path.join(root, 'plugins/review-learn/skills', name, 'SKILL.md')), `review-learn plugin missing ${name}`)
}

const secondOpinion = fs.readFileSync(path.join(root, 'skills/second-opinion/SKILL.md'), 'utf8')
for (const marker of [
  '/second-opinion',
  'all sessions',
  'second-opinion: always',
  'native subagent',
  'No other vendor',
  'read-only',
  'ACCEPT',
  'DISMISS',
  '<<<SECOND_OPINION',
  'implicit',
  'FAILED',
  'fe-pr-review',
  'Never arm from this skill',
  'truncated:',
  '~1500 diff lines',
]) {
  assert.ok(secondOpinion.includes(marker), `second-opinion missing public contract: ${marker}`)
}

const reviewer = fs.readFileSync(path.join(root, 'skills/second-opinion/references/reviewer.md'), 'utf8')
for (const marker of [
  'bug/gap detector',
  '<<<SECOND_OPINION',
  'at most five',
  'untrusted data',
  '{"findings":[]}',
  'truncated:',
  'cannot run `git`',
  'neither a diff nor a file list',
]) {
  assert.ok(reviewer.includes(marker), `second-opinion reviewer missing: ${marker}`)
}

const hosts = fs.readFileSync(path.join(root, 'skills/second-opinion/references/hosts.md'), 'utf8')
for (const marker of ['parent agent owns handoff selection', 'Select by capability', 'advertised capabilities', 'report `FAILED`', "another vendor's CLI"]) {
  assert.ok(hosts.includes(marker), `second-opinion hosts missing: ${marker}`)
}
assert.match(secondOpinion, /parent agent[\s\S]*chooses one reviewer target/i, 'second-opinion must make the parent choose the handoff target')
for (const forbidden of [
  /subagent_type\s*:/i,
  /model:\s*(?:haiku|sonnet|opus|luna|gpt|codex)/i,
  /cursor-agent/i,
  /codex exec/i,
  /claude --print/i,
]) {
  assert.ok(!forbidden.test(`${secondOpinion}\n${hosts}`), `second-opinion skill hardcodes handoff routing: ${forbidden}`)
}

const agentPath = path.join(root, 'plugins/second-opinion/agents/second-opinion.md')
assert.ok(fs.existsSync(agentPath), 'missing Claude agent for second-opinion')
const agent = fs.readFileSync(agentPath, 'utf8')
const agentBody = agent.replace(/^---[\s\S]*?---\n/, '')
assert.equal(agentBody, reviewer, 'Claude agent body must match references/reviewer.md')
assert.ok(agent.includes('model: haiku'), 'Claude agent must stay on haiku')
assert.ok(fs.existsSync(path.join(root, 'plugins/second-opinion/commands/second-opinion.md')), 'missing /second-opinion command')

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
for (const marker of ['fe-pr-review', 'npm run test:fe-pr-review', 'plugins/fe-pr-review', '`qa-demo` is opt-in', 'be-pr-review', 'npm run test:be-pr-review', 'plugins/be-pr-review', '/review', 'plugins/review', '/review-learn-from-me', '/review-learn-from-all', 'latest 15 PRs I reviewed; learn only my comments', 'latest 15 PRs I reviewed; learn every human reviewer', 'plugins/review-learn', '.agents/review-learnings.md']) {
  assert.ok(readme.includes(marker), `README missing public skill reference: ${marker}`)
}
for (const marker of [
  'second-opinion',
  'plugins/second-opinion',
  'Use /second-opinion for all sessions',
  'scripts/sync-plugin-mirrors.mjs',
  'npm run sync:plugins',
]) {
  assert.ok(readme.includes(marker), `README missing second-opinion reference: ${marker}`)
}

assert.ok(fs.existsSync(path.join(root, 'scripts/sync-plugin-mirrors.mjs')), 'missing sync-plugin-mirrors.mjs')
assert.ok(pkg.scripts['sync:plugins'], 'package.json missing script sync:plugins')
const syncScriptPath = path.join(root, 'scripts/sync-plugin-mirrors.mjs')
const syncSrc = fs.readFileSync(syncScriptPath, 'utf8')
const firstSyncMutation = Math.min(
  ...['fs.mkdirSync(', 'fs.copyFileSync(', 'fs.rmSync(', 'fs.cpSync(', 'fs.writeFileSync(']
    .map((marker) => syncSrc.indexOf(marker))
    .filter((index) => index >= 0),
)
for (const marker of [
  "requireFile(reviewLearningContract, 'canonical review-learning contract')",
  "requireDirectory(canonical, `canonical review-learning variant ${name}`)",
  "requireFile(path.join(canonical, 'SKILL.md'), `canonical review-learning variant SKILL.md ${name}`)",
]) {
  const preflightIndex = syncSrc.indexOf(marker)
  assert.ok(preflightIndex >= 0 && preflightIndex < firstSyncMutation, `sync preflight must precede every mutation: ${marker}`)
}

const syncFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-sync-preflight-'))
try {
  const write = (relative, body = '') => {
    const file = path.join(syncFixture, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body)
  }
  write('scripts/sync-plugin-mirrors.mjs', syncSrc)
  write('templates/review-learn-contract.md', '# contract\n')
  for (const name of ['qa-demo', 'pr-warden', 'fe-pr-review', 'be-pr-review', 'review', 'second-opinion']) {
    write(`skills/${name}/SKILL.md`, `# ${name}\n`)
  }
  write('skills/review-learn-from-me/SKILL.md', '# from me\n')
  fs.mkdirSync(path.join(syncFixture, 'skills/review-learn-from-all'), { recursive: true })
  write('skills/second-opinion/references/reviewer.md', '# reviewer\n')
  write('plugins/second-opinion/agents/second-opinion.md', '---\nname: second-opinion\n---\n# old\n')
  write('plugins/review-learn/skills/sentinel.txt', 'preserve me\n')

  const failedSync = spawnSync(process.execPath, [path.join(syncFixture, 'scripts/sync-plugin-mirrors.mjs')], {
    cwd: syncFixture,
    encoding: 'utf8',
  })
  assert.notEqual(failedSync.status, 0, 'sync must fail when a canonical review-learning SKILL.md is missing')
  assert.match(`${failedSync.stdout}\n${failedSync.stderr}`, /canonical review-learning variant SKILL\.md review-learn-from-all missing/)
  assert.equal(
    fs.readFileSync(path.join(syncFixture, 'plugins/review-learn/skills/sentinel.txt'), 'utf8'),
    'preserve me\n',
    'failed sync must leave the existing plugin mirror untouched',
  )
  assert.equal(
    fs.existsSync(path.join(syncFixture, 'skills/review-learn-from-me/references/contract.md')),
    false,
    'failed sync must not generate canonical references before preflight completes',
  )
} finally {
  fs.rmSync(syncFixture, { recursive: true, force: true })
}

console.log('PASS: public skill contracts, mirrors, packaging, and internal-leak guard')
