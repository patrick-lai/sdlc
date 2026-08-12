/**
 * File-backed run ledger for idempotent scheduled sweeps.
 * Stores per-item last result keys so duplicate ticks no-op safely.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {string} filePath
 * @returns {{ version: number, runs: Record<string, object> }}
 */
export function loadLedger(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return emptyLedger()
    return {
      version: data.version ?? 1,
      runs: data.runs && typeof data.runs === 'object' ? data.runs : {},
      watches: data.watches && typeof data.watches === 'object' ? data.watches : {},
      config: data.config ?? {},
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyLedger()
    // Corrupt ledger → empty so one bad local file never crashes the sweep.
    return emptyLedger()
  }
}

function emptyLedger() {
  return { version: 1, runs: {}, watches: {}, config: {} }
}

/**
 * @param {string} filePath
 * @param {object} ledger
 */
export function saveLedger(filePath, ledger) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, filePath)
}

/**
 * @param {object} ledger
 * @param {string} idempotencyKey
 */
export function hasRun(ledger, idempotencyKey) {
  return Boolean(ledger.runs?.[idempotencyKey])
}

/**
 * @param {object} ledger
 * @param {string} idempotencyKey
 * @param {object} record
 */
export function recordRun(ledger, idempotencyKey, record) {
  ledger.runs = ledger.runs ?? {}
  ledger.runs[idempotencyKey] = {
    at: record.at ?? new Date().toISOString(),
    itemKey: record.itemKey,
    skill: record.skill,
    decision: record.decision,
    status: record.status ?? 'done',
  }
  return ledger
}

/**
 * Upsert a watch record (portable subset of PRWardenRecord).
 * @param {object} ledger
 * @param {string} id
 * @param {object} watch
 */
export function upsertWatch(ledger, id, watch) {
  ledger.watches = ledger.watches ?? {}
  const prev = ledger.watches[id] ?? {}
  ledger.watches[id] = {
    ...prev,
    ...watch,
    id,
    updatedAt: watch.updatedAt ?? new Date().toISOString(),
  }
  return ledger.watches[id]
}

/**
 * @param {object} ledger
 * @param {string} id
 */
export function stopWatch(ledger, id) {
  if (!ledger.watches?.[id]) return null
  ledger.watches[id] = {
    ...ledger.watches[id],
    enabled: false,
    nextCheckAt: null,
    updatedAt: new Date().toISOString(),
  }
  return ledger.watches[id]
}

/**
 * Due enabled watches whose nextCheckAt <= now.
 * @param {object} ledger
 * @param {Date|string|number} now
 */
export function dueWatches(ledger, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Object.values(ledger.watches ?? {}).filter((w) => {
    if (!w.enabled) return false
    if (w.lease) return false
    if (!w.nextCheckAt) return true
    return new Date(w.nextCheckAt).getTime() <= t
  })
}
