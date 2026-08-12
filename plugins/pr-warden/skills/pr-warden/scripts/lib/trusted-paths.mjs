/**
 * PR-only trusted-path gate for automatic code changes.
 * Initial review gate: code-change automation is PR-only and restricted to trusted globs.
 */

import path from 'node:path'

/**
 * Convert a simple glob (`**`, `*`, `?`) to a RegExp.
 * @param {string} pattern
 */
function globToRegExp(pattern) {
  let i = 0
  let out = '^'
  const s = pattern.replace(/\\/g, '/')
  while (i < s.length) {
    const c = s[i]
    if (c === '*') {
      if (s[i + 1] === '*') {
        // ** optionally followed by /
        if (s[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 3
        } else {
          out += '.*'
          i += 2
        }
      } else {
        out += '[^/]*'
        i += 1
      }
    } else if (c === '?') {
      out += '[^/]'
      i += 1
    } else if ('+.^${}()|[]\\'.includes(c)) {
      out += `\\${c}`
      i += 1
    } else {
      out += c
      i += 1
    }
  }
  out += '$'
  return new RegExp(out)
}

/**
 * Normalize a repo-relative path.
 * Collapses `.` / `..` via path.posix.normalize so traversal cannot spoof globs.
 * @param {string} p
 */
export function normalizeRepoPath(p) {
  let s = String(p).replace(/\\/g, '/')
  // Drop redundant leading ./ before normalize
  s = s.replace(/^\.\/+/, '')
  s = path.posix.normalize(s)
  if (s === '.' || s === '') return ''
  if (s.startsWith('./')) s = s.slice(2)
  return s
}

/**
 * True when the normalized path escapes the repo root or still contains `..`.
 * @param {string} rel
 */
function isPathEscape(rel) {
  if (!rel) return true
  if (path.posix.isAbsolute(rel)) return true
  if (rel === '..' || rel.startsWith('../')) return true
  return rel.split('/').includes('..')
}

/**
 * @param {string} filePath
 * @param {string[]} trustedGlobs
 */
export function isTrustedPath(filePath, trustedGlobs = []) {
  // Absolute / Windows drive paths are never repo-relative trusted edits
  if (path.isAbsolute(filePath) || /^[A-Za-z]:[\\/]/.test(filePath)) return false
  const rel = normalizeRepoPath(filePath)
  if (isPathEscape(rel)) return false
  if (!trustedGlobs.length) return false
  return trustedGlobs.some((g) => globToRegExp(normalizeRepoPath(g)).test(rel))
}

/**
 * Filter proposed file changes against trusted paths.
 * @param {string[]} files
 * @param {string[]} trustedGlobs
 */
export function partitionTrusted(files, trustedGlobs) {
  const allowed = []
  const blocked = []
  for (const f of files) {
    if (isTrustedPath(f, trustedGlobs)) allowed.push(normalizeRepoPath(f))
    else blocked.push(normalizeRepoPath(f))
  }
  return { allowed, blocked }
}

/**
 * Guardrail decision for automatic code mutation.
 * @param {{ mode?: string, files?: string[], trustedPaths?: string[], targetIsPullRequest?: boolean }} input
 */
export function gateCodeChange(input = {}) {
  const mode = input.mode ?? 'pr_only_trusted_paths'
  const files = input.files ?? []
  const trustedPaths = input.trustedPaths ?? []
  const targetIsPullRequest = input.targetIsPullRequest !== false

  if (mode === 'off' || mode === 'observe_only') {
    return {
      allowed: false,
      reason: 'Code-change automation is disabled for this run',
      allowedFiles: [],
      blockedFiles: files.map(normalizeRepoPath),
    }
  }

  if (!targetIsPullRequest) {
    return {
      allowed: false,
      reason: 'Automatic code changes are PR-only',
      allowedFiles: [],
      blockedFiles: files.map(normalizeRepoPath),
    }
  }

  if (!trustedPaths.length) {
    return {
      allowed: false,
      reason: 'No trusted_paths configured; refusing automatic edits',
      allowedFiles: [],
      blockedFiles: files.map(normalizeRepoPath),
    }
  }

  const { allowed, blocked } = partitionTrusted(files, trustedPaths)
  if (blocked.length && !allowed.length) {
    return {
      allowed: false,
      reason: 'All proposed paths are outside trusted_paths',
      allowedFiles: [],
      blockedFiles: blocked,
    }
  }
  if (blocked.length) {
    return {
      allowed: true,
      partial: true,
      reason: 'Some paths blocked by trusted_paths; edit only allowed files',
      allowedFiles: allowed,
      blockedFiles: blocked,
    }
  }
  return {
    allowed: true,
    partial: false,
    reason: 'All paths within trusted_paths on a PR branch',
    allowedFiles: allowed,
    blockedFiles: [],
  }
}

/** Sensible defaults when a repo has not configured its own list. */
export const DEFAULT_TRUSTED_PATHS = Object.freeze([
  'src/**',
  'lib/**',
  'app/**',
  'packages/*/src/**',
  'packages/*/lib/**',
  'services/*/src/**',
  'components/**',
  'modules/**',
  'tests/**',
  'test/**',
  '__tests__/**',
  'fixtures/**',
  'scripts/**',
  'docs/**',
  '*.md',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])
