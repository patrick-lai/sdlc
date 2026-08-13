#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  PERSONAS,
  PERSONA_FACETS,
  assertOutsideRepo,
  buildRunnerCommand,
  discoverRunners,
  makePlan,
  parseArgs,
  runGraph,
  selectPersonas,
  validateCandidate,
  validateSynthesis,
  verificationEvidence,
} from './review-graph.mjs'

const ids = ['repository-contract', 'api-compatibility', 'data-migrations', 'concurrency-reliability', 'security-observability-performance', 'tests-rollout']
assert.deepEqual(Object.keys(PERSONAS), ids)
assert.deepEqual(parseArgs(['run', '--verification-report', 'proof.json', '--dry-run']), { command: 'run', verificationReport: 'proof.json', dryRun: true })
assert.deepEqual(selectPersonas(['src/server.java']), ['repository-contract', 'api-compatibility', 'concurrency-reliability', 'security-observability-performance', 'tests-rollout'])
assert.deepEqual(selectPersonas(['db/migrations/V2__add.sql']), ['repository-contract', 'api-compatibility', 'concurrency-reliability', 'security-observability-performance', 'data-migrations', 'tests-rollout'])
assert.throws(() => selectPersonas([], 'data-migrations'), /3-6/)
assert.throws(() => selectPersonas([], 'repository-contract,api-compatibility,concurrency-reliability'), /tests-rollout/)
assert.deepEqual(selectPersonas(['src/OrderEntity.java']), ['repository-contract', 'api-compatibility', 'concurrency-reliability', 'security-observability-performance', 'data-migrations', 'tests-rollout'])
assert.deepEqual(selectPersonas(['prisma/schema.prisma']), ['repository-contract', 'api-compatibility', 'concurrency-reliability', 'security-observability-performance', 'data-migrations', 'tests-rollout'])
for (const facet of ['mixed-version-deploy', 'transaction-partial-success', 'retry-idempotency', 'cancellation-deadlines', 'expand-migrate-contract', 'query-algorithm-resource', 'rollout-rollback', 'test-oracle-validity']) {
  assert.ok(Object.values(PERSONA_FACETS).flat().some(([id]) => id === facet), `missing backend probe ${facet}`)
}

const promptVocabulary = Object.values(PERSONAS).join(' ') + ' ' + Object.values(PERSONA_FACETS).flat().map(([, label]) => label).join(' ')
for (const marker of ['read-check-write', 'backpressure', 'absent/null/empty', 'global identifier uniqueness', 'derived-value', 'verification obligations', 'sibling-path']) {
  assert.ok(promptVocabulary.toLowerCase().includes(marker.toLowerCase()), `missing corpus-derived generic probe ${marker}`)
}

const coverageFor = (persona, status = 'checked') => PERSONA_FACETS[persona].map(([id]) => ({ id, status, summary: `Inspected ${id}`, evidence: [`src/Server.java:1 establishes ${id}`] }))
const rolloutCandidate = {
  persona: 'tests-rollout',
  coverage: coverageFor('tests-rollout'),
  rolloutRequirement: { status: 'required', rationale: 'Behavior is independently releasable', evidence: ['src/Server.java:1'], identifiers: ['example.gate'] },
  findings: [],
}
assert.equal(validateCandidate(rolloutCandidate, 'tests-rollout'), rolloutCandidate)
assert.throws(() => validateCandidate({ ...rolloutCandidate, coverage: rolloutCandidate.coverage.slice(1) }, 'tests-rollout'), /every facet/)
assert.throws(() => validateCandidate({ ...rolloutCandidate, rolloutRequirement: undefined }, 'tests-rollout'), /rolloutRequirement/)
assert.equal(validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], verdict: 'blocked', rationale: 'incorrect' }).verdict, 'passable')
assert.throws(() => validateSynthesis({ blocking: [{ title: 'real' }], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'incorrect' }), /required string/)
const fullFinding = { title: 'Real defect', lens: 'ingress-validation', file: 'src/Server.java', line: 1, trigger: 'malformed request', executionPath: ['request enters', 'write occurs'], violatedContract: 'validation contract', impact: 'bad data', evidence: ['src/Server.java:1'], severity: 'blocking', confidence: 0.9, disconfirmingReason: 'middleware may reject first', suggestedFix: 'validate before write', verification: 'focused malformed request test' }
assert.equal(validateSynthesis({ blocking: [fullFinding], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'incorrect' }).verdict, 'blocked')
assert.throws(() => validateCandidate({ ...rolloutCandidate, coverage: rolloutCandidate.coverage.map((row, index) => index === 0 ? { ...row, status: 'finding' } : row) }, 'tests-rollout'), /matching finding lens/)
assert.equal(validateSynthesis({ blocking: [], nonBlocking: [], unverified: [{ title: 'missing', summary: 'evidence unavailable' }], verdict: 'passable', rationale: 'incorrect' }).verdict, 'unverified')

const routes = discoverRunners({ available: { cursor: true, codex: true, claude: true }, cursorModels: ['gpt-5.6-luna-high'] })
assert.ok(routes.length >= 3)
for (const route of routes) assert.ok(!buildRunnerCommand(route, '/tmp/repo').args.some((arg) => /bypass|danger|yolo|write/.test(arg)))
assert.ok(buildRunnerCommand(routes.find((route) => route.kind === 'codex'), '/tmp/repo').args.includes('read-only'))
assert.equal(assertOutsideRepo('/tmp/elsewhere/run', '/tmp/repo'), '/tmp/elsewhere/run')
assert.throws(() => assertOutsideRepo('/tmp/repo/run', '/tmp/repo'), /outside/)
const plan = makePlan({ h0: 'a'.repeat(40), base: 'b'.repeat(40), diffHash: 'c'.repeat(64) }, ids, routes, 99)
assert.equal(plan.maxWorkers, 6)
assert.ok(plan.graph.at(-1).dependsOn.includes('verification'))

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'be-pr-review-test-'))
try {
  const proof = path.join(temp, 'verification.json')
  fs.writeFileSync(proof, JSON.stringify({ revision: 'head-1', result: 'PASS' }))
  assert.equal(verificationEvidence(proof, 'head-1').status, 'fresh')
  assert.equal(verificationEvidence(proof, 'head-2').status, 'stale')
  fs.writeFileSync(proof, JSON.stringify({ result: 'PASS' }))
  assert.equal(verificationEvidence(proof, 'head-1').status, 'unverified')

  const repo = path.join(temp, 'repo')
  fs.mkdirSync(repo)
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q')
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base')
  fs.writeFileSync(path.join(repo, 'Server.java'), 'class Server { void save() {} }\n')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'change')
  const head = git('rev-parse', 'HEAD')
  fs.writeFileSync(proof, JSON.stringify({ revision: head, result: 'PASS' }))

  const dry = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'dry'), dryRun: true }, { routes: [] })
  assert.equal(dry.audit.status, 'dry-run')
  assert.equal(dry.plan.personas.length, 5)
  assert.ok(fs.existsSync(path.join(temp, 'dry/snapshot/diff.patch')))

  const fakeRoute = { id: 'fake:read-only', kind: 'codex', command: 'unused', model: null }
  let calls = 0
  const execute = async (_route, prompt) => {
    calls++
    if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [], verdict: 'passable', rationale: 'No verified findings' })
    const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
    return JSON.stringify({ persona, coverage: coverageFor(persona), ...(persona === 'tests-rollout' ? { rolloutRequirement: rolloutCandidate.rolloutRequirement } : {}), findings: [] })
  }
  const result = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'run'), verificationReport: proof }, { routes: [fakeRoute], execute })
  assert.equal(result.synthesis.verdict, 'passable')
  assert.equal(result.audit.verification.status, 'fresh')
  assert.equal(result.audit.nodes.length, 5)
  assert.equal(calls, 6)
  for (const file of ['report.json', 'report.md', 'report.html', 'audit.json', 'candidates.json']) assert.ok(fs.existsSync(path.join(temp, 'run', file)), `missing ${file}`)

  fs.writeFileSync(proof, JSON.stringify({ revision: 'other', result: 'PASS' }))
  const stale = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'stale'), verificationReport: proof }, { routes: [fakeRoute], execute })
  assert.equal(stale.synthesis.verdict, 'unverified')

  const allFailed = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'failed') }, { routes: [fakeRoute], execute: async () => { throw new Error('monthly usage limit reached') } })
  assert.equal(allFailed.synthesis.verdict, 'unverified')
  assert.ok(allFailed.report.coverage.every((row) => row.status === 'unverified'))
  assert.ok(fs.existsSync(path.join(temp, 'failed/report.html')))
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}

console.log('PASS: be-pr-review routing, personas, schemas, immutable graph, and verification handoff')
