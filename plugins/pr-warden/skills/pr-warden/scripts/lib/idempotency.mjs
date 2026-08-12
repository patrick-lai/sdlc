/**
 * Idempotency keys and duplicate-run detection for scheduled PR Warden.
 */

import crypto from 'node:crypto'
import { keyDescription } from './link-parse.mjs'

/**
 * @param {object} parts
 * @param {import('./link-parse.mjs').PRWardenKey} parts.key
 * @param {string} [parts.skill]
 * @param {string} [parts.activityFingerprint]
 * @param {string} [parts.window]
 * @param {string} [parts.actionKind]
 */
export function buildIdempotencyKey(parts) {
  const skill = parts.skill ?? 'pr-warden'
  const fp = parts.activityFingerprint ?? 'none'
  const window = parts.window ?? dayWindow(new Date())
  const action = parts.actionKind ?? 'check'
  return [
    'pr-warden',
    skill,
    keyDescription(parts.key),
    action,
    fp,
    window,
  ].join(':')
}

/**
 * UTC day window for daily-style digests; override for finer schedules.
 * @param {Date} date
 */
export function dayWindow(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/**
 * Deep, deterministic JSON for hashing. Object keys are sorted at every level.
 * Do not use JSON.stringify(obj, Object.keys(obj)) — that replacer is an
 * allowlist applied at every nesting depth and drops nested fact fields.
 * @param {unknown} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const keys = Object.keys(value).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',')}}`
}

/**
 * Stable hash of mechanical facts/conditions for change detection.
 * @param {object} payload
 */
export function activityFingerprint(payload) {
  const json = stableStringify(payload ?? {})
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16)
}

/**
 * @param {string} key
 * @param {Set<string>|Map<string, any>|object} seen
 */
export function isDuplicate(key, seen) {
  if (seen instanceof Set) return seen.has(key)
  if (seen instanceof Map) return seen.has(key)
  if (seen && typeof seen === 'object') return Object.hasOwn(seen, key)
  return false
}
