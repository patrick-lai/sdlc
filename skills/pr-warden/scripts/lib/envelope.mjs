/**
 * Provider-neutral, auditable result envelope.
 * Facts are separated from decisions. Every result exposes confidence,
 * provenance, assumptions, and evidence gaps.
 */

import { buildIdempotencyKey, activityFingerprint } from './idempotency.mjs'
import { keyDescription } from './link-parse.mjs'
import {
  classify,
  decideNext,
  gatesFrom,
  DISPLAY_WORD,
  mayMerge,
} from './policy.mjs'
import { operatorHelper } from './copy.mjs'

/**
 * @param {object} input
 * @returns {object} result envelope v1
 */
export function buildResultEnvelope(input = {}) {
  const now = input.now ? new Date(input.now) : new Date()
  const key = input.key
  const facts = input.facts ?? null
  const conditions = input.conditions ?? {
    repairable: [],
    operatorActions: [],
    externalGates: [],
    waiting: [],
    ignored: [],
  }
  const state =
    input.state ??
    (facts ? classify(facts) : input.unreadable ? 'unreadable' : 'unknown')
  const decision = input.decision ?? decideNext({
    state,
    attemptCount: input.attemptCount ?? 0,
    conditions,
    maxAttempts: input.maxAttempts,
  })
  const gates = gatesFrom(state, facts, { repairing: Boolean(input.repairing) })
  const fp =
    input.activityFingerprint ??
    activityFingerprint({
      state,
      facts: facts ?? {},
      repairable: conditions.repairable,
      waiting: conditions.waiting,
    })
  const idempotencyKey =
    input.idempotencyKey ??
    buildIdempotencyKey({
      key,
      skill: input.skill ?? 'pr-warden',
      activityFingerprint: fp,
      window: input.window,
      actionKind: decision.decision,
    })

  const evidenceGaps = [...(input.evidenceGaps ?? [])]
  const assumptions = [...(input.assumptions ?? [])]
  if (!facts) {
    evidenceGaps.push('No mechanical PR facts available for this run')
    assumptions.push('Proceeding with best-effort classification from partial context')
  } else {
    if (facts.ci === 'unknown') evidenceGaps.push('CI status unknown')
    if (facts.hasConflicts == null) evidenceGaps.push('Conflict status not probed')
    if (facts.approvalsSatisfied == null) {
      assumptions.push('No approval merge-check detected; gateless-green rules may apply')
    }
  }

  let confidence = input.confidence
  if (confidence == null) {
    confidence = computeConfidence({ state, facts, evidenceGaps, permissionFailure: input.permissionFailure })
  }

  const actions = (input.actions ?? []).map((a) => ({
    surface: a.surface, // bitbucket | jira | none
    kind: a.kind,
    status: a.status, // planned | done | skipped | failed | retrying
    itemKey: a.itemKey ?? (key ? keyDescription(key) : undefined),
    evidenceUrl: a.evidenceUrl ?? null,
    error: a.error ?? null,
    idempotencyKey: a.idempotencyKey ?? null,
  }))

  return {
    schema: 'sdlc.pr-warden.result/v1',
    skill: input.skill ?? 'pr-warden',
    mode: input.mode ?? 'manual',
    generatedAt: now.toISOString(),
    idempotencyKey,
    item: {
      provider: key?.provider ?? 'bitbucket',
      key: key ? keyDescription(key) : null,
      workspace: key?.workspace ?? null,
      repo: key?.repo ?? null,
      number: key?.number ?? null,
      url: input.url ?? null,
      title: input.title ?? null,
      branch: input.branch ?? null,
      jiraKeys: input.jiraKeys ?? [],
    },
    // Facts (evidence) — never mix policy decisions into this block
    facts: facts,
    conditions,
    gates,
    // Decisions / policy signals
    state,
    displayWord: DISPLAY_WORD[state] ?? state,
    decision,
    attemptCount: input.attemptCount ?? 0,
    permissionFailure: Boolean(input.permissionFailure),
    policy: {
      mayMerge: mayMerge(),
      codeChangeMode: input.codeChangeMode ?? 'pr_only_trusted_paths',
      trustedPaths: input.trustedPaths ?? [],
      /** When true, actions are withhold signals only — executors must not mutate. */
      dryRun: Boolean(input.dryRun),
    },
    actions,
    confidence,
    provenance: input.provenance ?? [
      {
        source: 'mechanical-read',
        tool: input.tool ?? 'provider API or supplied snapshot',
        at: now.toISOString(),
      },
    ],
    assumptions,
    evidenceGaps,
    audit: {
      events: input.auditEvents ?? [],
    },
    duplicateOf: input.duplicateOf ?? null,
    error: input.error ?? null,
  }
}

/**
 * @param {{ state: string, facts: object|null, evidenceGaps: string[], permissionFailure?: boolean }} args
 */
export function computeConfidence({ state, facts, evidenceGaps, permissionFailure }) {
  if (permissionFailure) return 0.15
  if (state === 'unreadable' || !facts) return 0.25
  if (state === 'unknown') return 0.2
  let c = 0.9
  c -= Math.min(0.4, (evidenceGaps?.length ?? 0) * 0.1)
  if (facts.ci === 'unknown') c -= 0.15
  if (facts.hasConflicts == null) c -= 0.1
  return Math.max(0.1, Math.min(1, Number(c.toFixed(2))))
}

/**
 * Compact provider-neutral markdown for pull-request status reports.
 * @param {object} envelope
 */
export function renderMarkdown(envelope) {
  const item = envelope.item ?? {}
  const label = item.key ?? 'unknown'
  const title = item.title ? ` — ${item.title}` : ''
  const helper = operatorHelper(envelope)
  const lines = [
    `### PR Warden · ${envelope.displayWord}`,
    '',
    `**${label}**${title}`,
    '',
    helper,
    '',
    `| | |`,
    `|---|---|`,
    `| **Item** | ${envelope.item.key ?? 'unknown'} |`,
    `| **State** | ${envelope.displayWord} |`,
    `| **Decision** | \`${envelope.decision?.decision ?? 'n/a'}\` |`,
    `| **Confidence** | ${(envelope.confidence * 100).toFixed(0)}% |`,
    `| **Idempotency** | \`${envelope.idempotencyKey}\` |`,
    '',
  ]
  if (envelope.conditions?.repairable?.length) {
    lines.push('**Repairable**')
    for (const r of envelope.conditions.repairable) lines.push(`- ${r}`)
    lines.push('')
  }
  const human = [
    ...(envelope.conditions?.operatorActions ?? []),
    ...(envelope.conditions?.externalGates ?? []),
  ]
  if (human.length) {
    lines.push('**Human / external gates** (not auto-acted)')
    for (const h of human) lines.push(`- ${h}`)
    lines.push('')
  }
  if (envelope.actions?.length) {
    lines.push('**Actions**')
    for (const a of envelope.actions) {
      const ev = a.evidenceUrl ? ` · [evidence](${a.evidenceUrl})` : ''
      lines.push(`- \`${a.surface}\` ${a.kind}: **${a.status}**${ev}`)
    }
    lines.push('')
  }
  if (envelope.assumptions?.length) {
    lines.push('**Assumptions**')
    for (const a of envelope.assumptions) lines.push(`- ${a}`)
    lines.push('')
  }
  if (envelope.evidenceGaps?.length) {
    lines.push('**Evidence gaps**')
    for (const g of envelope.evidenceGaps) lines.push(`- ${g}`)
    lines.push('')
  }
  lines.push('_PR Warden never merges. Facts above are mechanical; decisions are policy._')
  return lines.join('\n')
}
