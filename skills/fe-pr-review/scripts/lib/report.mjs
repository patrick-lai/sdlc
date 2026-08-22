/**
 * Fill the baked HTML report template from review graph envelopes.
 * Agents must not invent HTML — use buildReviewReport() / renderHtmlReport().
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPORT_TEMPLATE = path.resolve(__dirname, '../../templates/report.html')
export const REPORT_DATA_TOKEN = '__FE_REVIEW_REPORT_JSON__'

const VERDICT_META = {
  blocked: { label: 'Blocked', tone: 'blocked' },
  passable: { label: 'Passable', tone: 'passable' },
  unverified: { label: 'Unverified', tone: 'unverified' },
}

const STATUS_META = {
  checked: { label: 'Checked', tone: 'ok' },
  finding: { label: 'Finding', tone: 'warn' },
  'not-applicable': { label: 'N/A', tone: 'muted' },
  unverified: { label: 'Unverified', tone: 'unverified' },
}

const DECISION_REASON = {
  VERIFIED_FINDING: 'VERIFIED_FINDING',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  QA_FAILURE: 'QA_FAILURE',
  RUNNER_FAILURE: 'RUNNER_FAILURE',
  FANOUT_FAILURE: 'FANOUT_FAILURE',
  RUNTIME_FAILURE: 'RUNTIME_FAILURE',
}

function shortRef(value, n = 8) {
  const text = String(value ?? '')
  return text.length <= n ? text : `${text.slice(0, n)}…`
}

function slug(value) {
  return String(value ?? 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item'
}

function findingId(group, finding, index, used) {
  const title = finding.title || 'untitled'
  const base = slug(`${group}-${title}-${finding.file || 'no-file'}-${finding.line ?? 'na'}-${index}`)
  let id = base
  let suffix = 2
  while (used.has(id)) {
    id = `${base}-${suffix++}`
  }
  used.add(id)
  return id
}

function lower(value) {
  return String(value ?? '').trim().toLowerCase()
}

function failedStatus(value) {
  return ['failed', 'failure', 'error', 'invalid', 'timeout', 'timed-out', 'blocked'].includes(lower(value))
}

function runnerFailure({ failedNodes, metadata, audit }) {
  if (failedNodes.length > 0) return true
  const runner = metadata?.runner
  if (runner?.failed === true || failedStatus(runner?.status)) return true
  if (Array.isArray(audit?.nodes) && audit.nodes.some((node) => node?.status !== 'ok')) return true
  return failedStatus(audit?.synthesis?.status)
}

function fanoutFailure({ metadata, fanout }) {
  const value = fanout || metadata?.fanout
  if (!value) return false
  if (value.valid === false || value.materialOverlap === false || failedStatus(value.status)) return true
  const concurrency = Number(value.maxObservedConcurrency)
  return Number.isFinite(concurrency) && concurrency < 2
}

function runtimeFailure({ metadata, runtime, audit }) {
  const values = [runtime, metadata?.runtime, audit?.runtime].filter(Boolean)
  if (audit?.timedOut === true || audit?.deadlineExceeded === true) return true
  return values.some(
    (value) =>
      value.timedOut === true ||
      value.deadlineExceeded === true ||
      ['timeout', 'timed-out', 'deadline-exceeded', 'runtime-failure'].includes(lower(value.status)),
  )
}

export function derivePublicDecision({
  verdict,
  qa,
  counts,
  failedNodes = [],
  metadata,
  audit,
  fanout,
  runtime,
}) {
  const reasonCodes = []
  const internalVerdict = lower(verdict?.value || verdict)
  const qaStatus = lower(qa?.status || 'not-run')
  const qaResult = lower(qa?.result)
  const qaAllowed = qaStatus === 'not-run' || (qaStatus === 'fresh' && qaResult === 'pass')

  if (internalVerdict === 'blocked' || counts.blocking > 0) {
    reasonCodes.push(DECISION_REASON.VERIFIED_FINDING)
  }
  if (
    internalVerdict === 'unverified' ||
    !['passable', 'blocked', 'unverified'].includes(internalVerdict) ||
    counts.unverifiedFindings > 0 ||
    counts.facetsUnverified > 0
  ) {
    reasonCodes.push(DECISION_REASON.INSUFFICIENT_EVIDENCE)
  }
  if (!qaAllowed) {
    reasonCodes.push(
      qaStatus === 'fresh' || failedStatus(qaStatus)
        ? DECISION_REASON.QA_FAILURE
        : DECISION_REASON.INSUFFICIENT_EVIDENCE,
    )
  }
  if (runnerFailure({ failedNodes, metadata, audit })) {
    reasonCodes.push(DECISION_REASON.RUNNER_FAILURE)
  }
  if (fanoutFailure({ metadata, fanout })) {
    reasonCodes.push(DECISION_REASON.FANOUT_FAILURE)
  }
  if (runtimeFailure({ metadata, runtime, audit })) {
    reasonCodes.push(DECISION_REASON.RUNTIME_FAILURE)
  }

  const uniqueReasonCodes = [...new Set(reasonCodes)]
  const accepted = internalVerdict === 'passable' && qaAllowed && uniqueReasonCodes.length === 0
  const value = accepted ? 'ACCEPT' : 'REJECT'

  return {
    value,
    label: accepted ? 'Accept' : 'Reject',
    tone: accepted ? 'passable' : 'blocked',
    reasonCodes: uniqueReasonCodes,
    rationale: accepted
      ? 'The code verdict is passable and supplied QA evidence is acceptable.'
      : 'This revision is not eligible for automated acceptance. Review the reason codes and internal diagnostics.',
  }
}

function normalizePublicDecision(synthesis, fallback) {
  const value = String(synthesis?.decision || '').toUpperCase()
  if (!['ACCEPT', 'REJECT'].includes(value)) return fallback
  const reasonCodes = Array.isArray(synthesis?.reasonCodes)
    ? [...new Set(synthesis.reasonCodes.map((code) => String(code)).filter(Boolean))]
    : fallback.reasonCodes
  return {
    value,
    label: value === 'ACCEPT' ? 'Accept' : 'Reject',
    tone: value === 'ACCEPT' ? 'passable' : 'blocked',
    reasonCodes,
    rationale:
      value === 'ACCEPT'
        ? 'The bounded review completed with sufficient evidence for automated acceptance.'
        : 'This revision is not eligible for automated acceptance. Review the reason codes and internal diagnostics.',
  }
}

function buildExecutiveSummary({ decision, verdict, counts, qa, featureGate, findings, failedNodes }) {
  const blocking = findings.filter((f) => f.group === 'blocking')
  const qaOutcome = qa.status === 'fresh' ? String(qa.result || '').toUpperCase() : ''
  const qaBlocksApproval = qa.status === 'fresh' && ['FAIL', 'PARTIAL', 'BLOCKED'].includes(qaOutcome)
  const reasons = new Set(decision.reasonCodes)

  const headline =
    decision.value === 'ACCEPT'
      ? 'Accepted by the automated review.'
      : reasons.has(DECISION_REASON.VERIFIED_FINDING)
        ? 'Rejected because verified blocking findings need attention.'
        : reasons.has(DECISION_REASON.QA_FAILURE)
          ? 'Rejected because supplied QA evidence did not pass.'
          : reasons.has(DECISION_REASON.RUNNER_FAILURE) ||
              reasons.has(DECISION_REASON.FANOUT_FAILURE) ||
              reasons.has(DECISION_REASON.RUNTIME_FAILURE)
            ? 'Rejected because the automated review did not complete reliably.'
            : 'Rejected because evidence is incomplete.'

  const mergeAdvice =
    decision.value === 'ACCEPT'
      ? 'This revision looks mergeable and is accepted by the automated review.'
      : reasons.has(DECISION_REASON.VERIFIED_FINDING)
        ? 'Do not merge until the blocking findings are fixed.'
        : qaBlocksApproval
          ? 'Investigate visual QA before approving.'
          : 'Do not treat this automated review as approval.'

  const nextStep =
    decision.value === 'ACCEPT'
      ? 'Scan the internal verdict and supporting evidence before you approve.'
      : reasons.has(DECISION_REASON.VERIFIED_FINDING)
        ? 'Open each blocking finding, then confirm the suggested fix.'
        : qaBlocksApproval
          ? 'Open the QA section and resolve the failed or incomplete result first.'
          : 'Read the reason codes, limitations, and failed coverage before deciding.'

  const bullets = []
  bullets.push(
    counts.blocking
      ? `${counts.blocking} blocking issue${counts.blocking === 1 ? '' : 's'} need attention before merge.`
      : 'No blocking issues were synthesized from inspected evidence.',
  )
  if (counts.nonBlocking) {
    bullets.push(`${counts.nonBlocking} non-blocking note${counts.nonBlocking === 1 ? '' : 's'} — polish or follow-up.`)
  }
  if (featureGate.status === 'required') {
    bullets.push(
      featureGate.keys?.length
        ? `Feature gate required (${featureGate.keys.join(', ')}). Confirm off/on paths before ship.`
        : 'Feature gate required — confirm keys and rollout path before ship.',
    )
  } else if (featureGate.status === 'unverified') {
    bullets.push('Feature-gate requirement is unverified — rollout safety is not established.')
  }
  if (qa.status === 'fresh') {
    const outcome = qa.result ? String(qa.result).toUpperCase() : null
    if (outcome === 'PASS') bullets.push('Visual QA passed on this head (H0).')
    else if (outcome === 'FAIL') bullets.push('Visual QA failed on this head (H0).')
    else if (outcome === 'PARTIAL') bullets.push('Visual QA is partial on this head (H0) — not full proof.')
    else if (outcome === 'BLOCKED') bullets.push('Visual QA was blocked on this head (H0).')
    else bullets.push('Visual QA report is fresh for this head (H0); see QA section for outcome.')
  } else if (qa.status === 'not-run') bullets.push('Visual QA was not run for this head.')
  else bullets.push(`Visual QA is ${qa.status} — visual proof cannot be relied on.`)

  if (failedNodes?.length) {
    bullets.push(`${failedNodes.length} reviewer node(s) failed — coverage gaps remain.`)
  }
  if (counts.facetsUnverified) {
    bullets.push(`${counts.facetsUnverified} facet(s) stayed unverified — see limitations.`)
  }

  const actions = blocking.slice(0, 5).map((finding) => ({
    title: finding.title,
    location: finding.location,
    summary: finding.summary,
    fix: finding.suggestedFix || null,
    anchor: `finding-${finding.id}`,
  }))

  return { headline, bullets, actions, rationale: verdict.rationale, decision: mergeAdvice, nextStep }
}

function linkifyEvidence(text) {
  const raw = String(text ?? '')
  return raw.replace(/\bhttps?:\/\/[^\s<>"']+/g, (url) => {
    const safe = url.replace(/"/g, '&quot;')
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`
  })
}

function normalizeFinding(finding, group, index, used) {
  if (!finding || typeof finding !== 'object') {
    const id = findingId(group, { title: String(finding) }, index, used)
    return {
      id,
      group,
      title: String(finding),
      summary: String(finding),
    }
  }
  const title = finding.title || 'Untitled finding'
  return {
    id: findingId(group, finding, index, used),
    group,
    title,
    lens: finding.lens || null,
    file: finding.file || null,
    line: finding.line || null,
    location: finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : null,
    severity: finding.severity || group,
    confidence: finding.confidence ?? null,
    impact: finding.impact || finding.rationale || finding.summary || null,
    trigger: finding.trigger || null,
    reproduction: finding.reproduction || null,
    executionPath: Array.isArray(finding.executionPath) ? finding.executionPath : [],
    rootCause: finding.rootCause || null,
    violatedContract: finding.violatedContract || null,
    evidence: Array.isArray(finding.evidence) ? finding.evidence : finding.evidence ? [String(finding.evidence)] : [],
    disconfirmingReason: finding.disconfirmingReason || null,
    suggestedFix: finding.suggestedFix || null,
    suggestedPatch: finding.suggestedPatch || null,
    verification: finding.verification || null,
    summary: finding.impact || finding.rationale || finding.summary || 'See synthesis evidence.',
  }
}

/**
 * @param {ReturnType<import('../review-graph.mjs').buildFacetCoverage>} coverage
 */
export function buildReportDocument({
  snapshot,
  synthesis,
  qa,
  nodeResults = [],
  selected = [],
  generatedAt,
  coverage,
  featureGate,
  metadata,
  audit,
  fanout,
  runtime,
}) {
  const gate =
    featureGate ||
    (selected.includes('rollout-gates')
      ? {
          status: 'unverified',
          rationale: 'Rollout reviewer did not produce a valid feature-gate decision.',
          evidence: ['Missing or invalid rollout-gates node.'],
          keys: [],
        }
      : {
          status: 'not-applicable',
          rationale: 'No frontend rollout-gates persona was selected.',
          evidence: ['Changed-file classification did not select rollout-gates.'],
          keys: [],
        })

  const rows = coverage || []
  const gatePath = rows.filter((row) => row.persona === 'rollout-gates')
  const usedIds = new Set()
  const findings = [
    ...(synthesis?.blocking || []).map((f, i) => normalizeFinding(f, 'blocking', i, usedIds)),
    ...(synthesis?.nonBlocking || []).map((f, i) => normalizeFinding(f, 'non-blocking', i, usedIds)),
    ...(synthesis?.unverified || []).map((f, i) => normalizeFinding(f, 'unverified', i, usedIds)),
  ]

  const facetCounts = rows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.status === 'unverified') acc.unverified += 1
      if (row.status === 'finding') acc.findings += 1
      if (row.status === 'checked') acc.checked += 1
      return acc
    },
    { total: 0, checked: 0, findings: 0, unverified: 0 },
  )

  const failedNodes = nodeResults.filter((node) => node.status !== 'ok')
  const operationalFollowUps = (synthesis?.operationalFollowUps || []).map((item) => ({
    title: item?.title || 'Follow-up',
    summary: item?.summary || item?.detail || '',
    affectsVerdict: Boolean(item?.affectsVerdict),
    verdictImpact: item?.verdictImpact || 'none',
  }))
  const verdict = {
    value: synthesis?.verdict || 'unverified',
    ...(VERDICT_META[synthesis?.verdict || 'unverified'] || VERDICT_META.unverified),
    rationale: synthesis?.rationale || 'Synthesis did not complete.',
  }
  const qaDoc = {
    status: qa?.status || 'not-run',
    revision: qa?.revision || null,
    result: qa?.result || null,
    hash: qa?.hash || null,
    reason:
      qa?.reason ||
      qa?.error ||
      (qa?.status === 'not-run' ? 'QA was not run.' : 'None reported.'),
  }
  const featureGateDoc = {
    status: gate.status,
    keys: gate.keys || [],
    rationale: gate.rationale,
    evidence: gate.evidence || [],
  }
  const counts = {
    blocking: synthesis?.blocking?.length ?? 0,
    nonBlocking: synthesis?.nonBlocking?.length ?? 0,
    unverifiedFindings: synthesis?.unverified?.length ?? 0,
    facets: facetCounts.total,
    facetsChecked: facetCounts.checked,
    facetsUnverified: facetCounts.unverified,
    personas: selected.length,
    failedNodes: failedNodes.length,
  }
  const derivedDecision = derivePublicDecision({
    verdict,
    qa: qaDoc,
    counts,
    failedNodes,
    metadata,
    audit,
    fanout,
    runtime,
  })
  const decision = normalizePublicDecision(synthesis, derivedDecision)
  const executive = buildExecutiveSummary({
    decision,
    verdict,
    counts,
    qa: qaDoc,
    featureGate: featureGateDoc,
    findings,
    failedNodes,
  })

  return {
    schema: 'sdlc.fe-pr-review.report/v1',
    skill: 'fe-pr-review',
    generatedAt: generatedAt ?? new Date().toISOString(),
    readOnly: true,
    snapshot: {
      h0: snapshot.h0,
      base: snapshot.base,
      diffHash: snapshot.diffHash,
      shortH0: shortRef(snapshot.h0, 10),
      shortBase: shortRef(snapshot.base, 10),
      shortDiff: shortRef(snapshot.diffHash, 12),
    },
    decision,
    verdict,
    executive,
    qa: qaDoc,
    featureGate: featureGateDoc,
    counts,
    selected,
    findings,
    operationalFollowUps,
    gatePath,
    coverage: rows,
    limitations: rows
      .filter((row) => row.status === 'unverified')
      .map((row) => ({
        persona: row.persona,
        id: row.id,
        summary: row.summary,
        evidence: row.evidence,
      })),
    failedNodes: failedNodes.map((node) => ({
      persona: node.persona,
      status: node.status,
      error: node.error || node.reason || 'Reviewer node failed.',
    })),
    statusMeta: STATUS_META,
  }
}

export function buildReviewMarkdown(document) {
  const d = document
  const gateKeys = d.featureGate.keys?.length ? d.featureGate.keys.map((k) => `\`${k}\``).join(', ') : 'none established'
  const lines = [
    '# Frontend PR Review Evidence',
    '',
    `- **Decision:** **${d.decision.value}**`,
    `- **Code verdict:** **${String(d.verdict.value).toUpperCase()}**`,
    `- **Reason codes:** ${d.decision.reasonCodes.length ? d.decision.reasonCodes.map((code) => `\`${code}\``).join(', ') : 'none'}`,
    `- **Head:** \`${d.snapshot.h0}\``,
    `- **Base:** \`${d.snapshot.base}\``,
    `- **Diff SHA-256:** \`${d.snapshot.diffHash}\``,
    `- **QA:** **${String(d.qa.status).toUpperCase()}**`,
    '',
    '## Feature-gate decision',
    '',
    `- **Required:** **${d.featureGate.status}**`,
    `- **Gate key(s):** ${gateKeys}`,
    `- **Rationale:** ${d.featureGate.rationale}`,
    `- **Evidence:** ${(d.featureGate.evidence || []).join('; ')}`,
    '',
    '### Full feature-gate path',
    '',
    '| Facet | Status | Established | Evidence / limitation |',
    '|---|---|---|---|',
    ...d.gatePath.map(
      (row) =>
        `| ${row.id} | **${row.status}** | ${row.summary.replaceAll('|', '\\|')} | ${row.evidence.join('; ').replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Every review facet',
    '',
    '| Reviewer | Facet | Status | Established | Evidence / limitation |',
    '|---|---|---|---|---|',
    ...d.coverage.map(
      (row) =>
        `| ${row.persona} | ${row.id} | **${row.status}** | ${row.summary.replaceAll('|', '\\|')} | ${row.evidence.join('; ').replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Findings',
    '',
    `- **Blocking:** ${d.counts.blocking}`,
    `- **Non-blocking:** ${d.counts.nonBlocking}`,
    `- **Unverified claims:** ${d.counts.unverifiedFindings}`,
    `- **Rationale:** ${d.verdict.rationale}`,
    '',
  ]

  for (const group of ['blocking', 'non-blocking', 'unverified']) {
    const items = d.findings.filter((f) => f.group === group)
    lines.push(`### ${group[0].toUpperCase()}${group.slice(1)} (${items.length})`, '')
    if (!items.length) lines.push('- None.', '')
    else {
      for (const f of items) {
        const loc = f.location ? ` \`${f.location}\`` : ''
        lines.push(`- **${f.title}**${loc}: ${f.summary}`)
        if (f.confidence != null) lines.push(`  - confidence: ${f.confidence}`)
        if (f.trigger) lines.push(`  - trigger: ${f.trigger}`)
        if (f.reproduction) lines.push(`  - reproduce: ${f.reproduction}`)
        if (f.executionPath?.length) lines.push(`  - path: ${f.executionPath.join(' → ')}`)
        if (f.rootCause) lines.push(`  - root cause: ${f.rootCause}`)
        if (f.suggestedFix) lines.push(`  - fix: ${f.suggestedFix}`)
        if (f.suggestedPatch) lines.push(`  - suggested patch: ${f.suggestedPatch}`)
        if (f.verification) lines.push(`  - verification: ${f.verification}`)
      }
      lines.push('')
    }
  }

  lines.push(
    '## Operational follow-ups',
    '',
    ...(d.operationalFollowUps?.length
      ? d.operationalFollowUps.map(
          (item) =>
            `- **${item.title}** — **${item.affectsVerdict ? `verdict impact: ${item.verdictImpact}` : 'no verdict impact'}**: ${item.summary}`,
        )
      : ['- None.']),
    '',
    '## QA evidence',
    '',
    `- **Status:** ${d.qa.status}`,
    `- **Result:** ${d.qa.result || 'not recorded'}`,
    `- **Revision:** ${d.qa.revision || 'not established'}`,
    `- **Artifact hash:** ${d.qa.hash || 'none'}`,
    `- **Reason / limitation:** ${d.qa.reason}`,
    '',
    '## Limitations',
    '',
  )
  if (!d.limitations.length) lines.push('- None reported by reviewer nodes.')
  else {
    for (const row of d.limitations) {
      lines.push(`- **${row.persona} / ${row.id}:** ${row.summary} (${row.evidence.join('; ')})`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

export function renderHtmlReport(document, templateHtml) {
  const template = templateHtml ?? fs.readFileSync(REPORT_TEMPLATE, 'utf8')
  if (!template.includes(REPORT_DATA_TOKEN)) {
    throw new Error(`report template missing ${REPORT_DATA_TOKEN}`)
  }
  const json = JSON.stringify(document).replace(/</g, '\\u003c')
  return template.replace(REPORT_DATA_TOKEN, json)
}

export function buildReviewReport(input) {
  const coverage = input.coverage || []

  const rollout = input.nodeResults?.find((node) => node.persona === 'rollout-gates' && node.status === 'ok')?.value
  const featureGate =
    input.featureGate ||
    rollout?.gateRequirement ||
    (input.selected?.includes('rollout-gates')
      ? {
          status: 'unverified',
          rationale: 'Rollout reviewer did not produce a valid feature-gate decision.',
          evidence: ['Missing or invalid rollout-gates node.'],
          keys: [],
        }
      : {
          status: 'not-applicable',
          rationale: 'No frontend rollout-gates persona was selected.',
          evidence: ['Changed-file classification did not select rollout-gates.'],
          keys: [],
        })

  const document = buildReportDocument({ ...input, coverage, featureGate })
  const markdown = buildReviewMarkdown(document)
  const html = renderHtmlReport(document)

  return {
    version: 1,
    h0: input.snapshot.h0,
    decision: document.decision,
    verdict: input.synthesis?.verdict || 'unverified',
    featureGate: document.featureGate,
    coverage,
    qa: { ...input.qa, content: undefined },
    operationalFollowUps: document.operationalFollowUps,
    markdown,
    html,
  }
}

export function writeHtmlReport(file, document) {
  const html = renderHtmlReport(document)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
  return file
}

export { buildExecutiveSummary, linkifyEvidence, slug, shortRef }
