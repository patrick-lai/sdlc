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

function shortRef(value, n = 8) {
  const text = String(value ?? '')
  return text.length <= n ? text : `${text.slice(0, n)}…`
}

function slug(value) {
  return String(value ?? 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'item'
}

function linkifyEvidence(text) {
  const raw = String(text ?? '')
  return raw.replace(/\bhttps?:\/\/[^\s<>"']+/g, (url) => {
    const safe = url.replace(/"/g, '&quot;')
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`
  })
}

function normalizeFinding(finding, group, index) {
  if (!finding || typeof finding !== 'object') {
    return {
      id: `${group}-${index}`,
      group,
      title: String(finding),
      summary: String(finding),
    }
  }
  const title = finding.title || 'Untitled finding'
  return {
    id: slug(`${group}-${title}-${finding.file || index}`),
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
    executionPath: Array.isArray(finding.executionPath) ? finding.executionPath : [],
    violatedContract: finding.violatedContract || null,
    evidence: Array.isArray(finding.evidence) ? finding.evidence : finding.evidence ? [String(finding.evidence)] : [],
    disconfirmingReason: finding.disconfirmingReason || null,
    suggestedFix: finding.suggestedFix || null,
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
  const findings = [
    ...(synthesis?.blocking || []).map((f, i) => normalizeFinding(f, 'blocking', i)),
    ...(synthesis?.nonBlocking || []).map((f, i) => normalizeFinding(f, 'non-blocking', i)),
    ...(synthesis?.unverified || []).map((f, i) => normalizeFinding(f, 'unverified', i)),
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
    verdict: {
      value: synthesis?.verdict || 'unverified',
      ...(VERDICT_META[synthesis?.verdict || 'unverified'] || VERDICT_META.unverified),
      rationale: synthesis?.rationale || 'Synthesis did not complete.',
    },
    qa: {
      status: qa?.status || 'not-run',
      revision: qa?.revision || null,
      hash: qa?.hash || null,
      reason:
        qa?.reason ||
        qa?.error ||
        (qa?.status === 'not-run' ? 'QA was not run.' : 'None reported.'),
    },
    featureGate: {
      status: gate.status,
      keys: gate.keys || [],
      rationale: gate.rationale,
      evidence: gate.evidence || [],
    },
    counts: {
      blocking: synthesis?.blocking?.length ?? 0,
      nonBlocking: synthesis?.nonBlocking?.length ?? 0,
      unverifiedFindings: synthesis?.unverified?.length ?? 0,
      facets: facetCounts.total,
      facetsChecked: facetCounts.checked,
      facetsUnverified: facetCounts.unverified,
      personas: selected.length,
      failedNodes: failedNodes.length,
    },
    selected,
    findings,
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
    `- **Head:** \`${d.snapshot.h0}\``,
    `- **Base:** \`${d.snapshot.base}\``,
    `- **Diff SHA-256:** \`${d.snapshot.diffHash}\``,
    `- **Verdict:** **${String(d.verdict.value).toUpperCase()}**`,
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
        if (f.executionPath?.length) lines.push(`  - path: ${f.executionPath.join(' → ')}`)
        if (f.suggestedFix) lines.push(`  - fix: ${f.suggestedFix}`)
      }
      lines.push('')
    }
  }

  lines.push(
    '## QA evidence',
    '',
    `- **Status:** ${d.qa.status}`,
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
    verdict: input.synthesis?.verdict || 'unverified',
    featureGate: document.featureGate,
    coverage,
    qa: { ...input.qa, content: undefined },
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

export { linkifyEvidence, slug, shortRef }
