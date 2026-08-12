#!/usr/bin/env node
/**
 * Fixture tests for portable PR Warden adapter.
 * Covers: manual run, scheduled, duplicate, missing evidence, permission,
 * Bitbucket/Jira action planning retries, trusted-path PR-only gate,
 * and policy parity with Lumine classification.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { parsePRLink, keyDescription, makeLink } from './lib/link-parse.mjs'
import {
  classify,
  decideNext,
  nextCheck,
  mayMerge,
  isActionableByAgent,
  needsOperator,
  afmBranchDeployAction,
  Policy,
  gatesFrom,
} from './lib/policy.mjs'
import { gateCodeChange, isTrustedPath } from './lib/trusted-paths.mjs'
import {
  buildIdempotencyKey,
  activityFingerprint,
  isDuplicate,
} from './lib/idempotency.mjs'
import {
  loadLedger,
  saveLedger,
  hasRun,
  recordRun,
} from './lib/ledger.mjs'
import {
  buildResultEnvelope,
  renderAtlassianMarkdown,
} from './lib/envelope.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(__dirname, '../fixtures')
const ADAPTER = path.resolve(__dirname, 'adapter.mjs')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-warden-test-'))
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`ok  - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`fail - ${name}`)
    console.error(err)
  }
}

function readFix(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'))
}

function runAdapter(args, env = {}) {
  const res = spawnSync(process.execPath, [ADAPTER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return res
}

// --- link parse (parity with PRWardenLinkParser) ---
test('parses Bitbucket PR URLs and strips query/fragment', () => {
  const r = parsePRLink(
    'https://bitbucket.org/ws/repo/pull-requests/42?src=x#comment-1',
  )
  assert.equal(r.ok, true)
  assert.equal(r.link.url, 'https://bitbucket.org/ws/repo/pull-requests/42')
  assert.equal(r.link.key.number, 42)
})

test('parses shorthand coordinates', () => {
  const a = parsePRLink('ws/repo#7')
  const b = parsePRLink('ws/repo/pull-requests/7')
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  assert.equal(keyDescription(a.link.key), keyDescription(b.link.key))
})

test('refuses GitHub and empty', () => {
  assert.equal(parsePRLink('').ok, false)
  assert.equal(parsePRLink('https://github.com/o/r/pull/1').ok, false)
  assert.match(parsePRLink('https://github.com/o/r/pull/1').message, /GitHub/)
})

// --- policy classification (parity with PRWardenPolicy.classify) ---
test('classification prioritizes actionable work', () => {
  assert.equal(
    classify({ ci: 'red', hasConflicts: true, changesRequested: true }),
    'ciRed',
  )
  assert.equal(
    classify({
      ci: 'green',
      hasConflicts: false,
      changesRequested: true,
      unresolvedTasks: 0,
    }),
    'needsWork',
  )
  assert.equal(
    classify({ ci: 'green', hasConflicts: true, changesRequested: false }),
    'conflict',
  )
  assert.equal(
    classify({ lifecycle: 'draft', isDraft: true, ci: 'green', hasConflicts: false }),
    'draft',
  )
})

test('terminal and human states never dispatch repair', () => {
  assert.equal(classify({ lifecycle: 'declined' }), 'closed')
  assert.equal(
    classify({ lifecycle: 'draft', isDraft: true, ci: 'green', hasConflicts: false }),
    'draft',
  )
  assert.equal(
    classify({
      ci: 'green',
      hasConflicts: false,
      operatorActionCount: 1,
      approvalsSatisfied: true,
    }),
    'needsYou',
  )
  for (const s of [
    'merged',
    'closed',
    'draft',
    'readyToMerge',
    'needsYou',
    'awaitingReview',
    'ciRunning',
  ]) {
    assert.equal(isActionableByAgent(s), false, s)
  }
})

test('known-good and gateless-green are ready to merge', () => {
  assert.equal(
    classify({
      ci: 'green',
      hasConflicts: false,
      approvalsSatisfied: true,
    }),
    'readyToMerge',
  )
  assert.equal(
    classify({
      ci: 'green',
      hasConflicts: false,
      approvalsSatisfied: null,
      externalGateCount: 0,
    }),
    'readyToMerge',
  )
  assert.equal(
    classify({
      ci: 'green',
      hasConflicts: false,
      approvalsSatisfied: null,
      externalGateCount: 1,
    }),
    'awaitingReview',
  )
})

test('mayMerge is permanently false', () => {
  assert.equal(mayMerge({ state: 'readyToMerge' }), false)
})

test('nextCheck intervals match policy floors', () => {
  const now = 1_700_000_000_000
  assert.equal(
    nextCheck('ciRunning', now),
    now + Policy.defaultActiveCheckInterval,
  )
  assert.equal(nextCheck('awaitingReview', now), now + Policy.awaitingReviewInterval)
  assert.equal(nextCheck('readyToMerge', now), now + Policy.readySafetyInterval)
  assert.equal(nextCheck('merged', now), null)
  assert.equal(nextCheck('ciRed', now), now)
})

test('AFM branch deploy decision is pure', () => {
  assert.equal(
    afmBranchDeployAction({
      workspace: 'atlassian',
      repo: 'atlassian-frontend-monorepo',
      branch: 'feat/x',
    }).action,
    'trigger',
  )
  assert.equal(
    afmBranchDeployAction({
      workspace: 'atlassian',
      repo: 'raphael',
      branch: 'feat/x',
    }).action,
    'skipNotAFM',
  )
  assert.equal(
    afmBranchDeployAction({
      workspace: 'atlassian',
      repo: 'atlassian-frontend-monorepo',
      branch: 'feat/x',
      inFlightBuilds: [99],
    }).action,
    'skipAlreadyInFlight',
  )
})

test('gates separate facts from journey status', () => {
  const g = gatesFrom(
    'ciRed',
    {
      ci: 'red',
      hasConflicts: false,
      changesRequested: false,
      unresolvedTasks: 0,
      approvalsSatisfied: false,
      externalGateCount: 1,
    },
    { repairing: true },
  )
  assert.equal(g.ci, 'active')
  assert.equal(g.approvals, 'human')
})

// --- trusted paths ---
test('trusted-path gate is PR-only', () => {
  const r = gateCodeChange({
    files: ['src/a.ts'],
    trustedPaths: ['src/**'],
    targetIsPullRequest: false,
  })
  assert.equal(r.allowed, false)
  assert.match(r.reason, /PR-only/)
})

test('trusted-path gate blocks unlisted files', () => {
  assert.equal(isTrustedPath('src/foo.ts', ['src/**']), true)
  assert.equal(isTrustedPath('.github/workflows/x.yml', ['src/**']), false)
  const r = gateCodeChange({
    files: ['src/a.ts', 'secrets/prod.env'],
    trustedPaths: ['src/**'],
  })
  assert.equal(r.allowed, true)
  assert.equal(r.partial, true)
  assert.deepEqual(r.blockedFiles, ['secrets/prod.env'])
})

test('trusted-path gate collapses .. and rejects traversal escapes', () => {
  const r = gateCodeChange({
    files: [
      'src/../../../etc/passwd',
      'src/../.git/config',
      'src/../.github/workflows/release.yml',
      'src/foo.ts',
    ],
    trustedPaths: ['src/**'],
  })
  assert.equal(isTrustedPath('src/../../../etc/passwd', ['src/**']), false)
  assert.equal(isTrustedPath('src/../.git/config', ['src/**']), false)
  assert.equal(isTrustedPath('src/foo.ts', ['src/**']), true)
  assert.equal(r.allowed, true)
  assert.equal(r.partial, true)
  assert.deepEqual(r.allowedFiles, ['src/foo.ts'])
  assert.ok(r.blockedFiles.includes('../../etc/passwd') || r.blockedFiles.some((p) => p.includes('etc/passwd')))
  assert.ok(r.blockedFiles.includes('.git/config'))
  assert.ok(r.blockedFiles.includes('.github/workflows/release.yml'))
})

// --- idempotency / ledger ---
test('duplicate idempotency keys are detected', () => {
  const key = { workspace: 'ws', repo: 'repo', number: 1 }
  const id = buildIdempotencyKey({
    key,
    skill: 'pr-warden',
    activityFingerprint: 'abc',
    actionKind: 'dispatch_repair',
  })
  const seen = new Set([id])
  assert.equal(isDuplicate(id, seen), true)
  assert.equal(isDuplicate(id + 'x', seen), false)
})

test('activityFingerprint includes nested facts', () => {
  const base = {
    state: 'ciRed',
    facts: { ci: 'red', hasConflicts: false, unresolvedTasks: 0 },
    repairable: ['a'],
    waiting: [],
  }
  const changed = {
    state: 'ciRed',
    facts: { ci: 'green', hasConflicts: true, unresolvedTasks: 9 },
    repairable: ['a'],
    waiting: [],
  }
  const a = activityFingerprint(base)
  const b = activityFingerprint(changed)
  const c = activityFingerprint(base)
  assert.equal(a, c)
  assert.notEqual(a, b)
})

test('buildIdempotencyKey tolerates missing key', () => {
  const id = buildIdempotencyKey({
    key: undefined,
    skill: 'pr-warden',
    activityFingerprint: 'x',
  })
  assert.match(id, /bitbucket:unknown\/unknown#0/)
})

test('ledger survives corrupt file as empty', () => {
  const p = path.join(tmpRoot, 'corrupt.json')
  fs.writeFileSync(p, '{not json')
  const ledger = loadLedger(p)
  assert.deepEqual(ledger.runs, {})
})

test('ledger records runs atomically', () => {
  const p = path.join(tmpRoot, 'ledger.json')
  let ledger = loadLedger(p)
  recordRun(ledger, 'k1', { itemKey: 'bitbucket:ws/repo#1', decision: 'wait' })
  saveLedger(p, ledger)
  ledger = loadLedger(p)
  assert.equal(hasRun(ledger, 'k1'), true)
  assert.equal(hasRun(ledger, 'k2'), false)
})

// --- envelope ---
test('envelope separates facts from decisions and exposes confidence', () => {
  const snap = readFix('pr-snapshot.ci-red.json')
  const env = buildResultEnvelope({
    key: {
      workspace: snap.workspace,
      repo: snap.repo,
      number: snap.number,
    },
    facts: snap.facts,
    conditions: snap.conditions,
    skill: 'pr-warden',
    mode: 'manual',
    jiraKeys: snap.jiraKeys,
    actions: [
      {
        surface: 'bitbucket',
        kind: 'repair_pass',
        status: 'planned',
        evidenceUrl: snap.url,
      },
    ],
  })
  assert.equal(env.schema, 'sdlc.pr-warden.result/v1')
  assert.equal(env.state, 'ciRed')
  assert.equal(env.decision.mayDispatchRepair, true)
  assert.equal(env.policy.mayMerge, false)
  assert.ok(env.confidence > 0.5)
  assert.ok(env.facts)
  assert.ok(env.decision)
  assert.notEqual(env.facts, env.decision)
  const md = renderAtlassianMarkdown(env)
  assert.match(md, /never merges/i)
  assert.match(md, /Confidence/)
})

test('incomplete evidence lowers confidence and lists gaps', () => {
  const env = buildResultEnvelope({
    key: { workspace: 'ws', repo: 'repo', number: 1 },
    facts: null,
    unreadable: true,
  })
  assert.ok(env.confidence <= 0.3)
  assert.ok(env.evidenceGaps.length >= 1)
  assert.ok(env.assumptions.length >= 1)
})

test('permission failure is low confidence with no mutations', () => {
  const env = buildResultEnvelope({
    key: { workspace: 'ws', repo: 'repo', number: 1 },
    permissionFailure: true,
    unreadable: true,
    actions: [],
  })
  assert.equal(env.confidence, 0.15)
  assert.equal(env.actions.length, 0)
})

// --- adapter CLI integration ---
test('manual run succeeds on ci-red fixture', () => {
  const ledger = path.join(tmpRoot, 'run-ledger.json')
  const cfg = path.join(tmpRoot, 'cfg.json')
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      ledgerPath: ledger,
      dryRun: false,
      jiraBaseUrl: 'https://jira.example.com',
      actions: { bitbucket: true, jira: true },
      trustedPaths: ['src/**'],
    }),
  )
  const res = runAdapter([
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.ci-red.json'),
    '--config',
    cfg,
  ])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  assert.equal(body.skipped, false)
  assert.equal(body.envelope.state, 'ciRed')
  assert.equal(body.envelope.decision.decision, 'dispatch_repair')
  assert.equal(body.envelope.policy.dryRun, false)
  assert.ok(body.envelope.actions.some((a) => a.surface === 'bitbucket' && a.status === 'planned'))
  assert.ok(
    body.envelope.actions.some(
      (a) =>
        a.surface === 'jira' &&
        a.status === 'planned' &&
        a.evidenceUrl === 'https://jira.example.com/browse/PAY-1234',
    ),
  )
})

test('dryRun withholds actions and surfaces policy.dryRun', () => {
  const ledger = path.join(tmpRoot, 'dry-ledger.json')
  const cfg = path.join(tmpRoot, 'dry-cfg.json')
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      ledgerPath: ledger,
      dryRun: true,
      jiraBaseUrl: 'https://jira.example.com',
      actions: { bitbucket: true, jira: true },
    }),
  )
  const res = runAdapter([
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.ci-red.json'),
    '--config',
    cfg,
  ])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  assert.equal(body.envelope.policy.dryRun, true)
  assert.ok(body.envelope.actions.length >= 1)
  assert.ok(body.envelope.actions.every((a) => a.status === 'skipped'))
})

test('jira evidenceUrl is null without jiraBaseUrl', () => {
  const ledger = path.join(tmpRoot, 'nojira-ledger.json')
  const cfg = path.join(tmpRoot, 'nojira-cfg.json')
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      ledgerPath: ledger,
      dryRun: false,
      actions: { bitbucket: true, jira: true },
    }),
  )
  const res = runAdapter([
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.ci-red.json'),
    '--config',
    cfg,
  ])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  const jira = body.envelope.actions.filter((a) => a.surface === 'jira')
  assert.ok(jira.length >= 1)
  assert.ok(jira.every((a) => a.evidenceUrl == null))
})

test('duplicate scheduled run is skipped (idempotent)', () => {
  const ledger = path.join(tmpRoot, 'dup-ledger.json')
  const cfg = path.join(tmpRoot, 'dup-cfg.json')
  fs.writeFileSync(
    cfg,
    JSON.stringify({
      ledgerPath: ledger,
      dryRun: true,
      actions: { bitbucket: true, jira: true },
    }),
  )
  const args = [
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.ci-red.json'),
    '--config',
    cfg,
    '--mode',
    'scheduled',
  ]
  const first = runAdapter(args)
  assert.equal(first.status, 0, first.stderr)
  const second = runAdapter(args)
  assert.equal(second.status, 0, second.stderr)
  const body = JSON.parse(second.stdout)
  assert.equal(body.skipped, true)
  assert.ok(body.envelope.duplicateOf)
})

test('permission failure fixture produces auditable refusal', () => {
  const ledger = path.join(tmpRoot, 'perm-ledger.json')
  const cfg = path.join(tmpRoot, 'perm-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  const res = runAdapter([
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.permission.json'),
    '--config',
    cfg,
  ])
  assert.equal(res.status, 4)
  const body = JSON.parse(res.stdout)
  assert.equal(body.envelope.confidence, 0.15)
  assert.equal(body.envelope.actions.length, 0)
})

test('missing evidence fixture best-effort with gaps', () => {
  const ledger = path.join(tmpRoot, 'miss-ledger.json')
  const cfg = path.join(tmpRoot, 'miss-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  const res = runAdapter([
    'run',
    '--fixture',
    path.join(FIX, 'pr-snapshot.incomplete.json'),
    '--config',
    cfg,
  ])
  assert.equal(res.status, 0)
  const body = JSON.parse(res.stdout)
  assert.ok(body.envelope.evidenceGaps.length >= 1)
  assert.ok(body.envelope.confidence < 0.9)
})

test('exhausted attempts escalate instead of looping', () => {
  const snap = readFix('pr-snapshot.ci-red.json')
  const decision = decideNext({
    state: 'ciRed',
    attemptCount: Policy.maxRepairAttempts,
    conditions: snap.conditions,
  })
  assert.equal(decision.decision, 'escalate_exhausted')
  assert.equal(decision.mayDispatchRepair, false)
})

test('sweep processes fixture dir', () => {
  const ledger = path.join(tmpRoot, 'sweep-ledger.json')
  const cfg = path.join(tmpRoot, 'sweep-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  const res = runAdapter(['sweep', '--fixture-dir', FIX, '--config', cfg])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  assert.ok(body.count >= 3)
  assert.equal(body.skill, 'pr-warden')
})

test('digest surfaces risk items only', () => {
  const ledger = path.join(tmpRoot, 'digest-ledger.json')
  const cfg = path.join(tmpRoot, 'digest-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  const res = runAdapter(['digest', '--fixture-dir', FIX, '--config', cfg, '--force'])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  assert.equal(body.schema, 'sdlc.pr-warden.risk-digest/v1')
  assert.ok(body.riskCount >= 1)
  for (const item of body.items) {
    assert.ok(item.markdown.includes('PR Warden'))
  }
})

test('arm/stop/status round-trip is idempotent on duplicate arm', () => {
  const ledger = path.join(tmpRoot, 'arm-ledger.json')
  const cfg = path.join(tmpRoot, 'arm-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger }))
  const url = 'https://bitbucket.org/acme/app/pull-requests/9'
  let res = runAdapter(['arm', '--url', url, '--config', cfg])
  assert.equal(res.status, 0, res.stderr)
  let body = JSON.parse(res.stdout)
  assert.equal(body.armed, true)
  res = runAdapter(['arm', '--url', url, '--config', cfg])
  body = JSON.parse(res.stdout)
  assert.equal(body.already_watching, true)
  res = runAdapter(['status', '--config', cfg])
  body = JSON.parse(res.stdout)
  assert.equal(body.under_watch, 1)
  res = runAdapter(['stop', '--id', body.watches[0].id, '--config', cfg])
  assert.equal(JSON.parse(res.stdout).ok, true)
  res = runAdapter(['status', '--config', cfg])
  assert.equal(JSON.parse(res.stdout).under_watch, 0)
})

test('ready fixture does not plan repair', () => {
  const snap = readFix('pr-snapshot.ready.json')
  const state = classify(snap.facts)
  assert.equal(state, 'readyToMerge')
  assert.equal(needsOperator(state), true)
  const d = decideNext({ state, conditions: snap.conditions })
  assert.equal(d.decision, 'handoff_operator')
  assert.equal(d.mayMerge, false)
})

test('activity fingerprint is stable for identical payload', () => {
  const a = activityFingerprint({ state: 'ciRed', x: 1 })
  const b = activityFingerprint({ state: 'ciRed', x: 1 })
  assert.equal(a, b)
})

test('digest skips non-snapshot JSON and does not crash', () => {
  const ledger = path.join(tmpRoot, 'examples-digest-ledger.json')
  const cfg = path.join(tmpRoot, 'examples-digest-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  // examples/ contains schedule.config.json (not a snapshot) — must not abort
  const examples = path.resolve(__dirname, '../examples')
  const res = runAdapter([
    'digest',
    '--fixture-dir',
    examples,
    '--config',
    cfg,
    '--force',
  ])
  assert.equal(res.status, 0, res.stderr + res.stdout)
  const body = JSON.parse(res.stdout)
  assert.equal(body.schema, 'sdlc.pr-warden.risk-digest/v1')
  assert.equal(body.riskCount, 0)
})

test('changed facts produce a new idempotency key (not suppressed)', () => {
  const ledger = path.join(tmpRoot, 'fp-ledger.json')
  const cfg = path.join(tmpRoot, 'fp-cfg.json')
  fs.writeFileSync(
    cfg,
    JSON.stringify({ ledgerPath: ledger, dryRun: true, actions: { bitbucket: true, jira: false } }),
  )
  const aPath = path.join(tmpRoot, 'snap-a.json')
  const bPath = path.join(tmpRoot, 'snap-b.json')
  const base = readFix('pr-snapshot.ci-red.json')
  fs.writeFileSync(aPath, JSON.stringify(base))
  const b = structuredClone(base)
  b.facts = { ...b.facts, unresolvedTasks: 4, changesRequested: true }
  b.conditions = {
    ...b.conditions,
    repairable: [...b.conditions.repairable, 'new reviewer feedback'],
  }
  fs.writeFileSync(bPath, JSON.stringify(b))
  const first = runAdapter(['run', '--fixture', aPath, '--config', cfg, '--mode', 'scheduled'])
  assert.equal(first.status, 0, first.stderr)
  const second = runAdapter(['run', '--fixture', bPath, '--config', cfg, '--mode', 'scheduled'])
  assert.equal(second.status, 0, second.stderr)
  const body = JSON.parse(second.stdout)
  assert.equal(body.skipped, false, 'changed evidence must not be treated as duplicate')
  assert.equal(body.envelope.state, 'ciRed')
})

test('makeLink lowercases coordinates', () => {
  const l = makeLink('Acme', 'App', 3)
  assert.equal(l.key.workspace, 'acme')
  assert.equal(l.key.repo, 'app')
})

// cleanup note: tmpRoot left for inspection on failure; remove on success
if (failed === 0) {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  console.log('\nAll pr-warden adapter tests passed.')
  process.exit(0)
} else {
  console.error(`\n${failed} test(s) failed. tmp=${tmpRoot}`)
  process.exit(1)
}
