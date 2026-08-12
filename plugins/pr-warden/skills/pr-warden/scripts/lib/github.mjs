function reviewOrder(review) {
  const submittedAt = Date.parse(review?.submitted_at ?? '')
  const id = Number(review?.id)
  return {
    submittedAt: Number.isFinite(submittedAt) ? submittedAt : null,
    id: Number.isFinite(id) ? id : 0,
  }
}

function isLaterReview(candidate, current) {
  const next = reviewOrder(candidate)
  const previous = reviewOrder(current)
  if (next.submittedAt !== null && previous.submittedAt !== null) {
    if (next.submittedAt !== previous.submittedAt) return next.submittedAt > previous.submittedAt
    return next.id > previous.id
  }
  if (next.submittedAt !== null) return true
  if (previous.submittedAt !== null) return false
  return next.id > previous.id
}

export function latestReviewStates(reviews) {
  const latestByUser = new Map()
  for (const review of reviews ?? []) {
    const login = review?.user?.login?.toLowerCase()
    if (!login) continue
    const current = latestByUser.get(login)
    if (!current || isLaterReview(review, current)) latestByUser.set(login, review)
  }
  return [...latestByUser.values()].map((review) => review.state)
}

export function githubConflictStatus(pr, lifecycle) {
  if (lifecycle !== 'open') return false
  if (pr?.mergeable_state === 'dirty') return true
  if (pr?.mergeable_state === 'clean' || pr?.mergeable === true) return false
  return null
}

export function githubCiState(combinedStatus, checkRuns = [], requiredCheckNames = null) {
  if (!Array.isArray(requiredCheckNames)) return 'unknown'
  if (requiredCheckNames.length === 0) return 'green'

  const checks = checkRuns ?? []
  const statuses = combinedStatus?.statuses ?? []
  const required = requiredCheckNames.map((name) =>
    checks.find((check) => check?.name === name) ??
    statuses.find((status) => status?.context === name),
  )
  if (required.some((signal) => !signal)) return 'running'

  const isCheckRun = (signal) => 'conclusion' in signal || 'status' in signal
  const active = required.some((signal) =>
    isCheckRun(signal)
      ? signal.status !== 'completed'
      : signal.state === 'pending',
  )
  if (active) return 'running'

  const failedConclusions = new Set([
    'failure',
    'timed_out',
    'action_required',
    'startup_failure',
  ])
  if (
    required.some((signal) =>
      isCheckRun(signal)
        ? failedConclusions.has(signal.conclusion)
        : signal.state === 'failure' || signal.state === 'error',
    )
  ) {
    return 'red'
  }

  const successfulConclusions = new Set(['success', 'neutral', 'skipped'])
  const green = required.every((signal) =>
    isCheckRun(signal)
      ? successfulConclusions.has(signal.conclusion)
      : signal.state === 'success',
  )
  return green ? 'green' : 'unknown'
}

export function unknownReviewFacts() {
  return {
    reviewStateKnown: false,
    changesRequested: null,
    approvalsSatisfied: null,
    reviewCount: null,
    approvedReviews: null,
    changesRequestedReviews: null,
  }
}

export async function readScheduledWatch(watch, readGitHubSnapshot) {
  const provider = watch?.key?.provider ?? 'github'
  const base = {
    key: watch.key,
    title: watch.title,
    url: watch.url,
    branch: watch.branch,
    jiraKeys: watch.jiraKeys ?? [],
    attemptCount: watch.attemptCount ?? 0,
  }
  if (provider !== 'github') {
    return {
      ...base,
      unreadable: true,
      error: `live_read_unsupported_provider:${provider}`,
    }
  }

  const url = watch.url ?? `https://github.com/${watch.key.workspace}/${watch.key.repo}/pull/${watch.key.number}`
  try {
    const snapshot = await readGitHubSnapshot({ key: watch.key, url })
    return {
      ...snapshot,
      jiraKeys: base.jiraKeys,
      attemptCount: base.attemptCount,
    }
  } catch (error) {
    return {
      ...base,
      url,
      unreadable: true,
      error: `live_read_failed:${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
