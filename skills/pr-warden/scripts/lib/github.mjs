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

export function githubCiState(combinedStatus, checkRuns = []) {
  const checks = checkRuns ?? []
  const hasSignals = Boolean(combinedStatus?.state) || checks.length > 0
  if (!hasSignals) return 'unknown'

  const active = checks.some((check) => check?.status !== 'completed')
  if (active || combinedStatus?.state === 'pending') return 'running'

  const failedConclusions = new Set([
    'failure',
    'timed_out',
    'action_required',
    'startup_failure',
  ])
  if (
    combinedStatus?.state === 'failure' ||
    combinedStatus?.state === 'error' ||
    checks.some((check) => failedConclusions.has(check?.conclusion))
  ) {
    return 'red'
  }

  const successfulConclusions = new Set(['success', 'neutral', 'skipped'])
  const checksAreGreen = checks.every((check) =>
    successfulConclusions.has(check?.conclusion),
  )
  if (checksAreGreen && (checks.length > 0 || combinedStatus?.state === 'success')) {
    return 'green'
  }
  return 'unknown'
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
