#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { PERSONA_FACETS, assertOutsideRepo, assertSafeModelId, buildReviewReport, buildRunnerCommand, classifyRunnerFailure, clip, discoverRunners, makePlan, parseArgs, qaEvidence, qaForPrompt, runGraph, selectPersonas, validateCandidate, validateSynthesis } from './review-graph.mjs'

assert.deepEqual(parseArgs(['run', '--max-workers', '3', '--dry-run']), { command: 'run', maxWorkers: '3', dryRun: true })
assert.deepEqual(selectPersonas(['src/server.ts']), ['repository-contract', 'correctness-platform', 'privacy-security-data'])
assert.deepEqual(selectPersonas(['src/Button.tsx']), ['repository-contract', 'correctness-platform', 'privacy-security-data', 'accessibility-ui', 'rollout-gates', 'product-tests'])
assert.throws(() => selectPersonas([], 'accessibility-ui'), /3-6/)

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
const candidate = { persona: 'correctness-platform', coverage: coverageFor('correctness-platform'), findings: [{ title: 'Broken state', lens: 'correctness', file: 'src/a.ts', line: 7, trigger: 'Click save', executionPath: ['save calls write', 'write rejects'], violatedContract: 'Save must retain data', impact: 'User loses data', evidence: ['caller at src/b.ts:2'], severity: 'blocking', confidence: 0.91, disconfirmingReason: 'A caller may catch the rejection', suggestedFix: 'Handle the rejection', verification: 'Exercise rejected write' }] }
assert.equal(validateCandidate(candidate, 'correctness-platform'), candidate)
assert.throws(() => validateCandidate({ ...candidate, coverage: candidate.coverage.slice(1) }, 'correctness-platform'), /every facet/)
assert.throws(() => validateCandidate({ ...candidate, findings: [{ ...candidate.findings[0], evidence: [] }] }, 'correctness-platform'), /evidence/)
const gateCandidate = { persona: 'rollout-gates', coverage: coverageFor('rollout-gates'), gateRequirement: { status: 'required', rationale: 'New user-visible behavior ships independently', evidence: ['src/feature.tsx:10'], keys: ['example.gate'] }, findings: [] }
assert.equal(validateCandidate(gateCandidate, 'rollout-gates'), gateCandidate)
assert.throws(() => validateCandidate({ ...gateCandidate, gateRequirement: undefined }, 'rollout-gates'), /gateRequirement/)
assert.equal(validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], verdict: 'passable', rationale: 'No verified findings' }).verdict, 'passable')
const routineFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Owner checklist', summary: 'Human follow-up only', affectsVerdict: false, verdictImpact: 'none' }], verdict: 'passable', rationale: 'Code is sound' })
assert.equal(routineFollowUp.verdict, 'passable')
const mandatoryFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Mandatory security approval', summary: 'Explicit pre-approval policy is unmet', affectsVerdict: true, verdictImpact: 'blocked' }], verdict: 'passable', rationale: 'Model incorrectly passed it' })
assert.equal(mandatoryFollowUp.verdict, 'blocked')
assert.equal(mandatoryFollowUp.blocking.at(-1).source, 'operational-follow-up')
const cappedMandatory = validateSynthesis({ blocking: Array.from({ length: 5 }, (_, i) => ({ title: `code-${i}` })), nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Mandatory security approval', summary: 'Explicit pre-approval policy is unmet', affectsVerdict: true, verdictImpact: 'blocked' }], verdict: 'blocked', rationale: 'Already blocked' })
assert.equal(cappedMandatory.blocking.length, 5)
assert.equal(cappedMandatory.blocking.at(-1).source, 'operational-follow-up')
const uncertainFollowUp = validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Safety evidence missing', summary: 'Cannot establish required isolation', affectsVerdict: true, verdictImpact: 'unverified' }], verdict: 'passable', rationale: 'Model incorrectly passed it' })
assert.equal(uncertainFollowUp.verdict, 'unverified')
assert.equal(uncertainFollowUp.unverified.at(-1).source, 'operational-follow-up')
assert.throws(() => validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Missing fields', summary: 'unsafe ambiguity' }], verdict: 'passable', rationale: 'x' }), /affectsVerdict/)
assert.throws(() => validateSynthesis({ blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Contradiction', summary: 'fields disagree', affectsVerdict: false, verdictImpact: 'blocked' }], verdict: 'passable', rationale: 'x' }), /disagree/)
assert.throws(() => validateSynthesis({ blocking: Array(6).fill({}), nonBlocking: [], unverified: [], verdict: 'blocked', rationale: 'x' }), /five/)

const plan = makePlan({ h0: 'a'.repeat(40), base: 'b'.repeat(40), diffHash: 'c'.repeat(64) }, selectPersonas(['x.tsx']), routes, 99)
assert.equal(plan.maxWorkers, 6)
assert.equal(plan.graph.at(-1).id, 'synthesis')
assert.ok(plan.graph.at(-1).dependsOn.includes('qa-demo'))
assert.equal(plan.routes.length, 6)

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-pr-review-test-'))
try {
  const fresh = path.join(temp, 'qa.json')
  fs.writeFileSync(fresh, JSON.stringify({ revision: 'head-1', result: 'PASS' }))
  assert.equal(qaEvidence(fresh, 'head-1').status, 'fresh')
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
  await assert.rejects(
    runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'no-runner') }, { routes: [] }),
    /No safe read-only runner/,
  )
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
  assert.ok(fs.existsSync(path.join(runDir, 'report.md')))
  assert.ok(fs.existsSync(path.join(runDir, 'report.html')))
  const reportText = fs.readFileSync(path.join(runDir, 'report.md'), 'utf8')
  for (const marker of ['## Feature-gate decision', '### Full feature-gate path', 'fg-off-path', 'fg-persistence-rollback', '## Every review facet']) assert.ok(reportText.includes(marker), `report missing ${marker}`)
  assert.equal(result.report.featureGate.status, 'required')
  calls = 0
  const resynthesized = await runGraph({ command: 'synthesize', runDir, qaReport: fresh }, { routes: [fakeRoute], execute })
  assert.equal(resynthesized.synthesis.verdict, 'passable')
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
  assert.equal(withFindings.audit.candidateCount, 6)
  assert.equal(withFindings.audit.parseFailures, 0)
  assert.ok(withFindings.audit.nodes.every((node) => node.findings === 1))
  assert.ok(seenPrompts.some((p) => p.includes('Button.tsx')), 'reviewer prompts must carry the immutable diff')
  assert.ok(seenPrompts.every((p) => p.includes('untrusted')), 'every prompt carries the untrusted-input warning')
  assert.ok(!fs.existsSync(path.join(findingRunDir, 'nodes', 'missing.json')))
  assert.equal(fs.readdirSync(path.join(findingRunDir, 'nodes')).length, 6)

  // Stale QA evidence can never round up to a pass.
  const staleQa = path.join(temp, 'stale-qa.json')
  fs.writeFileSync(staleQa, JSON.stringify({ revision: 'some-other-head', result: 'PASS' }))
  const staleRun = await runGraph({ command: 'run', repoRoot: repo, base: 'HEAD^', head: 'HEAD', output: path.join(temp, 'stale-run'), qaReport: staleQa }, { routes: [fakeRoute], execute })
  assert.equal(staleRun.audit.qa.status, 'stale')
  assert.equal(staleRun.synthesis.verdict, 'unverified', 'stale QA evidence is never a pass')
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
  assert.equal(allFailed.report.coverage.length, 37)
  assert.ok(allFailed.report.coverage.every((row) => row.status === 'unverified'))
  assert.ok(fs.existsSync(path.join(allFailedDir, 'report.html')), 'failed synthesis must still emit a truthful report')
  const report = buildReviewReport({ snapshot: { h0: head, base: 'base', diffHash: 'hash' }, synthesis: { blocking: [], nonBlocking: [], unverified: [], operationalFollowUps: [{ title: 'Owner checklist', summary: 'Human follow-up only', affectsVerdict: false, verdictImpact: 'none' }], verdict: 'passable', rationale: 'clear' }, qa: { status: 'not-run', reason: 'No matching story' }, selected: ['rollout-gates'], nodeResults: [{ persona: 'rollout-gates', status: 'ok', value: gateCandidate }] })
  assert.ok(report.markdown.includes('No matching story'))
  assert.ok(report.markdown.includes('## Operational follow-ups'))
  assert.ok(report.markdown.includes('no verdict impact'))
  assert.ok(report.markdown.includes('Human follow-up only'))
  assert.equal(report.verdict, 'passable')
  assert.equal(report.coverage.length, PERSONA_FACETS['rollout-gates'].length)
  assert.ok(report.html.includes('Full feature-gate path'))
  const help = fs.readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
  for (const marker of ['qa-demo', 'H0', 'UNVERIFIED', 'Agent agreement is not proof', 'review-graph.mjs']) assert.ok(help.includes(marker), `missing ${marker}`)
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
console.log('PASS: fe-pr-review routing, personas, schemas, graph contract, and QA handoff')
