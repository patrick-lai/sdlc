#!/usr/bin/env node
/**
 * Smallest scheduler/adapter seam for portable PR Warden.
 *
 * Does NOT reimplement Lumine PR Warden. It:
 *  - normalizes invocation (manual / scheduled)
 *  - enforces idempotency via a file ledger
 *  - classifies facts with portable policy
 *  - emits the auditable Atlassian-native envelope
 *  - plans Bitbucket/Jira per-item actions (agent or operator executes side effects)
 *
 * When Raphael/MCP is available, prefer:
 *   pr_warden_watch / pr_warden_status / pr_warden_stop
 * and let the baked-in loop own dispatch. This adapter is the portable path
 * for Claude, Codex, and cron/agent schedules outside Lumine.
 *
 * Usage:
 *   node adapter.mjs parse-link <url>
 *   node adapter.mjs classify --facts fixtures/pr-snapshot.ci-red.json
 *   node adapter.mjs run --config examples/schedule.config.json --fixture fixtures/...
 *   node adapter.mjs sweep --config examples/schedule.config.json --fixture-dir fixtures
 *   node adapter.mjs digest --config examples/schedule.config.json --fixture-dir fixtures
 *   node adapter.mjs gate-paths --files a,b --trusted 'src/**'
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePRLink, keyDescription, makeLink } from './lib/link-parse.mjs'
import {
  classify,
  decideNext,
  nextCheck,
  gatesFrom,
  mayMerge,
  Policy,
  DISPLAY_WORD,
  isActionableByAgent,
} from './lib/policy.mjs'
import {
  buildResultEnvelope,
  renderAtlassianMarkdown,
} from './lib/envelope.mjs'
import {
  loadLedger,
  saveLedger,
  hasRun,
  recordRun,
  upsertWatch,
  stopWatch,
  dueWatches,
} from './lib/ledger.mjs'
import {
  buildIdempotencyKey,
  activityFingerprint,
  dayWindow,
} from './lib/idempotency.mjs'
import {
  gateCodeChange,
  DEFAULT_TRUSTED_PATHS,
} from './lib/trusted-paths.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = path.resolve(__dirname, '..')

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    } else {
      args._.push(a)
    }
  }
  return args
}

function resolveConfig(args) {
  const defaults = {
    ledgerPath: path.join(SKILL_ROOT, '.pr-warden-ledger.json'),
    trustedPaths: [...DEFAULT_TRUSTED_PATHS],
    codeChangeMode: 'pr_only_trusted_paths',
    checkIntervalMinutes: 15,
    maxAttempts: Policy.maxRepairAttempts,
    actions: { bitbucket: true, jira: true },
    dryRun: true,
    /** Operator site base, e.g. https://jira.example.com — unset ⇒ no Jira evidence URL */
    jiraBaseUrl: null,
    repositories: [],
  }
  if (!args.config) return defaults
  const cfg = readJson(path.resolve(args.config))
  return {
    ...defaults,
    ...cfg,
    actions: { ...defaults.actions, ...(cfg.actions ?? {}) },
    trustedPaths: cfg.trustedPaths ?? defaults.trustedPaths,
    ledgerPath: path.resolve(cfg.ledgerPath ?? defaults.ledgerPath),
    jiraBaseUrl: cfg.jiraBaseUrl ?? defaults.jiraBaseUrl,
  }
}

/**
 * Build a Jira browse URL only when the operator configured a site base.
 * @param {object} config
 * @param {string} issueKey
 * @returns {string|null}
 */
function jiraEvidenceUrl(config, issueKey) {
  const base = config.jiraBaseUrl
  if (!base || typeof base !== 'string') return null
  const trimmed = base.replace(/\/+$/, '')
  if (!trimmed) return null
  return `${trimmed}/browse/${issueKey}`
}

/** Action status: dry-run withholds execution; live plans side effects. */
function actionStatus(config, { observeOnly = false } = {}) {
  if (observeOnly) return 'skipped'
  return config.dryRun ? 'skipped' : 'planned'
}

/**
 * Normalize a fixture or live snapshot into facts + conditions + key.
 * Fixture shape matches portable extract of TodayService.PRWardenSnapshot.
 */
function normalizeSnapshot(snap, fallbackKey) {
  const key =
    snap.key ??
    (snap.workspace && snap.repo && snap.number
      ? {
          workspace: String(snap.workspace).toLowerCase(),
          repo: String(snap.repo).toLowerCase(),
          number: Number(snap.number),
        }
      : fallbackKey)

  const facts = snap.facts ?? {
    lifecycle: snap.lifecycle ?? 'open',
    isDraft: Boolean(snap.isDraft),
    ci: snap.ci ?? 'unknown',
    hasConflicts: snap.hasConflicts ?? null,
    unresolvedTasks: snap.unresolvedTasks ?? 0,
    changesRequested: Boolean(snap.changesRequested),
    approvalsSatisfied:
      snap.approvalsSatisfied === undefined ? null : snap.approvalsSatisfied,
    operatorActionCount: snap.operatorActionCount ?? 0,
    externalGateCount: snap.externalGateCount ?? 0,
  }

  const conditions = snap.conditions ?? {
    repairable: snap.repairable ?? [],
    operatorActions: snap.operatorActions ?? [],
    externalGates: snap.externalGates ?? [],
    waiting: snap.waiting ?? [],
    ignored: snap.ignored ?? [],
  }

  return {
    key,
    facts,
    conditions,
    title: snap.title ?? `Pull request #${key?.number ?? '?'}`,
    url: snap.url ?? (key ? makeLink(key.workspace, key.repo, key.number).url : null),
    branch: snap.branch ?? snap.sourceBranch ?? null,
    jiraKeys: snap.jiraKeys ?? [],
    unreadable: Boolean(snap.unreadable),
    permissionFailure: Boolean(snap.permissionFailure),
    attemptCount: snap.attemptCount ?? 0,
    error: snap.error ?? null,
  }
}

function planActions({ config, key, state, decision, url, jiraKeys, skill }) {
  const actions = []
  if (!key) return actions

  const itemKey = keyDescription(key)
  const bbBase = url ?? makeLink(key.workspace, key.repo, key.number).url

  if (config.actions?.bitbucket) {
    if (decision.decision === 'dispatch_repair') {
      actions.push({
        surface: 'bitbucket',
        kind: 'repair_pass',
        status: actionStatus(config),
        itemKey,
        evidenceUrl: bbBase,
        idempotencyKey: buildIdempotencyKey({
          key,
          skill,
          actionKind: 'repair_pass',
          activityFingerprint: decision.reason,
        }),
      })
    } else if (decision.decision === 'handoff_operator' || decision.decision === 'escalate_exhausted') {
      actions.push({
        surface: 'bitbucket',
        kind: 'status_comment',
        status: actionStatus(config),
        itemKey,
        evidenceUrl: bbBase,
        idempotencyKey: buildIdempotencyKey({
          key,
          skill,
          actionKind: 'status_comment',
          window: dayWindow(),
        }),
      })
    } else if (decision.decision === 'wait_and_recheck') {
      actions.push({
        surface: 'bitbucket',
        kind: 'observe_only',
        status: actionStatus(config, { observeOnly: true }),
        itemKey,
        evidenceUrl: bbBase,
      })
    }
  }

  if (config.actions?.jira && (jiraKeys?.length ?? 0) > 0) {
    for (const jk of jiraKeys) {
      const observeOnly = decision.decision === 'wait_and_recheck'
      actions.push({
        surface: 'jira',
        kind:
          decision.decision === 'dispatch_repair'
            ? 'risk_note'
            : decision.decision === 'handoff_operator' ||
                decision.decision === 'escalate_exhausted'
              ? 'status_comment'
              : 'observe_only',
        status: actionStatus(config, { observeOnly }),
        itemKey: jk,
        evidenceUrl: jiraEvidenceUrl(config, jk),
        idempotencyKey: buildIdempotencyKey({
          key,
          skill,
          actionKind: `jira:${jk}`,
          window: dayWindow(),
        }),
      })
    }
  }

  return actions
}

/**
 * True when a JSON object looks like a PR snapshot (not schedule config, etc.).
 * @param {object} obj
 */
function isSnapshotShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  if (obj.key && obj.key.workspace && obj.key.repo && obj.key.number != null) {
    return true
  }
  if (obj.workspace && obj.repo && obj.number != null) return true
  return false
}

function envelopePolicyFields(config) {
  return {
    codeChangeMode: config.codeChangeMode,
    trustedPaths: config.trustedPaths,
    dryRun: Boolean(config.dryRun),
  }
}

function runOne({ snap, config, skill, mode, ledger, force = false }) {
  const norm = normalizeSnapshot(snap)
  const auditEvents = []
  const policyFields = envelopePolicyFields(config)

  if (!norm.key) {
    const envelope = buildResultEnvelope({
      skill,
      mode,
      key: null,
      title: norm.title,
      unreadable: true,
      facts: null,
      evidenceGaps: ['Snapshot missing workspace/repo/number key'],
      assumptions: ['Skipped item; remaining sweep items continue'],
      error: 'missing_key',
      confidence: 0.1,
      ...policyFields,
      auditEvents: [
        {
          event: 'pr_warden_unreadable',
          at: new Date().toISOString(),
          detail: 'missing_key',
        },
      ],
      actions: [],
    })
    return { envelope, skipped: true }
  }

  if (norm.permissionFailure) {
    const envelope = buildResultEnvelope({
      skill,
      mode,
      key: norm.key,
      url: norm.url,
      title: norm.title,
      branch: norm.branch,
      jiraKeys: norm.jiraKeys,
      unreadable: true,
      permissionFailure: true,
      evidenceGaps: ['Permission denied reading PR via twg/Bitbucket'],
      assumptions: ['Best-effort: no mutations performed'],
      confidence: 0.15,
      error: norm.error ?? 'permission_denied',
      ...policyFields,
      auditEvents: [
        {
          event: 'pr_warden_permission_denied',
          at: new Date().toISOString(),
          detail: norm.error ?? 'permission_denied',
        },
      ],
      actions: [],
    })
    return { envelope, skipped: false }
  }

  if (norm.unreadable || !norm.facts) {
    const envelope = buildResultEnvelope({
      skill,
      mode,
      key: norm.key,
      url: norm.url,
      title: norm.title,
      unreadable: true,
      facts: null,
      evidenceGaps: ['Mechanical read failed or incomplete'],
      assumptions: ['Will retry on next schedule tick'],
      error: norm.error ?? 'unreadable',
      ...policyFields,
      auditEvents: [
        {
          event: 'pr_warden_unreadable',
          at: new Date().toISOString(),
          detail: keyDescription(norm.key),
        },
      ],
    })
    return { envelope, skipped: false }
  }

  const state = classify(norm.facts)
  const decision = decideNext({
    state,
    attemptCount: norm.attemptCount,
    conditions: norm.conditions,
    maxAttempts: config.maxAttempts,
  })
  const fp = activityFingerprint({
    state,
    facts: norm.facts,
    repairable: norm.conditions.repairable,
    waiting: norm.conditions.waiting,
  })
  const idempotencyKey = buildIdempotencyKey({
    key: norm.key,
    skill,
    activityFingerprint: fp,
    actionKind: decision.decision,
    window: mode === 'scheduled-digest' ? dayWindow() : undefined,
  })

  if (!force && hasRun(ledger, idempotencyKey)) {
    auditEvents.push({
      event: 'pr_warden_duplicate_skipped',
      at: new Date().toISOString(),
      detail: idempotencyKey,
    })
    const envelope = buildResultEnvelope({
      skill,
      mode,
      key: norm.key,
      url: norm.url,
      title: norm.title,
      branch: norm.branch,
      jiraKeys: norm.jiraKeys,
      facts: norm.facts,
      conditions: norm.conditions,
      state,
      decision,
      activityFingerprint: fp,
      idempotencyKey,
      duplicateOf: idempotencyKey,
      actions: [],
      auditEvents,
      ...policyFields,
      assumptions: ['Duplicate scheduled tick — no side effects'],
    })
    return { envelope, skipped: true }
  }

  const actions = planActions({
    config,
    key: norm.key,
    state,
    decision,
    url: norm.url,
    jiraKeys: norm.jiraKeys,
    skill,
  })

  auditEvents.push({
    event: 'pr_warden_check',
    at: new Date().toISOString(),
    detail: `${keyDescription(norm.key)} → ${state} / ${decision.decision}`,
  })
  if (decision.decision === 'dispatch_repair') {
    auditEvents.push({
      event: 'pr_warden_repair_planned',
      at: new Date().toISOString(),
      detail: `attempt ${norm.attemptCount + 1}`,
    })
  }
  if (decision.decision === 'escalate_exhausted') {
    auditEvents.push({
      event: 'pr_warden_escalate',
      at: new Date().toISOString(),
      detail: 'Automatic attempts exhausted — your turn',
    })
  }

  // mayMerge is always false — assert in envelope.policy
  void mayMerge()

  const envelope = buildResultEnvelope({
    skill,
    mode,
    key: norm.key,
    url: norm.url,
    title: norm.title,
    branch: norm.branch,
    jiraKeys: norm.jiraKeys,
    facts: norm.facts,
    conditions: norm.conditions,
    state,
    decision,
    attemptCount: norm.attemptCount,
    maxAttempts: config.maxAttempts,
    activityFingerprint: fp,
    idempotencyKey,
    actions,
    auditEvents,
    ...policyFields,
  })

  // Persist watch + run
  if (norm.key) {
    const next = nextCheck(state, Date.now(), {
      activeInterval: (config.checkIntervalMinutes ?? 15) * 60,
    })
    upsertWatch(ledger, keyDescription(norm.key), {
      key: norm.key,
      title: norm.title,
      url: norm.url,
      branch: norm.branch,
      enabled: true,
      state,
      detail: DISPLAY_WORD[state],
      attemptCount:
        decision.decision === 'dispatch_repair'
          ? norm.attemptCount + 1
          : norm.attemptCount,
      nextCheckAt: next == null ? null : new Date(next).toISOString(),
      lastIdempotencyKey: idempotencyKey,
      jiraKeys: norm.jiraKeys,
    })
  }
  recordRun(ledger, idempotencyKey, {
    itemKey: norm.key ? keyDescription(norm.key) : null,
    skill,
    decision: decision.decision,
    status: envelope.duplicateOf ? 'duplicate' : 'done',
  })

  return { envelope, skipped: false }
}

function loadFixtures(dir) {
  if (!dir) return []
  const abs = path.resolve(dir)
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return readJson(path.join(abs, f))
      } catch {
        return null
      }
    })
    .filter((obj) => isSnapshotShape(obj))
}

function cmdParseLink(args) {
  const raw = args._[1] ?? args.url ?? ''
  const result = parsePRLink(raw)
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 2)
}

function cmdClassify(args) {
  const file = args.facts ?? args.fixture ?? args._[1]
  if (!file) {
    console.error('classify requires --facts <file>')
    process.exit(1)
  }
  const snap = normalizeSnapshot(readJson(path.resolve(file)))
  const state = snap.unreadable ? 'unreadable' : classify(snap.facts)
  const decision = decideNext({
    state,
    attemptCount: snap.attemptCount,
    conditions: snap.conditions,
  })
  console.log(
    JSON.stringify(
      {
        state,
        displayWord: DISPLAY_WORD[state],
        gates: gatesFrom(state, snap.facts),
        decision,
        isActionableByAgent: isActionableByAgent(state),
        mayMerge: mayMerge(),
      },
      null,
      2,
    ),
  )
}

function cmdGatePaths(args) {
  const files = String(args.files ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const trusted = args.trusted
    ? String(args.trusted).split(',').map((s) => s.trim())
    : DEFAULT_TRUSTED_PATHS
  const result = gateCodeChange({
    files,
    trustedPaths: trusted,
    targetIsPullRequest: args['not-pr'] ? false : true,
    mode: args.mode ?? 'pr_only_trusted_paths',
  })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.allowed ? 0 : 3)
}

function cmdRun(args) {
  const config = resolveConfig(args)
  const skill = args.skill ?? 'pr-warden'
  const mode = args.mode ?? (args.scheduled ? 'scheduled' : 'manual')
  const ledger = loadLedger(config.ledgerPath)
  const fixture = args.fixture ?? args.facts ?? args._[1]
  if (!fixture) {
    console.error('run requires --fixture <snapshot.json>')
    process.exit(1)
  }
  const snap = readJson(path.resolve(fixture))
  const { envelope, skipped } = runOne({
    snap,
    config,
    skill,
    mode,
    ledger,
    force: Boolean(args.force),
  })
  saveLedger(config.ledgerPath, ledger)
  if (args.markdown) {
    console.log(renderAtlassianMarkdown(envelope))
  } else {
    console.log(JSON.stringify({ skipped, envelope }, null, 2))
  }
  if (args.out) writeJson(path.resolve(args.out), envelope)
  process.exit(skipped ? 0 : envelope.error ? 4 : 0)
}

function cmdSweep(args) {
  const config = resolveConfig(args)
  const skill = args.skill ?? 'pr-warden'
  const ledger = loadLedger(config.ledgerPath)
  const fixtures = loadFixtures(args['fixture-dir'] ?? args.fixtureDir)
  // Also arm any repository entries in config as watches if not present
  for (const repo of config.repositories ?? []) {
    if (repo.workspace && repo.repo && repo.number) {
      const id = keyDescription({
        workspace: repo.workspace,
        repo: repo.repo,
        number: repo.number,
      })
      if (!ledger.watches[id]) {
        upsertWatch(ledger, id, {
          key: {
            workspace: String(repo.workspace).toLowerCase(),
            repo: String(repo.repo).toLowerCase(),
            number: Number(repo.number),
          },
          title: repo.title ?? `PR #${repo.number}`,
          url: repo.url,
          enabled: true,
          state: 'unknown',
          nextCheckAt: new Date().toISOString(),
          jiraKeys: repo.jiraKeys ?? [],
        })
      }
    }
  }

  const results = []
  const snaps = fixtures.length
    ? fixtures
    : dueWatches(ledger).map((w) => ({
        ...w.key,
        title: w.title,
        url: w.url,
        branch: w.branch,
        jiraKeys: w.jiraKeys,
        attemptCount: w.attemptCount ?? 0,
        // Without fixtures, mark incomplete evidence and best-effort
        unreadable: true,
        error: 'no_live_snapshot_in_adapter',
      }))

  for (const snap of snaps) {
    const { envelope, skipped } = runOne({
      snap,
      config,
      skill,
      mode: 'scheduled',
      ledger,
      force: Boolean(args.force),
    })
    results.push({ skipped, envelope })
  }
  saveLedger(config.ledgerPath, ledger)
  console.log(
    JSON.stringify(
      {
        skill,
        mode: 'scheduled',
        count: results.length,
        duplicates: results.filter((r) => r.skipped).length,
        results: results.map((r) => ({
          skipped: r.skipped,
          item: r.envelope.item.key,
          state: r.envelope.state,
          decision: r.envelope.decision?.decision,
          confidence: r.envelope.confidence,
          idempotencyKey: r.envelope.idempotencyKey,
          actions: r.envelope.actions,
        })),
      },
      null,
      2,
    ),
  )
}

function cmdDigest(args) {
  const config = resolveConfig(args)
  const skill = 'pr-warden'
  const ledger = loadLedger(config.ledgerPath)
  const fixtures = loadFixtures(args['fixture-dir'] ?? args.fixtureDir)
  const riskStates = new Set(['ciRed', 'conflict', 'needsWork', 'needsYou', 'unreadable'])
  const items = []

  for (const snap of fixtures) {
    const { envelope } = runOne({
      snap,
      config,
      skill,
      mode: 'scheduled-digest',
      ledger,
      force: Boolean(args.force),
    })
    if (riskStates.has(envelope.state) || envelope.decision?.mayDispatchRepair) {
      items.push({
        item: envelope.item,
        state: envelope.state,
        displayWord: envelope.displayWord,
        decision: envelope.decision,
        confidence: envelope.confidence,
        evidenceGaps: envelope.evidenceGaps,
        actions: envelope.actions,
        markdown: renderAtlassianMarkdown(envelope),
      })
    }
  }
  saveLedger(config.ledgerPath, ledger)

  console.log(
    JSON.stringify(
      {
        schema: 'sdlc.pr-warden.risk-digest/v1',
        skill,
        generatedAt: new Date().toISOString(),
        window: dayWindow(),
        riskCount: items.length,
        items,
      },
      null,
      2,
    ),
  )
}

function cmdArm(args) {
  const config = resolveConfig(args)
  const parsed = parsePRLink(args.url ?? args._[1] ?? '')
  if (!parsed.ok) {
    console.log(JSON.stringify(parsed, null, 2))
    process.exit(2)
  }
  const ledger = loadLedger(config.ledgerPath)
  const id = keyDescription(parsed.link.key)
  if (ledger.watches[id]?.enabled) {
    console.log(
      JSON.stringify(
        { armed: false, already_watching: true, id, watch: ledger.watches[id] },
        null,
        2,
      ),
    )
    return
  }
  const watch = upsertWatch(ledger, id, {
    key: parsed.link.key,
    title: args.title ?? `Pull request #${parsed.link.key.number}`,
    url: parsed.link.url,
    enabled: true,
    state: 'unknown',
    detail: 'not read yet',
    attemptCount: 0,
    nextCheckAt: new Date().toISOString(),
    jiraKeys: args.jira ? String(args.jira).split(',') : [],
  })
  saveLedger(config.ledgerPath, ledger)
  console.log(JSON.stringify({ armed: true, already_watching: false, id, watch }, null, 2))
}

function cmdStop(args) {
  const config = resolveConfig(args)
  const id = args.id ?? args._[1]
  if (!id) {
    console.error('stop requires --id bitbucket:ws/repo#n')
    process.exit(1)
  }
  const ledger = loadLedger(config.ledgerPath)
  const watch = stopWatch(ledger, id)
  if (!watch) {
    console.log(JSON.stringify({ ok: false, error: 'unknown_id', hint: 'use status' }, null, 2))
    process.exit(2)
  }
  saveLedger(config.ledgerPath, ledger)
  console.log(JSON.stringify({ ok: true, watch }, null, 2))
}

function cmdStatus(args) {
  const config = resolveConfig(args)
  const ledger = loadLedger(config.ledgerPath)
  const active = Object.values(ledger.watches ?? {}).filter((w) => w.enabled)
  console.log(
    JSON.stringify(
      {
        ledgerPath: config.ledgerPath,
        under_watch: active.length,
        watches: active,
        runCount: Object.keys(ledger.runs ?? {}).length,
      },
      null,
      2,
    ),
  )
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] ?? 'help'
  switch (cmd) {
    case 'parse-link':
      return cmdParseLink(args)
    case 'classify':
      return cmdClassify(args)
    case 'gate-paths':
      return cmdGatePaths(args)
    case 'run':
      return cmdRun(args)
    case 'sweep':
      return cmdSweep(args)
    case 'digest':
      return cmdDigest(args)
    case 'arm':
      return cmdArm(args)
    case 'stop':
      return cmdStop(args)
    case 'status':
      return cmdStatus(args)
    case 'help':
    default:
      console.log(`pr-warden adapter

Commands:
  parse-link <url>
  classify --facts <snapshot.json>
  gate-paths --files a,b --trusted 'src/**,lib/**'
  run --fixture <snapshot.json> [--config cfg.json] [--force] [--markdown]
  sweep --fixture-dir <dir> [--config cfg.json]
  digest --fixture-dir <dir> [--config cfg.json]
  arm --url <bitbucket-pr-url> [--config cfg.json]
  stop --id bitbucket:ws/repo#n [--config cfg.json]
  status [--config cfg.json]
`)
      process.exit(cmd === 'help' ? 0 : 1)
  }
}

main()
