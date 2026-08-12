/**
 * Operator-facing copy for PR Warden reports (HTML + provider-neutral markdown).
 * One home — do not restate these sentences in SKILL.md or the HTML template.
 */

export const BANDS = Object.freeze({
  needsYou: {
    id: 'needsYou',
    title: 'Needs you',
    helper:
      'Human-only gate. Warden will not push, approve, mark ready, or merge.',
  },
  repairing: {
    id: 'repairing',
    title: 'Warden can act',
    helper:
      'Repairable mechanical failure. Bounded attempts, PR branch + trusted paths only.',
  },
  waiting: {
    id: 'waiting',
    title: 'Waiting',
    helper: 'Nothing to repair this tick. Warden rechecks; it will not nag.',
  },
  ready: {
    id: 'ready',
    title: 'Ready to merge',
    helper: 'Gates are clear. You merge in your provider. Warden never will.',
  },
  settled: {
    id: 'settled',
    title: 'Settled',
    helper: 'Merged or closed. Watch work is done.',
  },
})

const STATE_HELPER = Object.freeze({
  ciRed:
    'Required CI is red. Warden may push a repair on the PR source branch if attempts remain.',
  conflict:
    'The source branch conflicts with the destination. Warden may rebase that branch (force-with-lease only after its own rebase).',
  needsWork:
    'Reviewer feedback or unresolved tasks are still open. Warden may edit trusted paths on the PR branch.',
  needsYou:
    'Automatic repair cannot proceed. Approval, draft, exhausted attempts, or an out-of-policy path sits with you.',
  readyToMerge:
    'Mechanical gates are clear. Merge in your provider when you want it landed — Warden will not press merge.',
  ciRunning:
    'Checks are still running. Warden waits and will not spend a repair attempt on a moving build.',
  ciUnknown:
    'CI could not be read. No repair is dispatched until a mechanical status exists.',
  awaitingReview:
    'Nothing repairable. Waiting on reviewers. Warden stays quiet until the picture changes.',
  draft:
    'Draft PRs are operator-owned. Mark ready yourself; Warden will not.',
  unreadable:
    'The PR could not be read (auth or network). No mutations. Authenticate the provider CLI/API and retry.',
  unknown: 'Not classified yet. The next tick will attempt a mechanical read.',
  merged: 'Already merged. Warden has nothing left to do.',
  closed: 'PR is declined or closed. Warden stops.',
})

const FALLBACK_HELPER =
  'See mechanical facts below. Warden never merges, never approves, never marks ready.'

/**
 * One operator sentence: what this state means and what they (or Warden) will do.
 * @param {object} envelope
 */
export function operatorHelper(envelope = {}) {
  const state = envelope.state
  const decision = envelope.decision?.decision
  const confidence = envelope.confidence

  if (envelope.permissionFailure || confidence === 0.15) {
    return 'Auth or permission failed reading this PR. No mutations. Authenticate the provider CLI/API and retry.'
  }
  if (decision === 'escalate_exhausted') {
    return 'Automatic attempts exhausted — your turn. Warden will not push again until new human activity changes the picture.'
  }
  if (decision === 'handoff_operator' && state === 'readyToMerge') {
    return STATE_HELPER.readyToMerge
  }

  let text = STATE_HELPER[state] ?? FALLBACK_HELPER
  if (envelope.policy?.dryRun && envelope.decision?.mayDispatchRepair) {
    text += ' Dry run: the repair is planned, not pushed.'
  }
  return text
}

/**
 * Which report band a result belongs in.
 * @param {object} envelope
 */
export function bandFor(envelope = {}) {
  const state = envelope.state
  const decision = envelope.decision?.decision
  if (state === 'merged' || state === 'closed') return 'settled'
  if (state === 'readyToMerge') return 'ready'
  if (
    decision === 'escalate_exhausted' ||
    state === 'needsYou' ||
    state === 'draft' ||
    state === 'unreadable' ||
    envelope.permissionFailure ||
    (typeof envelope.confidence === 'number' && envelope.confidence <= 0.2)
  ) {
    return 'needsYou'
  }
  if (envelope.decision?.mayDispatchRepair) return 'repairing'
  if (
    state === 'ciRunning' ||
    state === 'ciUnknown' ||
    state === 'awaitingReview' ||
    state === 'unknown'
  ) {
    return 'waiting'
  }
  return 'needsYou'
}

export function bandMeta(id) {
  return BANDS[id] ?? BANDS.needsYou
}

export { STATE_HELPER, FALLBACK_HELPER }
