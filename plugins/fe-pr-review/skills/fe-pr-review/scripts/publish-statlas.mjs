#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFile as nodeExecFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SCHEMA = 'sdlc.fe-pr-review.statlas/v1'
const STATLAS_BASE = 'https://statlas.prod.atl-paas.net'
const VALID_LIFECYCLES = new Set(['temporary', 'month'])
const DEFAULT_VERIFY_ATTEMPTS = 5
const DEFAULT_VERIFY_DELAY_MS = 1000
const DEFAULT_VERIFY_TIMEOUT_MS = 5000

class PublisherError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function requireText(value, name) {
  const text = String(value ?? '').trim()
  if (!text) throw new PublisherError('MISSING_ARGUMENT', `${name} is required`)
  return text
}

export function parseArgs(argv, env = process.env) {
  const values = new Map()
  const allowed = new Set([
    '--run-dir',
    '--repository',
    '--pr',
    '--current-h0',
    '--namespace',
    '--auth-group',
    '--lifecycle',
  ])

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      throw new PublisherError('INVALID_ARGUMENT', `Unexpected argument: ${token}`)
    }
    const equals = token.indexOf('=')
    const name = equals === -1 ? token : token.slice(0, equals)
    if (!allowed.has(name)) {
      throw new PublisherError('INVALID_ARGUMENT', `Unknown argument: ${name}`)
    }
    const value = equals === -1 ? argv[++index] : token.slice(equals + 1)
    if (value == null || value.startsWith('--')) {
      throw new PublisherError('MISSING_ARGUMENT', `${name} requires a value`)
    }
    values.set(name, value)
  }

  const lifecycle = String(values.get('--lifecycle') || 'month').trim()
  if (!VALID_LIFECYCLES.has(lifecycle)) {
    throw new PublisherError('INVALID_LIFECYCLE', 'lifecycle must be temporary or month')
  }

  return {
    runDir: path.resolve(requireText(values.get('--run-dir'), '--run-dir')),
    repository: requireText(values.get('--repository'), '--repository'),
    pr: requireText(values.get('--pr'), '--pr'),
    currentH0: requireText(values.get('--current-h0'), '--current-h0'),
    namespace: requireText(values.get('--namespace') || env.STATLAS_NAMESPACE, '--namespace or STATLAS_NAMESPACE'),
    authGroup: requireText(values.get('--auth-group') || env.STATLAS_AUTH_GROUP, '--auth-group or STATLAS_AUTH_GROUP'),
    lifecycle,
  }
}

export function canonicalRepository(repository) {
  const value = requireText(repository, '--repository')
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^git@[^:]+:/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .toLowerCase()
  if (!value) throw new PublisherError('INVALID_REPOSITORY', 'repository is invalid')
  return value
}

export function repositorySegment(repository) {
  const canonical = canonicalRepository(repository)
  const slug =
    canonical
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'repo'
  return `${slug}-${sha256(canonical).slice(0, 8)}`
}

export function normalizeH0(h0) {
  const value = requireText(h0, '--current-h0')
  return /^[a-f0-9]{7,64}$/i.test(value) ? value.toLowerCase() : sha256(value)
}

function safePr(pr) {
  const value = requireText(pr, '--pr')
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new PublisherError('INVALID_PR', 'PR identifier contains unsupported characters')
  }
  return value
}

export function buildDestination({ repository, pr, h0 }) {
  return `fe-pr-review/${repositorySegment(repository)}/pr-${safePr(pr)}/h0-${normalizeH0(h0)}/index.html`
}

export function buildPublicUrl(namespace, destination) {
  const namespaceSegment = encodeURIComponent(requireText(namespace, '--namespace or STATLAS_NAMESPACE'))
  return `${STATLAS_BASE}/${namespaceSegment}/${destination}`
}

function readJson(file, label) {
  let content
  try {
    content = fs.readFileSync(file, 'utf8')
  } catch {
    throw new PublisherError('MISSING_RUN_ARTIFACT', `${label} is missing`)
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new PublisherError('INVALID_RUN_ARTIFACT', `${label} is not valid JSON`)
  }
}

export function readEmbeddedReport(html) {
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    if (!/\bid\s*=\s*(["'])fe-review-report\1/i.test(match[1])) continue
    try {
      return JSON.parse(match[2].trim())
    } catch {
      throw new PublisherError('INVALID_RUN_ARTIFACT', 'report.html contains invalid embedded report JSON')
    }
  }
  throw new PublisherError('MISSING_RUN_ARTIFACT', 'report.html is missing embedded report JSON')
}

function decisionValue(decision) {
  const value = String(decision?.value ?? decision ?? '').trim().toUpperCase()
  return ['ACCEPT', 'REJECT'].includes(value) ? value : null
}

function expectedDecisionForVerdict(verdict) {
  const value = String(verdict?.value ?? verdict ?? '').trim().toLowerCase()
  if (value === 'passable') return 'ACCEPT'
  if (['blocked', 'unverified', 'incomplete', 'timeout', 'timed-out', 'failed'].includes(value)) return 'REJECT'
  return null
}

function reasonCodes(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((code) => String(code)).filter(Boolean))].sort()
    : []
}

export function loadPublication(runDir, currentH0) {
  const reportPath = path.join(runDir, 'report.html')
  let html
  try {
    html = fs.readFileSync(reportPath)
  } catch {
    throw new PublisherError('MISSING_RUN_ARTIFACT', 'report.html is missing')
  }

  const report = readJson(path.join(runDir, 'report.json'), 'report.json')
  const snapshot = readJson(path.join(runDir, 'snapshot', 'snapshot.json'), 'snapshot/snapshot.json')
  const audit = readJson(path.join(runDir, 'audit.json'), 'audit.json')
  const synthesis = readJson(path.join(runDir, 'synthesis.json'), 'synthesis.json')
  const embedded = readEmbeddedReport(html.toString('utf8'))
  const expected = requireText(currentH0, '--current-h0')
  const anchors = [
    report.h0,
    snapshot.h0,
    audit.h0,
    embedded?.snapshot?.h0,
  ]

  if (anchors.some((value) => typeof value !== 'string' || value !== expected)) {
    throw new PublisherError('H0_MISMATCH', 'current H0 does not match every report artifact')
  }
  const decisions = [
    decisionValue(report.decision),
    decisionValue(embedded?.decision),
    decisionValue(audit.decision),
    decisionValue(synthesis.decision),
  ]
  if (decisions.some((value) => !value) || new Set(decisions).size !== 1) {
    throw new PublisherError('DECISION_MISMATCH', 'report, audit, and synthesis decisions do not match')
  }
  const reportDecision = decisions[0]
  const reasonSets = [
    reasonCodes(report.decision?.reasonCodes),
    reasonCodes(embedded?.decision?.reasonCodes),
    reasonCodes(audit.reasonCodes),
    reasonCodes(synthesis.reasonCodes),
  ]
  if (reasonSets.some((codes) => JSON.stringify(codes) !== JSON.stringify(reasonSets[0]))) {
    throw new PublisherError('REASON_CODES_MISMATCH', 'report, audit, and synthesis reason codes do not match')
  }
  const reportExpectedDecision = expectedDecisionForVerdict(report.verdict)
  const embeddedExpectedDecision = expectedDecisionForVerdict(embedded?.verdict)
  const synthesisExpectedDecision = expectedDecisionForVerdict(synthesis.verdict)
  const auditExpectedDecision = expectedDecisionForVerdict(audit?.synthesis?.verdict)
  if (
    !reportExpectedDecision ||
    reportExpectedDecision !== embeddedExpectedDecision ||
    reportExpectedDecision !== synthesisExpectedDecision ||
    reportExpectedDecision !== auditExpectedDecision ||
    reportDecision !== reportExpectedDecision
  ) {
    throw new PublisherError('DECISION_VERDICT_MISMATCH', 'public decision does not match the internal verdict')
  }
  if (
    audit?.headCheck?.unchanged !== true ||
    audit?.headCheck?.expected !== expected ||
    audit?.headCheck?.actual !== expected
  ) {
    throw new PublisherError('HEAD_CHECK_FAILED', 'audit does not contain a successful fresh-head check')
  }

  return {
    reportPath,
    html,
    h0: expected,
    decision: reportDecision,
    contentSha256: sha256(html),
  }
}

function execFilePromise(execFileImpl, command, args, options) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, options, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined
  return fetchImpl(url, { redirect: 'follow', signal })
}

export async function verifyPublishedReport({
  url,
  contentSha256,
  fetchImpl = globalThis.fetch,
  attempts = DEFAULT_VERIFY_ATTEMPTS,
  delayMs = DEFAULT_VERIFY_DELAY_MS,
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (typeof fetchImpl !== 'function') {
    throw new PublisherError('FETCH_UNAVAILABLE', 'fetch is unavailable', 3)
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(fetchImpl, url, timeoutMs)
      const finalUrl = new URL(response.url || url)
      const expectedUrl = new URL(url)
      const sameLocation =
        finalUrl.origin === expectedUrl.origin &&
        finalUrl.pathname === expectedUrl.pathname &&
        finalUrl.search === expectedUrl.search &&
        finalUrl.hash === expectedUrl.hash
      if (response.status === 200 && sameLocation) {
        const body = Buffer.from(await response.arrayBuffer())
        if (sha256(body) === contentSha256) return true
      }
    } catch {
      // Retry bounded verification failures without exposing network details.
    }
    if (attempt + 1 < attempts) await sleep(delayMs)
  }
  return false
}

function failure(status, code, message, exitCode, extra = {}) {
  return {
    exitCode,
    output: {
      schema: SCHEMA,
      status,
      code,
      message,
      ...extra,
    },
  }
}

export async function publishStatlas(options, dependencies = {}) {
  const execFileImpl = dependencies.execFileImpl || nodeExecFile
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch
  let publication
  let destination
  let url

  try {
    const lifecycle = String(options.lifecycle || 'month')
    if (!VALID_LIFECYCLES.has(lifecycle)) {
      throw new PublisherError('INVALID_LIFECYCLE', 'lifecycle must be temporary or month')
    }
    requireText(options.namespace, '--namespace or STATLAS_NAMESPACE')
    requireText(options.authGroup, '--auth-group or STATLAS_AUTH_GROUP')
    publication = loadPublication(path.resolve(options.runDir), options.currentH0)
    destination = buildDestination({
      repository: options.repository,
      pr: options.pr,
      h0: publication.h0,
    })
    url = buildPublicUrl(options.namespace, destination)

    try {
      await execFilePromise(
        execFileImpl,
        'atlas',
        [
          'statlas',
          'put',
          `--file=${publication.reportPath}`,
          `--namespace=${options.namespace}`,
          `--subdirectory=${destination}`,
          `--auth-group=${options.authGroup}`,
          `--lifecycle=${lifecycle}`,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 1024 * 1024,
          timeout: dependencies.uploadTimeoutMs || 60000,
          windowsHide: true,
        },
      )
    } catch {
      return failure('upload-failed', 'ATLAS_UPLOAD_FAILED', 'Statlas upload failed', 1, {
        decision: publication.decision,
        h0: publication.h0,
      })
    }

    const reachable = await verifyPublishedReport({
      url,
      contentSha256: publication.contentSha256,
      fetchImpl,
      attempts: dependencies.verifyAttempts,
      delayMs: dependencies.verifyDelayMs,
      timeoutMs: dependencies.verifyTimeoutMs,
      sleep: dependencies.sleep,
    })
    if (!reachable) {
      return failure('verification-failed', 'PUBLISHED_CONTENT_UNVERIFIED', 'Published report could not be verified', 3, {
        decision: publication.decision,
        h0: publication.h0,
        url,
        reachable: false,
        lifecycle,
        contentSha256: publication.contentSha256,
        subdirectory: destination,
      })
    }

    return {
      exitCode: 0,
      output: {
        schema: SCHEMA,
        status: 'published',
        decision: publication.decision,
        h0: publication.h0,
        url,
        reachable: true,
        lifecycle,
        contentSha256: publication.contentSha256,
        subdirectory: destination,
      },
    }
  } catch (error) {
    if (error instanceof PublisherError) {
      return failure('refused', error.code, error.message, error.exitCode, {
        ...(publication?.decision ? { decision: publication.decision } : {}),
        ...(publication?.h0 ? { h0: publication.h0 } : {}),
      })
    }
    return failure('refused', 'INVALID_INPUT', 'Publisher input could not be processed', 2)
  }
}

export async function main(argv = process.argv.slice(2), env = process.env, dependencies = {}) {
  let result
  try {
    result = await publishStatlas(parseArgs(argv, env), dependencies)
  } catch (error) {
    if (error instanceof PublisherError) {
      result = failure('refused', error.code, error.message, error.exitCode)
    } else {
      result = failure('refused', 'INVALID_INPUT', 'Publisher input could not be processed', 2)
    }
  }
  process.stdout.write(`${JSON.stringify(result.output)}\n`)
  return result.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main()
}
