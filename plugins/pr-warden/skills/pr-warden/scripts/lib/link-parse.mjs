/**
 * Portable PR Warden link parser.
 * Behavioral reference: ~/claude/raphael/Sources/RaphaelCore/PRWardenLink.swift
 * Pure and total — every refusal carries a reason. Bitbucket Cloud only.
 */

/**
 * @typedef {{ workspace: string, repo: string, number: number }} PRWardenKey
 * @typedef {{ key: PRWardenKey, url: string }} PRWardenLink
 * @typedef {{ ok: true, link: PRWardenLink } | { ok: false, failure: string, message: string }} ParseResult
 */

/**
 * @param {string} workspace
 * @param {string} repo
 * @param {number} number
 * @returns {PRWardenLink}
 */
export function makeLink(workspace, repo, number) {
  const key = {
    workspace: workspace.toLowerCase(),
    repo: repo.toLowerCase(),
    number,
  }
  return {
    key,
    url: `https://bitbucket.org/${key.workspace}/${key.repo}/pull-requests/${key.number}`,
  }
}

/**
 * Canonical key string used across ledger, audit, and idempotency.
 * Nullish / incomplete keys fall back to a stable placeholder so scheduled
 * sweeps never crash mid-batch.
 * @param {PRWardenKey | null | undefined} key
 */
export function keyDescription(key) {
  if (
    key == null ||
    key.workspace == null ||
    key.repo == null ||
    key.number == null ||
    !Number.isFinite(Number(key.number))
  ) {
    return 'bitbucket:unknown/unknown#0'
  }
  return `bitbucket:${key.workspace}/${key.repo}#${key.number}`
}

/**
 * @param {string | null | undefined} raw
 * @returns {number | null}
 */
function positiveInt(raw) {
  if (raw == null || raw === '') return null
  const value = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(value) || value <= 0) return null
  // Reject absurd "numbers" that would overflow paste noise
  if (String(raw).length > 12) return null
  return value
}

/**
 * @param {string} text
 */
function split(text) {
  let rest = text
  for (const scheme of ['https://', 'http://', 'ssh://']) {
    if (rest.toLowerCase().startsWith(scheme)) {
      rest = rest.slice(scheme.length)
      break
    }
  }
  let fragment = null
  const hash = rest.indexOf('#')
  if (hash >= 0) {
    fragment = rest.slice(hash + 1)
    rest = rest.slice(0, hash)
  }
  const query = rest.indexOf('?')
  if (query >= 0) rest = rest.slice(0, query)

  let comps = rest.split('/').filter(Boolean)
  let host = null
  if (comps[0] && comps[0].includes('.') && !comps[0].startsWith('.')) {
    host = comps[0].toLowerCase()
    if (host.startsWith('www.')) host = host.slice(4)
    comps = comps.slice(1)
  }
  return { host, comps, fragment }
}

/**
 * Accept Bitbucket PR URLs and shorthands `ws/repo#42`, `ws/repo/pull-requests/42`.
 * @param {string} raw
 * @returns {ParseResult}
 */
export function parsePRLink(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/^[<>"']+|[<>"']+$/g, '')
  if (!text) {
    return {
      ok: false,
      failure: 'empty',
      message: 'Paste a pull request link first.',
    }
  }

  const parsed = split(text)
  const { host, comps, fragment } = parsed

  // Shorthand: workspace/repo#42
  if (host == null && comps.length === 2) {
    const number = positiveInt(fragment)
    if (number != null) {
      return { ok: true, link: makeLink(comps[0], comps[1], number) }
    }
  }

  const prIndex = comps.indexOf('pull-requests')
  if (prIndex >= 2) {
    const number = positiveInt(comps[prIndex + 1])
    if (number != null) {
      if (host != null && host !== 'bitbucket.org') {
        return {
          ok: false,
          failure: 'unsupportedProvider',
          message: `PR Warden reads Bitbucket pull requests — ${host} isn't wired up yet.`,
        }
      }
      return {
        ok: true,
        link: makeLink(comps[prIndex - 2], comps[prIndex - 1], number),
      }
    }
  }

  if (host === 'github.com' || comps.includes('pull')) {
    return {
      ok: false,
      failure: 'unsupportedProvider',
      message:
        "PR Warden reads Bitbucket pull requests — GitHub isn't wired up yet.",
    }
  }
  if (comps.includes('merge_requests')) {
    const provider = host === 'gitlab.com' ? 'GitLab' : host ?? 'this host'
    return {
      ok: false,
      failure: 'unsupportedProvider',
      message: `PR Warden reads Bitbucket pull requests — ${provider} isn't wired up yet.`,
    }
  }

  return {
    ok: false,
    failure: 'notAPullRequest',
    message:
      "That isn't a pull request link. Expected bitbucket.org/workspace/repo/pull-requests/123.",
  }
}
