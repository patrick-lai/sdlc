#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_RUNTIME_POLICY, PERSONA_FACETS, assertOutsideRepo, assertSafeModelId, buildReviewReport, buildRunnerCommand, classifyRunnerFailure, clip, deriveDecision, discoverRunners, executeRunner, makePlan, nativeSynthesisPrompt, normalizeRuntimePolicy, parseArgs, qaEvidence, qaForPrompt, runGraph, selectPersonas, validateCandidate, validateFanoutEvidence, validateNativeSynthesis, validateSynthesis } from './review-graph.mjs'
import { buildReportDocument } from './lib/report.mjs'

assert.deepEqual(parseArgs(['run', '--max-workers', '3', '--dry-run']), { command: 'run', maxWorkers: '3', dryRun: true })
assert.deepEqual(parseArgs(['synthesize', '--run-dir', '/tmp/run', '--portable-cli']), { command: 'synthesize', runDir: '/tmp/run', portableCli: true })
await assert.rejects(runGraph({ command: 'plan', runner: 'codex' }), /explicit portable CLI path/)
assert.deepEqual(parseArgs(['run', '--run-timeout-seconds', '1800', '--node-timeout-seconds', '480', '--synthesis-timeout-seconds', '240', '--max-attempts', '2']), {
  command: 'run',
  runTimeoutSeconds: '1800',
  nodeTimeoutSeconds: '480',
  synthesisTimeoutSeconds: '240',
  maxAttempts: '2',
})
assert.deepEqual(normalizeRuntimePolicy(), DEFAULT_RUNTIME_POLICY)
assert.equal(normalizeRuntimePolicy({ maxAttempts: '9' }).maxAttemptsPerNode, 2)
assert.equal(normalizeRuntimePolicy({ runTimeoutSeconds: '30', nodeTimeoutSeconds: '8', synthesisTimeoutSeconds: '4' }).synthesisReserveMs, 4000)
assert.throws(() => normalizeRuntimePolicy({ maxAttempts: '1.5' }), /integer/)
assert.deepEqual(selectPersonas(['src/server.ts']), ['repository-contract', 'correctness-platform', 'privacy-security-data'])
assert.deepEqual(selectPersonas(['src/Button.tsx']), ['repository-contract', 'correctness-platform', 'privacy-security-data', 'accessibility-ui', 'rollout-gates', 'product-tests'])
assert.throws(() => selectPersonas([], 'accessibility-ui'), /3-6/)
for (const facet of ['ci-surface-parity', 'runtime-config-substitution', 'dependency-resolution-risk', 'dynamic-key-boundaries', 'schema-selection-compatibility', 'temporal-history-cache', 'side-effect-liveness', 'test-oracle-validity']) assert.ok(Object.values(PERSONA_FACETS).flat().some(([id]) => id === facet), `missing historical probe ${facet}`)
assert.equal(Object.values(PERSONA_FACETS).flat().length, 45, 'facet catalogue must stay at 45 probes')
assert.ok(PERSONA_FACETS['rollout-gates'].some(([id, label]) => id === 'fg-cleanup' && /does not preserve controls confined to the discarded branch/.test(label)), 'fg-cleanup must not require losing-branch-only controls on the winning path')
assert.ok(PERSONA_FACETS['privacy-security-data'].some(([id, label]) => id === 'integrity-retries' && /exactly-once/.test(label) && /sessions/.test(label)), 'integrity-retries must cover exactly-once behavior across tabs and sessions')

const routes = discoverRunners({ available: { cursor: true, codex: true, claude: true }, cursorModels: ['gpt-5.6-luna-high', 'cursor-grok-4.6-medium'] })
assert.deepEqual(routes.map((r) => r.id), ['cursor:gpt-5.6-luna-high', 'cursor:cursor-grok-4.6-medium', 'codex:default', 'claude:default'])
assert.deepEqual(discoverRunners({ available: { cursor: false, codex: true, claude: false }, runner: 'codex', model: 'chosen' })[0].model, 'chosen')
assert.equal(discoverRunners({ available: { cursor: true, codex: false, claude: false }, cursorModels: [], model: 'explicit-model' })[0].model, 'explicit-model')
assert.ok(buildRunnerCommand(routes[0], '/tmp/repo', '/tmp/evidence').args.includes('ask'))
assert.ok(buildRunnerCommand(routes[0], '/tmp/repo', '/tmp/evidence').args.includes('/tmp/evidence'))
assert.ok(buildRunnerCommand(routes[0], '/tmp/repo', '/tmp/evidence').args.includes('--trust'))
assert.ok(buildRunnerCommand(routes[2], '/tmp/repo').args.includes('read-only'))
assert.ok(buildRunnerCommand(routes[3], '/tmp/repo').args.includes('plan'))
assert.ok(buildRunnerCommand(routes[3], '/tmp/repo').args.includes('--strict-mcp-config'))
assert.ok(buildRunnerCommand(routes[3], '/tmp/repo').args.includes('{"mcpServers":{}}'))
assert.equal(classifyRunnerFailure(new Error('monthly usage limit reached')), 'capacity')
assert.equal(classifyRunnerFailure(new Error('Workspace Trust Required')), 'auth')
assert.equal(classifyRunnerFailure(new Error('Runner timed out after 10ms')), 'timeout')
assert.equal(classifyRunnerFailure(new Error('Invalid persona result envelope')), 'invalid-output')
for (const route of routes) assert.ok(!buildRunnerCommand(route, '/tmp/repo').args.some((arg) => /bypass|danger|yolo|force/.test(arg)))
assert.throws(() => discoverRunners({ available: { cursor: true, codex: true, claude: true }, runner: 'shell' }), /--runner accepts/)
assert.throws(() => discoverRunners({ available: { cursor: false, codex: true, claude: false }, model: 'evil; rm -rf /' }), /Unsafe model ID/)
assert.equal(assertSafeModelId(null), null)
assert.equal(assertSafeModelId(' gpt-5.6-luna-high '), 'gpt-5.6-luna-high')
assert.throws(() => buildRunnerCommand({ kind: 'codex', command: 'codex', model: '--dangerously-bypass' }, '/tmp/repo'), /Unsafe model ID/)
assert.throws(() => buildRunnerCommand({ kind: 'shell', command: 'sh', model: null }, '/tmp/repo'), /Unsupported runner kind/)
// Cursor routing must not invent a model that the installed CLI never advertised.
const noAdvertised = discoverRunners({ available: { cursor: true, codex: false, claude: false }, cursorModels: [] })
assert.deepEqual(noAdvertised.map((r) => r.model), ['auto'])
assert.ok(!buildRunnerCommand(noAdvertised[0], '/tmp/repo').args.includes('--model'), 'auto must not pass an invented --model')
assert.deepEqual(
  discoverRunners({ available: { cursor: true, codex: false, claude: false }, cursorModels: ['cursor-grok-4.6-medium'] }).map((r) => r.id),
  ['cursor:cursor-grok-4.6-medium', 'cursor:auto'],
)
assert.equal(clip('abcdef', 3).startsWith('abc'), true)
assert.ok(clip('abcdef', 3).includes('truncated'))
assert.equal(clip('abc', 10), 'abc')
assert.equal(qaForPrompt({ status: 'not-run' }).report, null)
assert.equal(qaForPrompt({ status: 'fresh', content: 'x'.repeat(10) }).report, 'x'.repeat(10))
assert.throws(() => assertOutsideRepo('/tmp/repo/run', '/tmp/repo'), /outside the reviewed repository/)
assert.equal(assertOutsideRepo('/tmp/elsewhere/run', '/tmp/repo'), '/tmp/elsewhere/run')

const coverageFor = (persona, status = 'checked') => PERSONA_FACETS[persona].map(([id]) => ({ id, status, summary: `Inspected ${id}`, evidence: [`src/example.ts:1 establishes ${id}`] }))
const writeJsonForTest = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
const candidate = { persona: 'correctness-platform', coverage: coverageFor('correctness-platform'), findings: [{ title: 'Broken state', lens: 'correctness', file: 'src/a.ts', line: 7, trigger: 'Click save', reproduction: 'Enter valid data, click save, and observe the rejected write and lost data.', executionPath: ['save calls write', 'write rejects'], rootCause: 'The changed save path drops the rejection before persisting state.', violatedContract: 'Save must retain data', impact: 'User loses data', evidence: ['caller at src/b.ts:2'], severity: 'blocking', confidence: 0.91, disconfirmingReason: 'A caller may catch the rejection', suggestedFix: 'Handle the rejection', suggestedPatch: 'return write().catch(showSaveError)', verification: 'Exercise rejected write' }] }
assert.equal(validateCandidate(candidate, 'correctness-platform'), candidate)
assert.throws(() => validateCandidate({ ...candidate, coverage: candidate.coverage.slice(1) }, 'correctness-platform'), /every facet/)
assert.throws(() => validateCandidate({ ...candidate, findings: [{ ...candidate.findings[0], evidence: [] }] }, 'correctness-platform'), /evidence/)
assert.throws(() => validateCandidate({ ...candidate, findings: [{ ...candidate.findings[0], rootCause: '' }] }, 'correctness-platform'), /required string/)
assert.throws(() => validateCandidate({ ...candidate, findings: [{ ...candidate.findings[0], suggestedPatch: '' }] }, 'correctness-platform'), /required string/)
const gateCandidate = { persona: 'rollout-gates', coverage: coverageFor('rollout-gates'), gateRequirement: { status: 'required', rationale: 'New user-visible behavior ships independently', evidence: ['src/feature.tsx:10'], keys: ['example.gate'] }, findings: [] }
assert.equal(validateCandidate(gateCandidate, 'rollout-gates'), gateCandidate)
assert.throws(() => validateCandidate({ ...gateCandidate, gateRequirement: undefined }, 'rollout-gates'), /gateRequirement/)
assert.equal(validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No verified findings' }).verdict, 'passable')
assert.equal(validateNativeSynthesis({ h0: 'head-1', agentId: 'native-synthesis-1', synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No verified findings' } }, 'head-1').agentId, 'native-synthesis-1')
assert.throws(() => validateNativeSynthesis({ h0: 'wrong', agentId: 'native-synthesis-1', synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No verified findings' } }, 'head-1'), /H0/)
assert.ok(nativeSynthesisPrompt({ h0: 'head-1', changedFiles: ['src/a.ts'] }, '/tmp/native-run', ['correctness-platform'], { status: 'not-run' }).includes('built-in native synthesis subagent'))
const routineFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Owner checklist', summary: 'Human follow-up only', affectsVerdict: false, verdictImpact: 'none' }], verdict: 'passable', rationale: 'Code is sound' })
assert.equal(routineFollowUp.verdict, 'passable')
const contradictedBlocked = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [], verdict: 'blocked', rationale: 'Model supplied a contradictory verdict' })
assert.equal(contradictedBlocked.verdict, 'passable', 'blocked without blocking evidence must be corrected')
const routineButBlocked = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Owner checklist', summary: 'Human follow-up only', affectsVerdict: false, verdictImpact: 'none' }], verdict: 'blocked', rationale: 'Routine work was misclassified' })
assert.equal(routineButBlocked.verdict, 'passable', 'routine follow-ups cannot sustain a blocked verdict')
const missedCodeBlocker = validateSynthesis({ blocking: [{ title: 'Real code defect' }], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'Model missed its own finding' })
assert.equal(missedCodeBlocker.verdict, 'blocked', 'blocking evidence must override a model pass')
const missedUnknown = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [{ title: 'Missing safety evidence' }], verdict: 'passable', rationale: 'Model missed its own uncertainty' })
assert.equal(missedUnknown.verdict, 'unverified', 'unverified evidence must override a model pass')
const mandatoryFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Mandatory security approval', summary: 'Explicit pre-approval policy is unmet', affectsVerdict: true, verdictImpact: 'blocked' }], verdict: 'passable', rationale: 'Model incorrectly passed it' })
assert.equal(mandatoryFollowUp.verdict, 'blocked')
assert.equal(mandatoryFollowUp.blocking.length, 0, 'mandatory policy must not consume a code-finding slot')
assert.equal(mandatoryFollowUp.operationalFollowUps[0].verdictImpact, 'blocked')
const cappedMandatory = validateSynthesis({ blocking: Array.from({ length: 5 }, (_, i) => ({ title: `code-${i}` })), nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Mandatory security approval', summary: 'Explicit pre-approval policy is unmet', affectsVerdict: true, verdictImpact: 'blocked' }], verdict: 'blocked', rationale: 'Already blocked' })
assert.equal(cappedMandatory.blocking.length, 5)
assert.deepEqual(cappedMandatory.blocking.map((finding) => finding.title), ['code-0', 'code-1', 'code-2', 'code-3', 'code-4'], 'all five code blockers must be preserved')
const uncertainFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Safety evidence missing', summary: 'Cannot establish required isolation', affectsVerdict: true, verdictImpact: 'unverified' }], verdict: 'passable', rationale: 'Model incorrectly passed it' })
assert.equal(uncertainFollowUp.verdict, 'unverified')
assert.equal(uncertainFollowUp.unverified.length, 0, 'policy metadata remains separate from code evidence')
assert.throws(() => validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Missing fields', summary: 'unsafe ambiguity' }], verdict: 'passable', rationale: 'x' }), /affectsVerdict/)
assert.throws(() => validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Contradiction', summary: 'fields disagree', affectsVerdict: false, verdictImpact: 'blocked' }], verdict: 'passable', rationale: 'x' }), /disagree/)
assert.throws(() => validateSynthesis({ blocking: Array(6).fill({}), nonBlocking: [], unverified: [], verdict: 'blocked', rationale: 'x' }), /five/)

const plan = makePlan({ h0: 'a'.repeat(40), base: 'b'.repeat(40), diffHash: 'c'.repeat(64) }, selectPersonas(['x.tsx']), routes, 99)
assert.equal(plan.maxWorkers, 6)
assert.equal(plan.graph.at(-1).id, 'synthesis')
assert.ok(!plan.graph.at(-1).dependsOn.includes('qa-demo'), 'qa-demo is opt-in and must not be a default synthesis dependency')
assert.equal(plan.qa.status, 'not-run')
const optedInPlan = makePlan({ h0: 'a'.repeat(40), base: 'b'.repeat(40), diffHash: 'c'.repeat(64) }, selectPersonas(['x.tsx']), routes, 4, true)
assert.ok(optedInPlan.graph.at(-1).dependsOn.includes('qa-demo'))
assert.equal(plan.routes.length, 6)
assert.equal(plan.runtimePolicy.runTimeoutMs, 25 * 60 * 1000)
assert.equal(plan.runtimePolicy.nodeTimeoutMs, 8 * 60 * 1000)
assert.equal(plan.runtimePolicy.synthesisTimeoutMs, 4 * 60 * 1000)

const fanoutPersonas = selectPersonas(['src/server.ts'])
const overlappingFanout = {
  version: 1,
  mode: 'native-subagent',
  h0: 'head-1',
  agents: fanoutPersonas.map((persona, index) => ({
    agentId: `agent-${index}`,
    parentAgentId: null,
    persona,
    role: 'reviewer',
    depth: 1,
    startedAt: new Date(index * 10).toISOString(),
    finishedAt: new Date(100 + index * 10).toISOString(),
    status: 'ok',
  })),
}
const validFanout = validateFanoutEvidence(overlappingFanout, fanoutPersonas, 'head-1')
assert.equal(validFanout.valid, true)
assert.equal(validFanout.materialOverlap, true)
assert.equal(validFanout.maxObservedConcurrency, 3)
const serialFanout = {
  ...overlappingFanout,
  agents: fanoutPersonas.map((persona, index) => ({
    ...overlappingFanout.agents[index],
    startedAt: new Date(index * 100).toISOString(),
    finishedAt: new Date(index * 100 + 50).toISOString(),
  })),
}
assert.equal(validateFanoutEvidence(serialFanout, fanoutPersonas, 'head-1').valid, false)
assert.ok(validateFanoutEvidence(serialFanout, fanoutPersonas, 'head-1').errors.includes('FANOUT_NO_MATERIAL_OVERLAP'))
assert.equal(validateFanoutEvidence({ ...overlappingFanout, h0: 'wrong' }, fanoutPersonas, 'head-1').valid, false)
const failedReviewerFanout = {
  ...overlappingFanout,
  agents: overlappingFanout.agents.map((agent, index) => index === 0 ? { ...agent, status: 'failed' } : agent),
}
assert.ok(
  validateFanoutEvidence(failedReviewerFanout, fanoutPersonas, 'head-1').errors.includes(`FANOUT_REVIEWER_STATUS_INVALID:${fanoutPersonas[0]}`),
)
const withTwoChildren = {
  ...overlappingFanout,
  agents: [
    ...overlappingFanout.agents,
    ...[1, 2].map((index) => ({
      agentId: `child-${index}`,
      parentAgentId: 'agent-0',
      persona: fanoutPersonas[0],
      role: 'probe',
      depth: 2,
      startedAt: new Date(20 * index).toISOString(),
      finishedAt: new Date(20 * index + 10).toISOString(),
      status: 'ok',
    })),
  ],
}
assert.equal(validateFanoutEvidence(withTwoChildren, fanoutPersonas, 'head-1').valid, true)
const withThirdChild = {
  ...withTwoChildren,
  agents: [...withTwoChildren.agents, { ...withTwoChildren.agents.at(-1), agentId: 'child-3' }],
}
assert.ok(validateFanoutEvidence(withThirdChild, fanoutPersonas, 'head-1').errors.includes('FANOUT_CHILD_LIMIT_EXCEEDED'))
const withDepthThree = {
  ...withTwoChildren,
  agents: [...withTwoChildren.agents, { ...withTwoChildren.agents.at(-1), agentId: 'grandchild', parentAgentId: 'child-1', depth: 3 }],
}
assert.equal(validateFanoutEvidence(withDepthThree, fanoutPersonas, 'head-1').valid, false)

const acceptedDecision = deriveDecision({
  synthesis: { verdict: 'passable' },
  nodeResults: fanoutPersonas.map((persona) => ({ persona, status: 'ok' })),
  coverage: [{ status: 'checked' }],
  fanoutValidation: validFanout,
  headUnchanged: true,
  deadlineExceeded: false,
  qa: { status: 'not-run' },
  qaSupplied: false,
  synthesisStatus: 'ok',
})
assert.deepEqual(acceptedDecision, { decision: 'ACCEPT', reasonCodes: [] })
const rejectedDecision = deriveDecision({
  synthesis: { verdict: 'blocked' },
  nodeResults: [{ status: 'failed' }],
  coverage: [{ status: 'unverified' }],
  fanoutValidation: validateFanoutEvidence(serialFanout, fanoutPersonas, 'head-1'),
  headUnchanged: false,
  deadlineExceeded: true,
  qa: { status: 'stale' },
  qaSupplied: true,
  synthesisStatus: 'failed',
})
assert.equal(rejectedDecision.decision, 'REJECT')
for (const reason of ['BLOCKING_FINDING', 'UNVERIFIED_COVERAGE', 'FAILED_REVIEWER', 'INVALID_FANOUT', 'STALE_HEAD', 'DEADLINE_EXCEEDED', 'SYNTHESIS_FAILED', 'QA_STALE']) {
  assert.ok(rejectedDecision.reasonCodes.includes(reason), `missing decision reason ${reason}`)
}
assert.ok(deriveDecision({
  synthesis: { verdict: 'passable' },
  nodeResults: fanoutPersonas.map((persona) => ({ persona, status: 'ok' })),
  coverage: [{ status: 'checked' }],
  fanoutValidation: validFanout,
  headUnchanged: true,
  deadlineExceeded: false,
  qa: { status: 'fresh', result: 'FAIL' },
  qaSupplied: true,
  synthesisStatus: 'ok',
}).reasonCodes.includes('QA_FAILED'))

{
  const signals = []
  const timers = []
  const fakeChild = new EventEmitter()
  fakeChild.pid = 4321
  fakeChild.stdout = new PassThrough()
  fakeChild.stderr = new PassThrough()
  fakeChild.stdin = { end() {} }
  fakeChild.kill = (signal) => signals.push(['child', signal])
  const pending = executeRunner(
    { id: 'codex:fake', kind: 'codex', command: 'unused', model: null },
    'prompt',
    '/tmp/repo',
    '/tmp/evidence',
    { timeoutMs: 10, killGraceMs: 2 },
    {
      spawn: () => fakeChild,
      kill: (pid, signal) => signals.push([pid, signal]),
      setTimeout: (fn) => { timers.push(fn); return timers.length },
      clearTimeout: () => {},
    },
  )
  timers.shift()()
  await assert.rejects(pending, /timed out/)
  timers.shift()()
  if (process.platform === 'win32') {
    assert.deepEqual(signals, [['child', 'SIGTERM'], ['child', 'SIGKILL']])
  } else {
    assert.deepEqual(signals, [[-4321, 'SIGTERM'], [-4321, 'SIGKILL']])
  }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-pr-review-test-'))
try {
  const fresh = path.join(temp, 'qa.json')
  fs.writeFileSync(fresh, JSON.stringify({ revision: 'head-1', result: 'PASS' }))
  assert.equal(qaEvidence(fresh, 'head-1').status, 'fresh')
  assert.equal(qaEvidence(fresh, 'head-1').result, 'PASS')
  const failedFresh = path.join(temp, 'qa-fail.json')
  fs.writeFileSync(failedFresh, JSON.stringify({ revision: 'head-1', result: 'FAIL' }))
  assert.equal(qaEvidence(failedFresh, 'head-1').status, 'fresh')
  assert.equal(qaEvidence(failedFresh, 'head-1').result, 'FAIL')
  assert.equal(qaEvidence(fresh, 'head-2').status, 'stale')
  const unverifiable = path.join(temp, 'qa.md')
  fs.writeFileSync(unverifiable, '# QA report\nNo machine-readable revision')
  assert.equal(qaEvidence(unverifiable, 'head-1').status, 'unverified')
  const repo = path.join(temp, 'repo')
  fs.mkdirSync(repo)
  const git = (...args) => {
    const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git('init', '-q')
  fs.writeFileSync(path.join(repo, 'package.json'), '{"private":true}\n')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base')
  fs.writeFileSync(path.join(repo, 'Button.tsx'), 'export const Button = () => <button>Save</button>\n')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'change')
  const head = git('rev-parse', 'HEAD')
  fs.writeFileSync(fresh, JSON.stringify({ revision: head, result: 'PASS' }))
  const nativePlanDir = path.join(temp, 'native-plan')
  const nativePlan = await runGraph(
    { command: 'plan', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: nativePlanDir },
    { discoverRunners: () => { throw new Error('plan must not discover external model CLIs') } },
  )
  assert.equal(nativePlan.audit.status, 'dry-run')
  assert.ok(nativePlan.plan.routes.every((entry) => entry.route === null), 'native plan must expose no external routes')
  assert.ok(nativePlan.commands.every((entry) => entry.command === null), 'native plan must emit no external CLI commands')
  assert.ok(fs.existsSync(path.join(nativePlanDir, 'prompts', 'synthesis.txt')), 'native plan must emit a built-in synthesis prompt')
  assert.ok(fs.readFileSync(path.join(nativePlanDir, 'prompts', 'synthesis.txt'), 'utf8').includes('do not invoke cursor-agent, claude, codex'))
  const planBytesBeforeNativeSynthesis = fs.readFileSync(path.join(nativePlanDir, 'plan.json'))
  const nativeBase = Date.now()
  for (const persona of nativePlan.plan.personas) {
    writeJsonForTest(path.join(nativePlanDir, 'nodes', `${persona}.json`), {
      persona,
      coverage: coverageFor(persona),
      ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'not-required', rationale: 'No independently releasable behavior', evidence: ['Button.tsx:1'], keys: [] } } : {}),
      findings: [],
    })
  }
  writeJsonForTest(path.join(nativePlanDir, 'fanout.json'), {
    version: 1,
    mode: 'native-subagent',
    h0: head,
    agents: nativePlan.plan.personas.map((persona, index) => ({
      agentId: `native-reviewer-${index}`,
      parentAgentId: null,
      persona,
      role: 'reviewer',
      depth: 1,
      startedAt: new Date(nativeBase + index * 10).toISOString(),
      finishedAt: new Date(nativeBase + 1000 + index * 10).toISOString(),
      status: 'ok',
    })),
  })
  writeJsonForTest(path.join(nativePlanDir, 'candidates.json'), [{ title: 'stale candidate must be discarded' }])
  const nativeSynthesisFile = path.join(nativePlanDir, 'native-synthesis.json')
  writeJsonForTest(nativeSynthesisFile, {
    h0: head,
    agentId: 'native-synthesis-1',
    synthesis: {
      blocking: [],
      nonBlocking: [],
      unverified: [],
      operationalFollowUps: [],
      verdict: 'passable',
      rationale: 'Native reviewers found no verified defects.',
    },
  })
  const nativeResult = await runGraph(
    { command: 'synthesize', runDir: nativePlanDir, nativeSynthesis: nativeSynthesisFile },
    {
      discoverRunners: () => { throw new Error('native synthesis must not discover external model CLIs') },
      execute: () => { throw new Error('native synthesis must not execute an external model CLI') },
    },
  )
  assert.equal(nativeResult.synthesis.decision, 'ACCEPT')
  assert.equal(nativeResult.audit.synthesis.route, 'native-subagent:native-synthesis-1')
  assert.deepEqual(nativeResult.audit.routes, [])
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(nativePlanDir, 'candidates.json'))), [], 'native synthesis must rebuild candidates from validated node files')
  assert.deepEqual(fs.readFileSync(path.join(nativePlanDir, 'plan.json')), planBytesBeforeNativeSynthesis, 'native synthesis must preserve the frozen plan bytes')

  const shimDir = path.join(temp, 'model-cli-shims')
  fs.mkdirSync(shimDir)
  const cliMarkers = []
  for (const command of ['cursor-agent', 'claude', 'codex']) {
    const marker = path.join(temp, `${command}-invoked`)
    cliMarkers.push(marker)
    fs.writeFileSync(path.join(shimDir, command), `#!/bin/sh\nprintf invoked > '${marker}'\nexit 97\n`)
    fs.chmodSync(path.join(shimDir, command), 0o755)
  }
  const nativeEnv = { ...process.env, PATH: `${shimDir}:${process.env.PATH}` }
  const blackBoxPlan = spawnSync(process.execPath, [
    path.resolve('skills/fe-pr-review/scripts/review-graph.mjs'),
    'plan',
    '--repo-root', repo,
    '--base', 'HEAD^',
    '--head', 'HEAD',
    '--output', path.join(temp, 'black-box-native-plan'),
  ], { encoding: 'utf8', env: nativeEnv })
  assert.equal(blackBoxPlan.status, 0, blackBoxPlan.stderr)
  const blackBoxSynthesis = spawnSync(process.execPath, [
    path.resolve('skills/fe-pr-review/scripts/review-graph.mjs'),
    'synthesize',
    '--run-dir', nativePlanDir,
    '--native-synthesis', nativeSynthesisFile,
  ], { encoding: 'utf8', env: nativeEnv })
  assert.equal(blackBoxSynthesis.status, 0, blackBoxSynthesis.stderr)
  assert.ok(cliMarkers.every((marker) => !fs.existsSync(marker)), 'native plan and synthesis must not invoke Cursor, Claude, or Codex CLI executables')

  const missingNativeDir = path.join(temp, 'missing-native-synthesis')
  fs.cpSync(nativePlanDir, missingNativeDir, { recursive: true })
  fs.rmSync(path.join(missingNativeDir, 'native-synthesis.json'))
  fs.rmSync(path.join(missingNativeDir, 'audit.json'))
  const missingNative = await runGraph(
    { command: 'synthesize', runDir: missingNativeDir },
    {
      discoverRunners: () => { throw new Error('missing native synthesis must not discover external model CLIs') },
      execute: () => { throw new Error('missing native synthesis must not execute an external model CLI') },
    },
  )
  assert.equal(missingNative.synthesis.decision, 'REJECT')
  assert.ok(missingNative.synthesis.reasonCodes.includes('SYNTHESIS_FAILED'))
  assert.equal(missingNative.audit.synthesis.attempts.length, 0)
  assert.ok(missingNative.synthesis.unverified[0].summary.includes('No external CLI fallback was attempted'))

  const dry = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'dry-run'), dryRun: true }, { routes: [] })
  assert.equal(dry.audit.status, 'dry-run')
  assert.ok(dry.plan.routes.every((entry) => entry.route === null), 'dry-run must work without a provider')
  assert.ok(fs.existsSync(path.join(temp, 'dry-run/snapshot/diff.patch')))
  assert.ok(fs.readFileSync(path.join(temp, 'dry-run/snapshot/diff.patch'), 'utf8').includes('Button.tsx'))

  const previewed = await runGraph(
    { command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'dry-run-routed'), dryRun: true },
    { routes: [{ id: 'codex:default', kind: 'codex', command: 'codex', model: null }] },
  )
  assert.equal(previewed.commands.length, 6)
  assert.ok(previewed.commands.every((entry) => entry.args.includes('read-only')), 'dry-run must preview read-only commands')
  assert.throws(
    () => fs.readFileSync(path.join(repo, 'plan.json')),
    /ENOENT/,
    'the graph must never write into the reviewed repository',
  )
  await assert.rejects(
    runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(repo, 'inside'), dryRun: true }, { routes: [] }),
    /outside the reviewed repository/,
  )
  const noRunnerDir = path.join(temp, 'no-runner')
  const noRunner = await runGraph(
    { command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: noRunnerDir },
    { routes: [] },
  )
  assert.equal(noRunner.synthesis.decision, 'REJECT')
  assert.ok(noRunner.synthesis.reasonCodes.includes('SYNTHESIS_FAILED'))
  assert.ok(fs.existsSync(path.join(noRunnerDir, 'report.html')), 'missing runners must still emit a truthful report')
  const runDir = path.join(temp, 'run')
  const fakeRoute = { id: 'fake:read-only', kind: 'codex', command: 'unused', model: null }
  let calls = 0
  const execute = async (_route, prompt) => {
    calls++
    if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No verified candidates' })
    const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
    return JSON.stringify({ persona, coverage: coverageFor(persona), ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'required', rationale: 'New behavior is independently reversible', evidence: ['Button.tsx:1'], keys: ['example.gate'] } } : {}), findings: [] })
  }
  const result = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: runDir, qaReport: fresh }, { routes: [fakeRoute], execute })
  assert.equal(result.audit.status, 'complete')
  assert.equal(result.audit.qa.status, 'fresh')
  assert.equal(result.audit.nodes.length, 6)
  assert.equal(calls, 7)
  assert.equal(result.synthesis.decision, 'ACCEPT')
  assert.deepEqual(result.synthesis.reasonCodes, [])
  assert.equal(result.audit.fanOut.validation.valid, true)
  assert.ok(result.audit.fanOut.validation.maxObservedConcurrency >= 4)
  assert.ok(fs.existsSync(path.join(runDir, 'fanout.json')))
  assert.ok(fs.existsSync(path.join(runDir, 'report.md')))
  assert.ok(fs.existsSync(path.join(runDir, 'report.html')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'))).decision.value, 'ACCEPT')
  const reportText = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8')
  for (const marker of ['## Feature-gate decision', '### Full feature-gate path', 'fg-off-path', 'fg-persistence-rollback', '## Every review facet']) assert.ok(reportText.includes(marker), `report missing ${marker}`)
  assert.equal(result.report.featureGate.status, 'required')
  calls = 0
  const resynthesized = await runGraph({ command: 'synthesize', runDir, qaReport: fresh }, { routes: [fakeRoute], execute })
  assert.equal(resynthesized.synthesis.verdict, 'passable')
  assert.equal(resynthesized.synthesis.decision, 'ACCEPT')
  assert.equal(calls, 1, 'synthesize must not rerun reviewer nodes')
  // Material fan-out: each persona's findings survive into candidates.json with attribution.
  const findingRunDir = path.join(temp, 'finding-run')
  const seenPrompts = []
  const executeWithFindings = async (_route, prompt) => {
    seenPrompts.push(prompt)
    if (prompt.includes('independent synthesis judge')) {
      const payload = JSON.parse(prompt.match(/CANDIDATES \(untrusted claims\)\n([\s\S]*?)\n\nQA EVIDENCE/)[1])
      return JSON.stringify({
        blocking: payload.filter((f) => f.severity === 'blocking').slice(0, 5),
        nonBlocking: [],
        unverified: [],
        verdict: payload.length ? 'blocked' : 'passable',
        rationale: `Synthesized ${payload.length} candidate(s)`,
      })
    }
    const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
    return `\`\`\`json\n${JSON.stringify({ persona, coverage: coverageFor(persona, 'finding'), ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'required', rationale: 'New behavior is independently releasable', evidence: ['Button.tsx:1'], keys: ['example.gate'] } } : {}), findings: [{ ...candidate.findings[0], title: `${persona} finding` }] })}\n\`\`\``
  }
  const withFindings = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: findingRunDir }, { routes: [fakeRoute], execute: executeWithFindings })
  const emitted = JSON.parse(fs.readFileSync(path.join(findingRunDir, 'candidates.json'), 'utf8'))
  assert.equal(emitted.length, 6, 'every reviewer node contributes candidates')
  assert.deepEqual([...new Set(emitted.map((f) => f.persona))].sort(), selectPersonas(['x.tsx']).slice().sort())
  assert.ok(emitted.every((f) => f.sourceRoute === 'fake:read-only'))
  assert.equal(withFindings.synthesis.verdict, 'blocked')
  assert.equal(withFindings.synthesis.decision, 'REJECT')
  assert.equal(withFindings.report.decision.value, 'REJECT')
  assert.ok(withFindings.synthesis.reasonCodes.includes('BLOCKING_FINDING'))
  assert.equal(withFindings.audit.candidateCount, 6)
  assert.equal(withFindings.audit.parseFailures, 0)
  assert.ok(withFindings.audit.nodes.every((node) => node.findings === 1))
  assert.ok(seenPrompts.some((p) => p.includes('Button.tsx')), 'reviewer prompts must carry the immutable diff')
  assert.ok(seenPrompts.every((p) => p.includes('untrusted')), 'every prompt carries the untrusted-input warning')
  assert.ok(seenPrompts.every((p) => p.includes('FEATURE-GATE CLEANUP FALSE-POSITIVE GUARD')), 'every reviewer and synthesizer must receive the cleanup guard')
  assert.ok(seenPrompts.every((p) => p.includes('hypothetical, not a reachable trigger')), 'cleanup reviews must reject hypothetical still-off cohorts')
  assert.ok(seenPrompts.every((p) => p.includes('nested gate or side effect used only by the losing branch is retired with that branch')), 'cleanup reviews must not preserve losing-branch-only controls')
  for (const probe of ['ci-surface-parity', 'runtime-config-substitution', 'dependency-resolution-risk', 'dynamic-key-boundaries', 'schema-selection-compatibility', 'temporal-history-cache', 'side-effect-liveness', 'test-oracle-validity']) {
    assert.ok(seenPrompts.some((prompt) => prompt.includes(`\"id\":\"${probe}\"`)), `review prompts missing historical probe ${probe}`)
  }
  assert.ok(!fs.existsSync(path.join(findingRunDir, 'nodes', 'missing.json')))
  assert.equal(fs.readdirSync(path.join(findingRunDir, 'nodes')).length, 6)

  // Stale QA evidence can never round up to a pass.
  const staleQa = path.join(temp, 'stale-qa.json')
  fs.writeFileSync(staleQa, JSON.stringify({ revision: 'some-other-head', result: 'PASS' }))
  const staleRun = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'stale-run'), qaReport: staleQa }, { routes: [fakeRoute], execute })
  assert.equal(staleRun.audit.qa.status, 'stale')
  assert.equal(staleRun.synthesis.verdict, 'unverified', 'stale QA evidence is never a pass')
  assert.equal(staleRun.synthesis.decision, 'REJECT')
  assert.ok(staleRun.synthesis.reasonCodes.includes('QA_STALE'))
  assert.equal(staleRun.audit.qa.content, undefined, 'audit must not inline QA report content')

  // Markdown QA reports can still declare their tested revision.
  const markdownQa = path.join(temp, 'qa-with-revision.md')
  fs.writeFileSync(markdownQa, `# QA report\n\n- revision: ${head}\n\nAll assertions passed.\n`)
  assert.equal(qaEvidence(markdownQa, head).status, 'fresh')
  assert.equal(qaEvidence(markdownQa, 'other').status, 'stale')
  assert.equal(qaEvidence(path.join(temp, 'missing-report.json'), head).status, 'unverified')

  const failedRunDir = path.join(temp, 'failed-run')
  const executeWithFailure = async (_route, prompt) => {
    if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No candidates' })
    const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
    if (persona === 'privacy-security-data') throw new Error('simulated reviewer failure')
    return JSON.stringify({ persona, coverage: coverageFor(persona), ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'not-required', rationale: 'No independently releasable behavior', evidence: ['Button.tsx:1'], keys: [] } } : {}), findings: [] })
  }
  const failedRun = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: failedRunDir }, { routes: [fakeRoute], execute: executeWithFailure })
  assert.equal(failedRun.synthesis.verdict, 'unverified', 'failed reviewer evidence cannot synthesize to passable')
  assert.ok(failedRun.synthesis.reasonCodes.includes('FAILED_REVIEWER'))
  const executeWithUnknownGate = async (_route, prompt) => {
    if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No findings' })
    const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
    const coverage = coverageFor(persona)
    if (persona === 'rollout-gates') coverage[0] = { ...coverage[0], status: 'unverified', summary: 'Gate requirement could not be established', evidence: ['No linked rollout decision was available'] }
    return JSON.stringify({ persona, coverage, ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'unverified', rationale: 'Product rollout intent is missing', evidence: ['No linked rollout decision was available'], keys: [] } } : {}), findings: [] })
  }
  const unknownGateRun = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'unknown-gate-run') }, { routes: [fakeRoute], execute: executeWithUnknownGate })
  assert.equal(unknownGateRun.synthesis.verdict, 'unverified', 'an unknown feature-gate requirement cannot pass')
  assert.equal(unknownGateRun.report.featureGate.status, 'unverified')
  const allFailedDir = path.join(temp, 'all-failed-run')
  const allFailed = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: allFailedDir }, { routes: [fakeRoute], execute: async () => { throw new Error('monthly usage limit reached') } })
  assert.equal(allFailed.audit.status, 'unverified')
  assert.equal(allFailed.audit.synthesis.status, 'failed')
  assert.equal(allFailed.synthesis.verdict, 'unverified')
  assert.equal(allFailed.synthesis.decision, 'REJECT')
  assert.ok(allFailed.synthesis.reasonCodes.includes('SYNTHESIS_FAILED'))
  assert.equal(allFailed.report.coverage.length, 45)
  assert.ok(allFailed.report.coverage.every((row) => row.status === 'unverified'))
  assert.ok(fs.existsSync(path.join(allFailedDir, 'report.html')), 'failed synthesis must still emit a truthful report')

  const serialNativeDir = path.join(temp, 'serial-native')
  fs.cpSync(runDir, serialNativeDir, { recursive: true })
  fs.rmSync(path.join(serialNativeDir, 'audit.json'))
  fs.rmSync(path.join(serialNativeDir, 'candidates.json'))
  const serialBase = Date.now()
  writeJsonForTest(path.join(serialNativeDir, 'fanout.json'), {
    version: 1,
    mode: 'native-subagent',
    h0: head,
    agents: result.plan.personas.map((persona, index) => ({
      agentId: `native-${index}`,
      parentAgentId: null,
      persona,
      role: 'reviewer',
      depth: 1,
      startedAt: new Date(serialBase + index * 100).toISOString(),
      finishedAt: new Date(serialBase + index * 100 + 50).toISOString(),
      status: 'ok',
    })),
  })
  calls = 0
  const serialNative = await runGraph({ command: 'synthesize', runDir: serialNativeDir, qaReport: fresh }, { routes: [fakeRoute], execute })
  assert.equal(serialNative.synthesis.verdict, 'passable')
  assert.equal(serialNative.synthesis.decision, 'REJECT')
  assert.equal(serialNative.report.decision.value, 'REJECT')
  assert.ok(serialNative.synthesis.reasonCodes.includes('INVALID_FANOUT'))
  assert.equal(calls, 1)
  assert.ok(fs.existsSync(path.join(serialNativeDir, 'candidates.json')), 'native synthesis must derive candidates from node files')

  const missingFanoutDir = path.join(temp, 'missing-fanout')
  fs.cpSync(runDir, missingFanoutDir, { recursive: true })
  fs.rmSync(path.join(missingFanoutDir, 'audit.json'))
  fs.rmSync(path.join(missingFanoutDir, 'fanout.json'))
  const missingFanout = await runGraph({ command: 'synthesize', runDir: missingFanoutDir, qaReport: fresh }, { routes: [fakeRoute], execute })
  assert.equal(missingFanout.synthesis.decision, 'REJECT')
  assert.ok(missingFanout.synthesis.reasonCodes.includes('INVALID_FANOUT'))

  let deadlineClock = 0
  const deadlineRun = await runGraph(
    {
      command: 'run',
      repoRoot: repo,
      base: 'HEAD^',
      head: 'HEAD',
      output: path.join(temp, 'deadline-run'),
      maxWorkers: '1',
      runTimeoutSeconds: '100',
      nodeTimeoutSeconds: '20',
      synthesisTimeoutSeconds: '10',
      deadlineEpochMs: '30000',
    },
    {
      routes: [fakeRoute],
      now: () => deadlineClock,
      execute: async (_route, prompt) => {
        deadlineClock += 15000
        const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
        return JSON.stringify({ persona, coverage: coverageFor(persona), findings: [] })
      },
    },
  )
  assert.equal(deadlineRun.audit.runtime.policy.runTimeoutMs, 100000)
  assert.equal(deadlineRun.audit.runtime.deadlineAt, new Date(30000).toISOString())
  assert.equal(deadlineRun.audit.runtime.exceeded, true)
  assert.equal(deadlineRun.synthesis.decision, 'REJECT')
  assert.ok(deadlineRun.synthesis.reasonCodes.includes('DEADLINE_EXCEEDED'))
  assert.ok(deadlineRun.audit.nodes.some((node) => node.attempts.some((attempt) => attempt.category === 'synthesis-reserve')), 'reviewers must stop when synthesis reserve begins')

  const timeoutCalls = []
  let reserveClock = 0
  await runGraph(
    {
      command: 'run',
      repoRoot: repo,
      base: 'HEAD^',
      head: 'HEAD',
      output: path.join(temp, 'reserve-run'),
      maxWorkers: '1',
      runTimeoutSeconds: '41',
      nodeTimeoutSeconds: '80',
      synthesisTimeoutSeconds: '20',
    },
    {
      routes: [fakeRoute],
      now: () => reserveClock,
      execute: async (_route, prompt, _repoRoot, _runDir, runtime) => {
        timeoutCalls.push(runtime.timeoutMs)
        if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No findings' })
        reserveClock = 22_000
        const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
        return JSON.stringify({ persona, coverage: coverageFor(persona), findings: [] })
      },
    },
  )
  assert.deepEqual(timeoutCalls, [21_000, 19_000], 'reviewer timeout must preserve synthesis reserve and synthesis must use only the remaining deadline')

  const breakerRoutes = [
    { id: 'codex:fake', kind: 'codex', command: 'unused', model: null },
    { id: 'claude:fake', kind: 'claude', command: 'unused', model: null },
  ]
  const providerCalls = []
  const breakerRun = await runGraph(
    { command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'breaker-run'), maxWorkers: '1' },
    {
      routes: breakerRoutes,
      execute: async (route, prompt) => {
        providerCalls.push(route.kind)
        if (route.kind === 'codex') throw new Error('Runner timed out after 1ms')
        if (prompt.includes('independent synthesis judge')) return JSON.stringify({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No findings' })
        const persona = prompt.match(/"persona":"([^"]+)"/)?.[1]
        return JSON.stringify({
          persona,
          coverage: coverageFor(persona),
          ...(persona === 'rollout-gates' ? { gateRequirement: { status: 'not-required', rationale: 'No independently releasable behavior', evidence: ['Button.tsx:1'], keys: [] } } : {}),
          findings: [],
        })
      },
    },
  )
  assert.equal(providerCalls.filter((kind) => kind === 'codex').length, 1, 'a provider timeout must open the provider-kind breaker immediately')
  assert.equal(breakerRun.audit.providerBreakers.codex, 'timeout')
  assert.ok(breakerRun.audit.nodes.every((node) => node.attempts.filter((attempt) => attempt.status !== 'skipped').length <= 2), 'reviewer attempts must never exceed two')

  const helpResult = spawnSync(process.execPath, [path.resolve('skills/fe-pr-review/scripts/review-graph.mjs'), 'help'], { encoding: 'utf8' })
  assert.equal(helpResult.status, 0, helpResult.stderr)
  for (const flag of ['--run-timeout-seconds', '--node-timeout-seconds', '--synthesis-timeout-seconds', '--deadline-epoch-ms', '--max-attempts']) {
    assert.ok(helpResult.stdout.includes(flag), `help missing ${flag}`)
  }

  const report = buildReviewReport({ snapshot: { h0: head, base: 'base', diffHash: 'hash' }, synthesis: { blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Owner checklist', summary: 'Human follow-up only', affectsVerdict: false, verdictImpact: 'none' }], verdict: 'passable', rationale: 'clear' }, qa: { status: 'not-run', reason: 'No matching story' }, selected: ['rollout-gates'], nodeResults: [{ persona: 'rollout-gates', status: 'ok', value: gateCandidate }] })
  assert.ok(report.markdown.includes('No matching story'))
  assert.ok(report.markdown.includes('Operational follow-ups'))
  assert.equal(report.coverage.length, PERSONA_FACETS['rollout-gates'].length)
  assert.ok(report.html.includes('Full feature-gate path'))
  assert.ok(report.html.includes('id="fe-review-report"'))
  assert.ok(!report.html.includes('__FE_REVIEW_REPORT_JSON__'))
  assert.ok(report.html.includes('Every review facet'))
  assert.ok(report.html.includes('Executive summary'))
  assert.ok(report.html.includes('How to read this report'))
  assert.ok(report.html.includes('id="top-jump"'))
  assert.ok(report.html.includes('Read in order'))
  assert.ok(report.html.includes('revealHashTarget'))
  assert.ok(!report.html.includes('const URL_RE'), 'URL regex must not be a late const: findings render before it would initialize')
  const passExec = buildReportDocument({
    snapshot: { h0: head, base: 'base', diffHash: 'hash' },
    synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'clear' },
    qa: { status: 'not-run' },
    nodeResults: [],
    selected: [],
    coverage: [],
  })
  assert.match(passExec.executive.decision, /mergeable/i)
  assert.match(passExec.executive.nextStep, /approve/i)
  const failExec = buildReportDocument({
    snapshot: { h0: head, base: 'base', diffHash: 'hash' },
    synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'clear' },
    qa: { status: 'fresh', revision: head, result: 'FAIL', reason: 'Assertions failed' },
    nodeResults: [],
    selected: [],
    coverage: [],
  })
  assert.ok(!failExec.executive.bullets.some((line) => /passed/i.test(line)), 'fresh FAIL QA must not read as passed')
  assert.ok(failExec.executive.bullets.some((line) => /failed/i.test(line)))
  assert.ok(!/mergeable/i.test(failExec.executive.decision), 'fresh FAIL QA must not look mergeable')
  assert.match(failExec.executive.decision, /QA/i)
  assert.match(failExec.executive.nextStep, /QA/i)
  for (const result of ['PARTIAL', 'BLOCKED']) {
    const doc = buildReportDocument({
      snapshot: { h0: head, base: 'base', diffHash: 'hash' },
      synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'clear' },
      qa: { status: 'fresh', revision: head, result, reason: result },
      nodeResults: [],
      selected: [],
      coverage: [],
    })
    assert.ok(!/mergeable/i.test(doc.executive.decision), `fresh ${result} QA must not look mergeable`)
    assert.match(doc.executive.nextStep, /QA/i)
  }
  assert.match(report.html, /try\s*\{\s*id\s*=\s*decodeURIComponent/)
  const duplicateDoc = buildReportDocument({
    snapshot: { h0: head, base: 'base', diffHash: 'hash' },
    synthesis: {
      blocking: [
        { ...candidate.findings[0], title: 'Duplicate title' },
        { ...candidate.findings[0], title: 'Duplicate title' },
      ],
      nonBlocking: [],
      unverified: [],
      verdict: 'blocked',
      rationale: 'dup ids',
    },
    qa: { status: 'not-run' },
    nodeResults: [],
    selected: [],
    coverage: [],
  })
  assert.equal(new Set(duplicateDoc.findings.map((f) => f.id)).size, duplicateDoc.findings.length)
  const xssDoc = buildReportDocument({
    snapshot: { h0: head, base: 'base', diffHash: 'hash' },
    synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'x' },
    qa: { status: 'not-run' },
    nodeResults: [],
    selected: ['rollout-gates'],
    coverage: [{ persona: 'rollout-gates', id: 'fg-off-path', status: 'checked', summary: 'ok', evidence: ['<img src=x onerror=alert(1)>'] }],
    featureGate: { status: 'required', keys: ['k'], rationale: 'r', evidence: ['<script>alert(1)</script>'] },
  })
  const xssHtml = buildReviewReport({
    snapshot: { h0: head, base: 'base', diffHash: 'hash' },
    synthesis: { blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'x' },
    qa: { status: 'not-run' },
    nodeResults: [{ persona: 'rollout-gates', status: 'ok', value: gateCandidate }],
    selected: ['rollout-gates'],
    coverage: xssDoc.coverage,
    featureGate: xssDoc.featureGate,
  }).html
  assert.ok(!xssHtml.includes('<img src=x onerror'), 'raw HTML tags must not appear unescaped in the report file')
  assert.ok(xssHtml.includes('u003c'), 'angle brackets in payload should be escaped before embed')
  const help = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
  for (const marker of ['qa-demo', 'H0', 'UNVERIFIED', 'Agent agreement is not proof', 'review-graph.mjs']) assert.ok(help.includes(marker), `missing ${marker}`)
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
console.log('PASS: fe-pr-review routing, personas, schemas, graph contract, and QA handoff')
