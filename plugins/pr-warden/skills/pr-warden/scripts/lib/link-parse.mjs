/**
 * Provider-neutral pull-request link parser.
 * Pure and total: every refusal carries a reason.
 */

/**
 * @typedef {'github'|'bitbucket'} PRProvider
 * @typedef {{ provider?: PRProvider, workspace: string, repo: string, number: number }} PRWardenKey
 * @typedef {{ key: PRWardenKey, url: string }} PRWardenLink
 * @typedef {{ ok: true, link: PRWardenLink } | { ok: false, failure: string, message: string }} ParseResult
 */

/** @param {string} workspace @param {string} repo @param {number} number @param {PRProvider} [provider] */
export function makeLink(workspace, repo, number, provider = 'bitbucket') {
  const key = {
    provider,
    workspace: workspace.toLowerCase(),
    repo: repo.toLowerCase(),
    number,
  }
  const url = provider === 'github'
    ? `https://github.com/${key.workspace}/${key.repo}/pull/${key.number}`
    : `https://bitbucket.org/${key.workspace}/${key.repo}/pull-requests/${key.number}`
  return { key, url }
}

/** @param {PRWardenKey | null | undefined} key */
export function keyDescription(key) {
  const provider = key?.provider ?? 'bitbucket'
  if (
    key == null || key.workspace == null || key.repo == null || key.number == null ||
    !Number.isFinite(Number(key.number))
  ) {
    return `${provider}:unknown/unknown#0`
  }
  return `${provider}:${String(key.workspace).toLowerCase()}/${String(key.repo).toLowerCase()}#${key.number}`
}

function positiveInt(raw) {
  if (raw == null || raw === '') return null
  const value = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(value) || value <= 0 || String(raw).length > 12) return null
  return value
}

function clean(raw) {
  return String(raw ?? '').trim().replace(/^[<>"']+|[<>"']+$/g, '')
}

/**
 * Accept GitHub and Bitbucket Cloud PR URLs plus explicit shorthands:
 * `github:owner/repo#42` and `bitbucket:workspace/repo#42`.
 * The legacy unprefixed `workspace/repo#42` shorthand remains Bitbucket.
 * @param {string} raw
 * @returns {ParseResult}
 */
export function parsePRLink(raw) {
  const text = clean(raw)
  if (!text) return { ok: false, failure: 'empty', message: 'Paste a pull request link first.' }

  const shorthand = text.match(/^(?:(github|bitbucket):)?([^/\s]+)\/([^/#\s]+)#(\d+)$/i)
  if (shorthand) {
    const provider = /** @type {PRProvider} */ ((shorthand[1]?.toLowerCase() || 'bitbucket'))
    const number = positiveInt(shorthand[4])
    if (number != null) return { ok: true, link: makeLink(shorthand[2], shorthand[3], number, provider) }
  }
  const legacyBitbucket = text.match(/^([^/\s]+)\/([^/\s]+)\/pull-requests\/(\d+)$/i)
  if (legacyBitbucket) {
    const number = positiveInt(legacyBitbucket[3])
    if (number != null) return { ok: true, link: makeLink(legacyBitbucket[1], legacyBitbucket[2], number, 'bitbucket') }
  }

  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
    const url = new URL(candidate)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const parts = url.pathname.split('/').filter(Boolean)

    if (host === 'github.com' && parts.length >= 4 && parts[2] === 'pull') {
      const number = positiveInt(parts[3])
      if (number != null) return { ok: true, link: makeLink(parts[0], parts[1], number, 'github') }
    }
    if (host === 'bitbucket.org' && parts.length >= 4 && parts[2] === 'pull-requests') {
      const number = positiveInt(parts[3])
      if (number != null) return { ok: true, link: makeLink(parts[0], parts[1], number, 'bitbucket') }
    }
    if (parts.includes('pull') || parts.includes('pull-requests') || parts.includes('merge_requests')) {
      return {
        ok: false,
        failure: 'unsupportedProvider',
        message: `PR Warden supports public GitHub and Bitbucket Cloud pull requests; ${host} is not supported.`,
      }
    }
  } catch {
    // Fall through to the stable refusal below.
  }

  return {
    ok: false,
    failure: 'notAPullRequest',
    message: 'Expected github.com/owner/repo/pull/123 or bitbucket.org/workspace/repo/pull-requests/123.',
  }
}
