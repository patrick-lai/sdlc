#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  buildDestination,
  buildPublicUrl,
  normalizeH0,
  parseArgs,
  publishStatlas,
  repositorySegment,
  sha256,
} from './publish-statlas.mjs'

const script = fileURLToPath(new URL('./publish-statlas.mjs', import.meta.url))
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-pr-review-statlas-'))
const gitH0 = 'a'.repeat(40)

function makeRun(name, { h0 = gitH0, verdict = 'passable' } = {}) {
  const runDir = path.join(temp, name)
  fs.mkdirSync(path.join(runDir, 'snapshot'), { recursive: true })
  const decision = verdict === 'passable' ? 'ACCEPT' : 'REJECT'
  const reasonCodes = decision === 'ACCEPT' ? [] : ['UNVERIFIED_COVERAGE']
  const embedded = {
    schema: 'sdlc.fe-pr-review.report/v1',
    snapshot: { h0 },
    decision: { value: decision, reasonCodes },
    verdict: { value: verdict },
  }
  const html = Buffer.from(
    `<!doctype html><script type="application/json" id="fe-review-report">${JSON.stringify(embedded)}</script>`,
  )
  fs.writeFileSync(path.join(runDir, 'report.html'), html)
  fs.writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify({ h0, decision: { value: decision, reasonCodes }, verdict })}\n`)
  fs.writeFileSync(path.join(runDir, 'snapshot', 'snapshot.json'), `${JSON.stringify({ h0 })}\n`)
  fs.writeFileSync(path.join(runDir, 'synthesis.json'), `${JSON.stringify({ verdict, decision, reasonCodes })}\n`)
  fs.writeFileSync(
    path.join(runDir, 'audit.json'),
    `${JSON.stringify({
      h0,
      decision,
      reasonCodes,
      headCheck: { expected: h0, actual: h0, unchanged: true },
      synthesis: { verdict },
    })}\n`,
  )
  return { runDir, html }
}

function options(runDir, overrides = {}) {
  return {
    runDir,
    repository: 'OpenAI/Example.git',
    pr: '123',
    currentH0: gitH0,
    namespace: 'review-reports',
    authGroup: 'reviewers',
    lifecycle: 'month',
    ...overrides,
  }
}

function successfulDependencies(html, capture = {}) {
  return {
    execFileImpl(command, args, execOptions, callback) {
      capture.command = command
      capture.args = args
      capture.options = execOptions
      callback(null, 'atlas-output-containing-secret', 'atlas-error-containing-secret')
    },
    async fetchImpl(url) {
      capture.fetchUrl = url
      return {
        status: 200,
        url,
        async arrayBuffer() {
          return html
        },
      }
    },
    verifyAttempts: 1,
    verifyDelayMs: 0,
    sleep: async () => {},
  }
}

function snapshotTree(runDir) {
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else files.push([path.relative(runDir, file), sha256(fs.readFileSync(file))])
    }
  }
  visit(runDir)
  return files.sort((a, b) => a[0].localeCompare(b[0]))
}

try {
  const parsed = parseArgs(
    ['--run-dir', '.', '--repository=owner/repo', '--pr', '9', '--current-h0', gitH0],
    { STATLAS_NAMESPACE: 'ns', STATLAS_AUTH_GROUP: 'group' },
  )
  assert.equal(parsed.namespace, 'ns')
  assert.equal(parsed.authGroup, 'group')
  assert.equal(parsed.lifecycle, 'month')
  assert.throws(
    () =>
      parseArgs(
        ['--run-dir', '.', '--repository', 'owner/repo', '--pr', '9', '--current-h0', gitH0, '--lifecycle', 'forever'],
        { STATLAS_NAMESPACE: 'ns', STATLAS_AUTH_GROUP: 'group' },
      ),
    /temporary or month/,
  )

  assert.equal(normalizeH0(gitH0.toUpperCase()), gitH0)
  assert.equal(normalizeH0('worktree:head:manifest'), sha256('worktree:head:manifest'))
  assert.equal(repositorySegment('https://github.com/OpenAI/Example.git'), repositorySegment('openai/example'))
  const destination = buildDestination({ repository: 'openai/example', pr: 123, h0: gitH0 })
  assert.match(destination, /^fe-pr-review\/openai-example-[a-f0-9]{8}\/pr-123\/h0-a{40}\/index\.html$/)
  assert.ok(!destination.match(/\d{8}T\d{6}/))
  assert.equal(
    buildPublicUrl('review reports', destination),
    `https://statlas.prod.atl-paas.net/review%20reports/${destination}`,
  )

  const accepted = makeRun('accepted')
  const acceptedCapture = {}
  const before = snapshotTree(accepted.runDir)
  const acceptedResult = await publishStatlas(
    options(accepted.runDir),
    successfulDependencies(accepted.html, acceptedCapture),
  )
  assert.equal(acceptedResult.exitCode, 0)
  assert.equal(acceptedResult.output.decision, 'ACCEPT')
  assert.equal(acceptedResult.output.reachable, true)
  assert.equal(acceptedCapture.command, 'atlas')
  assert.deepEqual(acceptedCapture.args.slice(0, 3), [
    'statlas',
    'put',
    `--file=${path.join(accepted.runDir, 'report.html')}`,
  ])
  assert.equal(acceptedCapture.args.filter((arg) => arg.startsWith('--file=')).length, 1)
  assert.ok(acceptedCapture.args.includes(`--subdirectory=${destination}`))
  assert.ok(!JSON.stringify(acceptedResult.output).includes('secret'))
  assert.deepEqual(snapshotTree(accepted.runDir), before)

  for (const verdict of ['blocked', 'unverified', 'incomplete', 'timeout']) {
    const run = makeRun(`reject-${verdict}`, { verdict })
    let uploadCount = 0
    const deps = successfulDependencies(run.html)
    const original = deps.execFileImpl
    deps.execFileImpl = (...args) => {
      uploadCount += 1
      original(...args)
    }
    const result = await publishStatlas(options(run.runDir), deps)
    assert.equal(result.exitCode, 0, verdict)
    assert.equal(result.output.decision, 'REJECT', verdict)
    assert.equal(uploadCount, 1, `${verdict} must still publish`)
  }

  for (const artifact of ['report', 'snapshot', 'audit', 'html', 'current']) {
    const run = makeRun(`mismatch-${artifact}`)
    if (artifact === 'report') fs.writeFileSync(path.join(run.runDir, 'report.json'), JSON.stringify({ h0: 'b'.repeat(40), decision: { value: 'ACCEPT', reasonCodes: [] }, verdict: 'passable' }))
    if (artifact === 'snapshot') fs.writeFileSync(path.join(run.runDir, 'snapshot', 'snapshot.json'), JSON.stringify({ h0: 'b'.repeat(40) }))
    if (artifact === 'audit') {
      const audit = JSON.parse(fs.readFileSync(path.join(run.runDir, 'audit.json')))
      fs.writeFileSync(path.join(run.runDir, 'audit.json'), JSON.stringify({ ...audit, h0: 'b'.repeat(40) }))
    }
    if (artifact === 'html') {
      fs.writeFileSync(
        path.join(run.runDir, 'report.html'),
        `<script id="fe-review-report" type="application/json">${JSON.stringify({ snapshot: { h0: 'b'.repeat(40) }, decision: { value: 'ACCEPT', reasonCodes: [] }, verdict: { value: 'passable' } })}</script>`,
      )
    }
    let uploads = 0
    const deps = successfulDependencies(run.html)
    deps.execFileImpl = (...args) => {
      uploads += 1
      args.at(-1)(null, '', '')
    }
    const result = await publishStatlas(options(run.runDir, artifact === 'current' ? { currentH0: 'b'.repeat(40) } : {}), deps)
    assert.equal(result.exitCode, 2, artifact)
    assert.equal(result.output.code, 'H0_MISMATCH', artifact)
    assert.equal(uploads, 0, artifact)
  }

  const mismatchedDecision = makeRun('mismatched-decision')
  fs.writeFileSync(
    path.join(mismatchedDecision.runDir, 'report.json'),
    JSON.stringify({ h0: gitH0, decision: { value: 'REJECT', reasonCodes: [] }, verdict: 'passable' }),
  )
  const mismatchedDecisionResult = await publishStatlas(
    options(mismatchedDecision.runDir),
    successfulDependencies(mismatchedDecision.html),
  )
  assert.equal(mismatchedDecisionResult.exitCode, 2)
  assert.equal(mismatchedDecisionResult.output.code, 'DECISION_MISMATCH')

  const mismatchedVerdict = makeRun('mismatched-verdict')
  fs.writeFileSync(
    path.join(mismatchedVerdict.runDir, 'report.json'),
    JSON.stringify({ h0: gitH0, decision: { value: 'ACCEPT', reasonCodes: [] }, verdict: 'blocked' }),
  )
  const mismatchedVerdictResult = await publishStatlas(
    options(mismatchedVerdict.runDir),
    successfulDependencies(mismatchedVerdict.html),
  )
  assert.equal(mismatchedVerdictResult.exitCode, 2)
  assert.equal(mismatchedVerdictResult.output.code, 'DECISION_VERDICT_MISMATCH')

  const mismatchedAudit = makeRun('mismatched-audit')
  const audit = JSON.parse(fs.readFileSync(path.join(mismatchedAudit.runDir, 'audit.json')))
  fs.writeFileSync(
    path.join(mismatchedAudit.runDir, 'audit.json'),
    JSON.stringify({ ...audit, decision: 'REJECT', reasonCodes: ['INVALID_FANOUT'] }),
  )
  const mismatchedAuditResult = await publishStatlas(
    options(mismatchedAudit.runDir),
    successfulDependencies(mismatchedAudit.html),
  )
  assert.equal(mismatchedAuditResult.exitCode, 2)
  assert.equal(mismatchedAuditResult.output.code, 'DECISION_MISMATCH')

  const invalidRun = makeRun('invalid-inputs')
  for (const override of [
    { namespace: '' },
    { authGroup: '' },
    { currentH0: '' },
    { lifecycle: 'forever' },
  ]) {
    let uploads = 0
    const deps = successfulDependencies(invalidRun.html)
    deps.execFileImpl = (...args) => {
      uploads += 1
      args.at(-1)(null, '', '')
    }
    const result = await publishStatlas(options(invalidRun.runDir, override), deps)
    assert.equal(result.exitCode, 2)
    assert.equal(uploads, 0)
  }

  const uploadFailure = makeRun('upload-failure')
  const uploadFailureResult = await publishStatlas(options(uploadFailure.runDir), {
    execFileImpl(_command, _args, _options, callback) {
      callback(new Error('token=top-secret'))
    },
    fetchImpl: async () => {
      throw new Error('must not fetch')
    },
  })
  assert.equal(uploadFailureResult.exitCode, 1)
  assert.equal(uploadFailureResult.output.code, 'ATLAS_UPLOAD_FAILED')
  assert.ok(!JSON.stringify(uploadFailureResult.output).includes('top-secret'))

  for (const mode of ['wrong-body', 'redirect']) {
    const run = makeRun(`verify-${mode}`)
    const result = await publishStatlas(options(run.runDir), {
      execFileImpl(_command, _args, _options, callback) {
        callback(null, '', '')
      },
      async fetchImpl(url) {
        return {
          status: 200,
          url: mode === 'redirect' ? 'https://example.com/login' : url,
          async arrayBuffer() {
            return Buffer.from('login page')
          },
        }
      },
      verifyAttempts: 1,
      verifyDelayMs: 0,
      sleep: async () => {},
    })
    assert.equal(result.exitCode, 3, mode)
    assert.equal(result.output.code, 'PUBLISHED_CONTENT_UNVERIFIED', mode)
  }

  const cli = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, STATLAS_NAMESPACE: '', STATLAS_AUTH_GROUP: '' },
  })
  assert.equal(cli.status, 2)
  assert.equal(cli.stderr, '')
  const lines = cli.stdout.trim().split('\n')
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).schema, 'sdlc.fe-pr-review.statlas/v1')

  console.log('PASS: fe-pr-review Statlas publisher')
} finally {
  fs.rmSync(temp, { recursive: true, force: true })
}
