#!/usr/bin/env node
/**
 * Fixture tests for portable PR Warden adapter.
 * Covers: manual run, scheduled, duplicate, missing evidence, permission,
 * GitHub/Bitbucket action planning, trusted-path PR-only gate,
 * never-merge policy, attempt bounds, and provider-neutral envelopes.
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
  Policy,
  PRWardenState,
  gatesFrom,
} from './lib/policy.mjs'
import { gateCodeChange, isTrustedPath } from './lib/trusted-paths.mjs'
import {
  latestReviewStates,
  githubConflictStatus,
  githubCiState,
  unknownReviewFacts,
  readScheduledWatch,
} from './lib/github.mjs'
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
  renderMarkdown,
} from './lib/envelope.mjs'
import { operatorHelper } from './lib/copy.mjs'
import { buildReportDocument, renderHtmlReport } from './lib/report.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.resolve(__dirname, '../fixtures')
const ADAPTER = path.resolve(__dirname, 'adapter.mjs')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-warden-test-'))
let failed = 0
const tests = []

function test(name, fn) {
  tests.push({ name, fn })
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

// --- provider-neutral link parsing ---
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

test('parses GitHub PR URLs and provider-prefixed shorthands', () => {
  const url = parsePRLink('https://github.com/patrick-lai/sdlc/pull/2?diff=split#discussion')
  const short = parsePRLink('github:patrick-lai/sdlc#2')
  assert.equal(url.ok, true)
  assert.equal(short.ok, true)
  assert.equal(url.link.url, 'https://github.com/patrick-lai/sdlc/pull/2')
  assert.equal(keyDescription(url.link.key), 'github:patrick-lai/sdlc#2')
  assert.equal(keyDescription(url.link.key), keyDescription(short.link.key))
})

test('refuses empty and unsupported providers', () => {
  assert.equal(parsePRLink('').ok, false)
  const result = parsePRLink('https://gitlab.com/o/r/merge_requests/1')
  assert.equal(result.ok, false)
  assert.equal(result.failure, 'unsupportedProvider')
})

test('GitHub review state uses each reviewer latest submitted review', () => {
  const states = latestReviewStates([
    {
      id: 30,
      state: 'APPROVED',
      submitted_at: '2026-03-03T12:00:00Z',
      user: { login: 'Reviewer-One' },
    },
    {
      id: 10,
      state: 'CHANGES_REQUESTED',
      submitted_at: '2026-03-01T12:00:00Z',
      user: { login: 'reviewer-one' },
    },
    { id: 41, state: 'APPROVED', user: { login: 'reviewer-two' } },
    { id: 42, state: 'CHANGES_REQUESTED', user: { login: 'reviewer-two' } },
  ])
  assert.deepEqual(states.sort(), ['APPROVED', 'CHANGES_REQUESTED'])
})

test('GitHub conflicts require explicit dirty state', () => {
  assert.equal(githubConflictStatus({ mergeable: false, mergeable_state: 'blocked' }, 'open'), null)
  assert.equal(githubConflictStatus({ mergeable: false, mergeable_state: 'unknown' }, 'open'), null)
  assert.equal(githubConflictStatus({ mergeable: false, mergeable_state: 'dirty' }, 'open'), true)
  assert.equal(githubConflictStatus({ mergeable: true, mergeable_state: 'behind' }, 'open'), false)
  assert.equal(githubConflictStatus({ mergeable: false, mergeable_state: 'dirty' }, 'merged'), false)
})

test('GitHub CI rollup acts only on identified required checks', () => {
  const failed = [{ name: 'optional-lint', status: 'completed', conclusion: 'failure' }]
  assert.equal(githubCiState({ state: 'failure' }, failed), 'unknown')
  assert.equal(
    githubCiState(null, [{ name: 'build', status: 'in_progress', conclusion: null }], ['build']),
    'running',
  )
  assert.equal(
    githubCiState(
      { statuses: [{ context: 'required-status', state: 'success' }] },
      [{ name: 'build', status: 'completed', conclusion: 'failure' }],
      ['build', 'required-status'],
    ),
    'red',
  )
  assert.equal(
    githubCiState(
      null,
      [
        { name: 'build', status: 'completed', conclusion: 'success' },
        { name: 'types', status: 'completed', conclusion: 'skipped' },
      ],
      ['build', 'types'],
    ),
    'green',
  )
  assert.equal(
    githubCiState(
      null,
      [{ name: 'build', status: 'completed', conclusion: 'cancelled' }],
      ['build'],
    ),
    'unknown',
  )
  assert.equal(githubCiState(null, [], ['build']), 'running')
  assert.equal(githubCiState(null, [], []), 'green')
})

test('HTML fallback leaves current review state unknown and non-actionable', () => {
  const reviewFacts = unknownReviewFacts()
  assert.equal(reviewFacts.reviewStateKnown, false)
  assert.equal(reviewFacts.changesRequested, null)
  assert.equal(reviewFacts.approvalsSatisfied, null)
  const envelope = buildResultEnvelope({
    key: { provider: 'github', workspace: 'acme', repo: 'app', number: 9 },
    facts: {
      lifecycle: 'open',
      isDraft: false,
      ci: 'unknown',
      requiredCiKnown: false,
      hasConflicts: null,
      unresolvedTasks: 0,
      ...reviewFacts,
      operatorActionCount: 0,
      externalGateCount: 0,
    },
    conditions: {
      repairable: [],
      operatorActions: [],
      externalGates: [],
      waiting: ['Required CI and current review status require provider API authentication'],
      ignored: [],
    },
  })
  assert.equal(envelope.state, PRWardenState.ciUnknown)
  assert.equal(envelope.decision.mayDispatchRepair, false)
  assert.equal(envelope.gates.feedback, 'pending')
  assert.ok(envelope.evidenceGaps.includes('Current review state unknown'))
})

test('scheduled GitHub watches perform a live read and fail closed', async () => {
  const watch = {
    key: { provider: 'github', workspace: 'acme', repo: 'app', number: 9 },
    title: 'PR #9',
    jiraKeys: ['APP-9'],
    attemptCount: 2,
  }
  let reads = 0
  const live = await readScheduledWatch(watch, async (link) => {
    reads += 1
    assert.equal(link.url, 'https://github.com/acme/app/pull/9')
    return {
      key: link.key,
      url: link.url,
      title: 'Live PR',
      facts: { lifecycle: 'open', ci: 'unknown', hasConflicts: null },
      conditions: { repairable: [], operatorActions: [], externalGates: [], waiting: [] },
    }
  })
  assert.equal(reads, 1)
  assert.equal(live.unreadable, undefined)
  assert.equal(live.title, 'Live PR')
  assert.equal(live.attemptCount, 2)
  assert.deepEqual(live.jiraKeys, ['APP-9'])

  const failed = await readScheduledWatch(watch, async () => {
    throw new Error('network down')
  })
  assert.equal(failed.unreadable, true)
  assert.match(failed.error, /^live_read_failed:network down$/)
})

test('scheduled Bitbucket watches fail closed without invoking a reader', async () => {
  let reads = 0
  const snap = await readScheduledWatch(
    {
      key: { provider: 'bitbucket', workspace: 'acme', repo: 'app', number: 9 },
    },
    async () => {
      reads += 1
    },
  )
  assert.equal(reads, 0)
  assert.equal(snap.unreadable, true)
  assert.equal(snap.error, 'live_read_unsupported_provider:bitbucket')
})

// --- policy classification ---
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
  const md = renderMarkdown(env)
  assert.match(md, /never merges/i)
  assert.match(md, /Confidence/)
  assert.match(md, /Required CI is red/)
  assert.equal(env.attemptCount, 0)
})

test('operator helper names the mechanism and the human job', () => {
  const ready = buildResultEnvelope({
    key: { workspace: 'acme', repo: 'payments', number: 1 },
    facts: readFix('pr-snapshot.ready.json').facts,
    conditions: readFix('pr-snapshot.ready.json').conditions,
  })
  assert.match(operatorHelper(ready), /Merge in your provider/i)
  assert.match(operatorHelper(ready), /will not press merge/i)

  const perm = buildResultEnvelope({
    key: { workspace: 'acme', repo: 'payments', number: 2 },
    permissionFailure: true,
    unreadable: true,
  })
  assert.match(operatorHelper(perm), /Authenticate the provider CLI\/API/i)
})

test('HTML report is the baked template filled with envelope data', () => {
  const snaps = [
    'pr-snapshot.ci-red.json',
    'pr-snapshot.ready.json',
    'pr-snapshot.permission.json',
  ].map((name) => {
    const snap = readFix(name)
    return buildResultEnvelope({
      key: { workspace: snap.workspace, repo: snap.repo, number: snap.number },
      url: snap.url,
      title: snap.title,
      branch: snap.branch,
      facts: snap.facts ?? null,
      conditions: snap.conditions,
      jiraKeys: snap.jiraKeys,
      permissionFailure: snap.permissionFailure,
      unreadable: snap.unreadable,
    })
  })
  const doc = buildReportDocument({ envelopes: snaps, mode: 'manual' })
  assert.equal(doc.schema, 'sdlc.pr-warden.report/v1')
  assert.equal(doc.neverMerges, true)
  assert.ok(doc.counts.repairing >= 1)
  assert.ok(doc.counts.ready >= 1)
  assert.ok(doc.counts.needsYou >= 1)
  const html = renderHtmlReport(doc)
  assert.match(html, /Never merges/)
  assert.match(html, /What this means/)
  assert.match(html, /Fix checkout tax edge case/)
  assert.match(html, /Ready green PR/)
  assert.doesNotMatch(html, /__WARDEN_REPORT_JSON__/)
  assert.match(html, /--bg: #f4f5f7/)
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
    assert.ok(typeof item.helper === 'string' && item.helper.length > 0)
  }
})

test('digest --html writes the baked report', () => {
  const ledger = path.join(tmpRoot, 'digest-html-ledger.json')
  const cfg = path.join(tmpRoot, 'digest-html-cfg.json')
  const htmlPath = path.join(tmpRoot, 'warden-report.html')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger, dryRun: true }))
  const res = runAdapter([
    'digest',
    '--fixture-dir',
    FIX,
    '--config',
    cfg,
    '--force',
    '--html',
    htmlPath,
  ])
  assert.equal(res.status, 0, res.stderr)
  const body = JSON.parse(res.stdout)
  assert.equal(body.reportHtml, htmlPath)
  const html = fs.readFileSync(htmlPath, 'utf8')
  assert.match(html, /PR Warden/)
  assert.match(html, /Never merges/)
  assert.match(html, /What this means/)
  assert.ok(html.includes('Fix checkout tax') || html.includes('410074'))
})

test('arm/stop/status round-trip is idempotent on duplicate arm', () => {
  const ledger = path.join(tmpRoot, 'arm-ledger.json')
  const cfg = path.join(tmpRoot, 'arm-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger }))
  const url = 'https://github.com/acme/app/pull/9'
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

test('arm rejects providers without a scheduled live-read seam', () => {
  const ledger = path.join(tmpRoot, 'unsupported-arm-ledger.json')
  const cfg = path.join(tmpRoot, 'unsupported-arm-cfg.json')
  fs.writeFileSync(cfg, JSON.stringify({ ledgerPath: ledger }))
  const res = runAdapter([
    'arm',
    '--url',
    'https://bitbucket.org/acme/app/pull-requests/9',
    '--config',
    cfg,
  ])
  assert.equal(res.status, 2)
  assert.match(res.stderr, /currently supports GitHub PRs/)
  assert.equal(fs.existsSync(ledger), false)
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

for (const { name, fn } of tests) {
  try {
    await fn()
    console.log(`ok  - ${name}`)
  } catch (err) {
    failed += 1
    console.error(`fail - ${name}`)
    console.error(err)
  }
}

// cleanup note: tmpRoot left for inspection on failure; remove on success
if (failed === 0) {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  console.log('\nAll pr-warden adapter tests passed.')
  process.exit(0)
} else {
  console.error(`\n${failed} test(s) failed. tmp=${tmpRoot}`)
  process.exit(1)
}
