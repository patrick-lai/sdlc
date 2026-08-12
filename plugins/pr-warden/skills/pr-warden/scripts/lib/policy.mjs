/**
 * Portable PR Warden policy.
 * Behavioral reference: ~/claude/raphael/Sources/RaphaelCore/PRWarden.swift (PRWardenPolicy)
 * Facts stay separate from decisions. mayMerge is permanently false.
 */

export const PRWardenState = Object.freeze({
  unknown: 'unknown',
  unreadable: 'unreadable',
  ciRed: 'ciRed',
  conflict: 'conflict',
  needsWork: 'needsWork',
  ciRunning: 'ciRunning',
  ciUnknown: 'ciUnknown',
  draft: 'draft',
  awaitingReview: 'awaitingReview',
  readyToMerge: 'readyToMerge',
  needsYou: 'needsYou',
  merged: 'merged',
  closed: 'closed',
})

export const PRWardenCI = Object.freeze({
  unknown: 'unknown',
  running: 'running',
  green: 'green',
  red: 'red',
})

export const DISPLAY_WORD = Object.freeze({
  unknown: 'not read yet',
  unreadable: 'cannot read PR',
  ciRed: 'CI red',
  conflict: 'conflict',
  needsWork: 'changes requested',
  ciRunning: 'CI running',
  ciUnknown: 'CI unknown',
  draft: 'draft',
  awaitingReview: 'awaiting review',
  readyToMerge: 'ready to merge',
  needsYou: 'needs you',
  merged: 'merged',
  closed: 'closed',
})

export const Policy = Object.freeze({
  minActiveCheckInterval: 5 * 60,
  defaultActiveCheckInterval: 15 * 60,
  awaitingReviewInterval: 30 * 60,
  readySafetyInterval: 12 * 3600,
  /** Bounded automatic repair attempts before escalate (portable default). */
  maxRepairAttempts: 3,
  afmWorkspace: 'atlassian',
  afmRepo: 'atlassian-frontend-monorepo',
  afmBranchDeployPipeline: 'default-jira-branch-deploy',
})

/**
 * @param {object} facts
 * @returns {string} PRWardenState
 */
export function classify(facts = {}) {
  const lifecycle = facts.lifecycle ?? 'open'
  if (lifecycle === 'merged' || lifecycle === 'deployed') return PRWardenState.merged
  if (lifecycle === 'declined') return PRWardenState.closed
  if (facts.ci === PRWardenCI.red) return PRWardenState.ciRed
  if (facts.changesRequested || (facts.unresolvedTasks ?? 0) > 0) {
    return PRWardenState.needsWork
  }
  if (facts.hasConflicts === true) return PRWardenState.conflict
  if (facts.isDraft) return PRWardenState.draft
  if ((facts.operatorActionCount ?? 0) > 0) return PRWardenState.needsYou
  if (facts.ci === PRWardenCI.running) return PRWardenState.ciRunning
  if (facts.ci === PRWardenCI.unknown) return PRWardenState.ciUnknown
  if (facts.hasConflicts === false && facts.approvalsSatisfied === true) {
    return PRWardenState.readyToMerge
  }
  // Gateless green: no approval requirement, no external gate, green CI, no conflicts
  if (
    facts.hasConflicts === false &&
    facts.approvalsSatisfied == null &&
    (facts.externalGateCount ?? 0) === 0 &&
    facts.ci === PRWardenCI.green
  ) {
    return PRWardenState.readyToMerge
  }
  return PRWardenState.awaitingReview
}

/**
 * @param {string} state
 */
export function needsOperator(state) {
  return (
    state === PRWardenState.draft ||
    state === PRWardenState.readyToMerge ||
    state === PRWardenState.needsYou
  )
}

/**
 * Agent may act only on repairable mechanical failures.
 * @param {string} state
 */
export function isActionableByAgent(state) {
  return (
    state === PRWardenState.ciRed ||
    state === PRWardenState.conflict ||
    state === PRWardenState.needsWork
  )
}

/**
 * Permanently false. PR Warden prepares and escalates; only the operator merges.
 * @param {object} [_record]
 */
export function mayMerge(_record) {
  return false
}

/**
 * @param {number} seconds
 */
export function clampActiveCheckInterval(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Policy.defaultActiveCheckInterval
  }
  return Math.max(Policy.minActiveCheckInterval, seconds)
}

/**
 * @param {string} state
 * @param {Date|number} now
 * @param {{ pipelineETA?: Date|number|null, activeInterval?: number }} [opts]
 * @returns {number|null} epoch ms for next check, or null when settled
 */
export function nextCheck(state, now = Date.now(), opts = {}) {
  const t = now instanceof Date ? now.getTime() : Number(now)
  const interval = clampActiveCheckInterval(
    opts.activeInterval ?? Policy.defaultActiveCheckInterval,
  )
  const eta =
    opts.pipelineETA == null
      ? null
      : opts.pipelineETA instanceof Date
        ? opts.pipelineETA.getTime()
        : Number(opts.pipelineETA)

  switch (state) {
    case PRWardenState.ciRunning: {
      const byInterval = t + interval
      if (eta == null) return byInterval
      return Math.min(byInterval, Math.max(t, eta))
    }
    case PRWardenState.unknown:
    case PRWardenState.unreadable:
    case PRWardenState.ciUnknown:
      return Math.max(
        t + Policy.minActiveCheckInterval,
        eta ?? t + interval,
      )
    case PRWardenState.awaitingReview:
    case PRWardenState.draft:
      return t + Policy.awaitingReviewInterval
    case PRWardenState.readyToMerge:
    case PRWardenState.needsYou:
      return t + Policy.readySafetyInterval
    case PRWardenState.ciRed:
    case PRWardenState.conflict:
    case PRWardenState.needsWork:
      return t
    case PRWardenState.merged:
    case PRWardenState.closed:
      return null
    default:
      return t + interval
  }
}

/**
 * @param {string} workspace
 * @param {string} repo
 */
export function isAFM(workspace, repo) {
  return (
    String(workspace).toLowerCase() === Policy.afmWorkspace &&
    String(repo).toLowerCase() === Policy.afmRepo
  )
}

/**
 * @param {{ workspace: string, repo: string, branch?: string|null, inFlightBuilds?: number[] }} args
 */
export function afmBranchDeployAction({ workspace, repo, branch, inFlightBuilds = [] }) {
  if (!isAFM(workspace, repo)) return { action: 'skipNotAFM' }
  if (!branch) return { action: 'skipNoBranch' }
  if (inFlightBuilds.length > 0) {
    return { action: 'skipAlreadyInFlight', build: inFlightBuilds[0] }
  }
  return {
    action: 'trigger',
    branch,
    pipeline: Policy.afmBranchDeployPipeline,
  }
}

/**
 * Gate journey derived from facts+state (never stored as source of truth).
 * @param {string} state
 * @param {object|null} facts
 * @param {{ repairing?: boolean }} [opts]
 */
export function gatesFrom(state, facts, opts = {}) {
  if (state === PRWardenState.merged) {
    return {
      ci: 'done',
      conflicts: 'done',
      feedback: 'done',
      approvals: 'done',
      ready: 'done',
    }
  }
  if (!facts || state === PRWardenState.unknown || state === PRWardenState.unreadable) {
    return {
      ci: 'pending',
      conflicts: 'pending',
      feedback: 'pending',
      approvals: 'pending',
      ready: 'pending',
    }
  }
  const lift = (status) =>
    status === 'blocked' && opts.repairing ? 'active' : status

  let ci = 'pending'
  if (facts.ci === PRWardenCI.green) ci = 'done'
  else if (facts.ci === PRWardenCI.red) ci = lift('blocked')
  else if (facts.ci === PRWardenCI.running) ci = 'active'

  let conflicts = 'pending'
  if (facts.hasConflicts === false) conflicts = 'done'
  else if (facts.hasConflicts === true) conflicts = lift('blocked')

  const feedback =
    facts.changesRequested || (facts.unresolvedTasks ?? 0) > 0
      ? lift('blocked')
      : 'done'

  let approvals = 'pending'
  if (facts.approvalsSatisfied === true) approvals = 'done'
  else if (
    facts.approvalsSatisfied === false ||
    (facts.externalGateCount ?? 0) > 0
  ) {
    approvals = 'human'
  }

  let ready = 'pending'
  if (
    state === PRWardenState.readyToMerge ||
    state === PRWardenState.needsYou ||
    state === PRWardenState.draft
  ) {
    ready = 'human'
  }

  return { ci, conflicts, feedback, approvals, ready }
}

/**
 * Decide next portable action from classified state + attempt budget.
 * Separates decision from facts (policy signal).
 * @param {{ state: string, attemptCount?: number, conditions?: object, maxAttempts?: number }} input
 */
export function decideNext(input) {
  const {
    state,
    attemptCount = 0,
    conditions = {},
    maxAttempts = Policy.maxRepairAttempts,
  } = input

  if (state === PRWardenState.merged || state === PRWardenState.closed) {
    return {
      decision: 'settle',
      reason: 'PR is terminal; stop polling',
      mayDispatchRepair: false,
      mayMerge: false,
    }
  }
  if (needsOperator(state)) {
    return {
      decision: 'handoff_operator',
      reason: DISPLAY_WORD[state] ?? state,
      mayDispatchRepair: false,
      mayMerge: false,
    }
  }
  if (
    state === PRWardenState.ciRunning ||
    state === PRWardenState.awaitingReview ||
    state === PRWardenState.ciUnknown ||
    state === PRWardenState.unknown
  ) {
    return {
      decision: 'wait_and_recheck',
      reason: 'Mechanical wait; no agent spend',
      mayDispatchRepair: false,
      mayMerge: false,
    }
  }
  if (state === PRWardenState.unreadable) {
    return {
      decision: 'retry_mechanical_read',
      reason: 'Could not read PR; retry without coding agent',
      mayDispatchRepair: false,
      mayMerge: false,
    }
  }
  if (isActionableByAgent(state)) {
    if (attemptCount >= maxAttempts) {
      return {
        decision: 'escalate_exhausted',
        reason: 'Automatic attempts exhausted — your turn',
        mayDispatchRepair: false,
        mayMerge: false,
      }
    }
    return {
      decision: 'dispatch_repair',
      reason: 'Repairable mechanical work remains',
      mayDispatchRepair: true,
      mayMerge: false,
      repairable: conditions.repairable ?? [],
      humanGates: [
        ...(conditions.operatorActions ?? []),
        ...(conditions.externalGates ?? []),
      ],
    }
  }
  return {
    decision: 'wait_and_recheck',
    reason: 'No actionable state',
    mayDispatchRepair: false,
    mayMerge: false,
  }
}
