/**
 * Fill the baked HTML report template from result envelopes.
 * Agents must not invent HTML — call renderHtmlReport() or `adapter.mjs --html`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Policy } from './policy.mjs'
import { BANDS, bandFor, bandMeta, operatorHelper } from './copy.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPORT_TEMPLATE = path.resolve(__dirname, '../../templates/report.html')
export const REPORT_DATA_TOKEN = '__WARDEN_REPORT_JSON__'

/**
 * @param {object} envelope
 */
export function toReportCard(envelope) {
  const item = envelope.item ?? {}
  const facts = envelope.facts ?? {}
  const conditions = envelope.conditions ?? {}
  const attemptsUsed = envelope.attemptCount ?? 0
  return {
    key: item.key,
    number: item.number,
    title: item.title,
    workspace: item.workspace,
    repo: item.repo,
    branch: item.branch,
    url: item.url,
    jiraKeys: item.jiraKeys ?? [],
    state: envelope.state,
    displayWord: envelope.displayWord,
    decision: envelope.decision?.decision ?? null,
    mayDispatchRepair: Boolean(envelope.decision?.mayDispatchRepair),
    confidence: envelope.confidence,
    helper: operatorHelper(envelope),
    band: bandFor(envelope),
    repairable: conditions.repairable ?? [],
    humanGates: [
      ...(conditions.operatorActions ?? []),
      ...(conditions.externalGates ?? []),
    ],
    waiting: conditions.waiting ?? [],
    ignored: conditions.ignored ?? [],
    gates: envelope.gates ?? {},
    attempts: {
      used: attemptsUsed,
      max: Policy.maxRepairAttempts,
    },
    actions: (envelope.actions ?? []).map((a) => ({
      surface: a.surface,
      kind: a.kind,
      status: a.status,
      evidenceUrl: a.evidenceUrl ?? null,
    })),
    evidenceGaps: envelope.evidenceGaps ?? [],
    assumptions: envelope.assumptions ?? [],
    dryRun: Boolean(envelope.policy?.dryRun),
  }
}

/**
 * Document the HTML template consumes (`window` JSON).
 * @param {{ envelopes: object[], generatedAt?: string, window?: string, mode?: string }} input
 */
export function buildReportDocument(input = {}) {
  const envelopes = input.envelopes ?? []
  const cards = envelopes.map(toReportCard)
  const counts = { needsYou: 0, repairing: 0, waiting: 0, ready: 0, settled: 0 }
  for (const card of cards) {
    if (counts[card.band] != null) counts[card.band] += 1
  }
  const bands = Object.keys(BANDS)
    .map((id) => {
      const meta = bandMeta(id)
      return {
        id,
        title: meta.title,
        helper: meta.helper,
        items: cards.filter((c) => c.band === id),
      }
    })
    .filter((b) => b.items.length > 0)

  return {
    schema: 'sdlc.pr-warden.report/v1',
    skill: 'pr-warden',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    window: input.window ?? null,
    mode: input.mode ?? 'manual',
    neverMerges: true,
    counts,
    total: cards.length,
    bands,
  }
}

/**
 * Inject a report document into the baked template. Safe for `</script>` in titles.
 * @param {object} document  buildReportDocument() output
 * @param {string} [templateHtml]
 */
export function renderHtmlReport(document, templateHtml) {
  const template =
    templateHtml ?? fs.readFileSync(REPORT_TEMPLATE, 'utf8')
  if (!template.includes(REPORT_DATA_TOKEN)) {
    throw new Error(`report template missing ${REPORT_DATA_TOKEN}`)
  }
  const json = JSON.stringify(document).replace(/</g, '\\u003c')
  return template.replace(REPORT_DATA_TOKEN, json)
}

export function writeHtmlReport(file, document) {
  const html = renderHtmlReport(document)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
  return file
}
