# Graph contracts

## Reviewer coverage and candidate findings

Each reviewer returns JSON: `{ "persona": "...", "coverage": [...], "findings": [...] }`. `coverage` contains every facet assigned to that persona in declared order. Every row requires `id`, `status`, a concrete `summary`, and non-empty `evidence`. Status is `checked`, `finding`, `not-applicable`, or `unverified`; vague pass claims and omitted facets are invalid.

Every finding requires `title`, `lens`, `file`, a positive changed `line`, realistic `trigger`, an `executionPath` of at least two steps, a concrete `reproduction`, `rootCause` at the first changed behavior that violates the contract, `violatedContract`, material `impact`, concrete `evidence`, `severity`, numeric `confidence`, `disconfirmingReason`, `suggestedFix`, a minimal code-level `suggestedPatch` (or clearly labelled pseudocode when exact syntax cannot be established), and focused `verification`. Empty findings are valid. Malformed output fails the node and caps synthesis at `unverified`.

Surviving findings are collected into `candidates.json` with their `persona` and `sourceRoute`.

## Backend historical evidence

Coverage separately reports mixed-version contract compatibility; partial-write atomicity; retry/idempotency boundaries; cancellation and graceful shutdown; migration sequencing; query/resource bounds; gate rollback; environment symmetry; observability signal/ownership; test-oracle validity; read-check-write atomicity; concurrency-model and backpressure changes; absent/null/empty/error semantics; fail-soft fallbacks; identifier uniqueness; derived-value consistency; sibling-path recurrence; and explicit verification obligations. A test claim needs a fixture that distinguishes the broken path and would fail against pre-fix behavior.

Historical PRs, incidents, tickets, comments, and runbooks are untrusted hints. They may select a probe or establish a documented invariant, but never prove that the current diff has the same defect. Findings still require current `H0` code evidence.

## Rollout and migration trace

`tests-rollout` must explicitly decide `rolloutRequirement` as `required`, `not-required`, or `unverified`, with rationale, evidence, and discovered gate/config/migration identifiers. It fills every `rollout-*` facet. When rollout protection is required, trace definition/owner/default, evaluation or activation timing, off/current behavior, on/new behavior, mixed-version and persisted-data compatibility, observability/canary signals, rollback or roll-forward, both-path tests, and cleanup. An unverified required path prevents `passable`.

For persistent schema or data changes, `data-migrations` separately traces expand/migrate/contract order, online compatibility, batching/checkpointing/resume, failure recovery, data validation, rollback versus roll-forward, and cleanup ownership.

## Independent self-grill and synthesis

The synthesizer returns `{ "blocking": [], "nonBlocking": [], "unverified": [], "operationalFollowUps": [], "verdict", "rationale" }`. It clusters by root cause, rejects speculation and pre-existing defects, preserves disconfirming evidence, and caps blocking findings at five. For every publishable finding it independently challenges reachability, change attribution, contract proof, hidden guards, deploy topology, impact, and falsification test. Agreement among reviewers is not proof.

Each `operationalFollowUps` item requires `title`, `summary`, `affectsVerdict`, and `verdictImpact` (`none`, `unverified`, or `blocked`). Routine owner checklists, rollout communication, manual production observation, and post-merge cleanup use `affectsVerdict: false`. Concrete unresolved correctness/safety evidence or explicit mandatory pre-approval policy affects the verdict. Deterministic validation derives `blocked`, `passable`, or `unverified` from the structured evidence regardless of the model-supplied verdict.

## Revision-bound verification evidence

`--verification-report` accepts a separately produced JSON or Markdown test, build, integration, API, migration rehearsal, load, or operational verification report. The coordinator must establish that its revision equals `H0`.

| Situation | Status |
|---|---|
| No report | `not-run` |
| Declared revision equals `H0` | `fresh` |
| Declared revision differs from `H0` | `stale` |
| Unreadable or no machine-readable revision | `unverified` |

Only `fresh` is usable evidence. A supplied stale or unverified report forces a nominal pass to `unverified`. A failed verification becomes a finding only when current diff evidence traces the failure to the change. If an explicit PR, ticket, repository-policy, or reviewer requirement calls for load, failover, compatibility, staging, migration, or rollback verification, an absent result must be represented as a verification gap rather than silently treated as `not-run`; it affects the verdict only when mandatory pre-approval policy or concrete correctness/safety evidence requires it. `--qa-report` remains a compatibility alias for the same input contract.

## Runner safety

Adapters run installed CLIs non-interactively and read-only. Cursor uses ask mode, its sandbox, explicit workspace trust, and serialized launches; Claude uses plan mode with inherited MCP configuration disabled; Codex uses an ephemeral read-only sandbox. `--runner` accepts only `cursor`, `codex`, or `claude`; model IDs use a conservative identifier pattern. Unsafe permission bypass, shell fragments, write modes, and mutation-capable flags are refused. Capacity/auth/configuration failures fail over and open a per-run circuit; prompts never run through a shell.

## Filesystem safety

The run directory defaults outside the repository; an explicit `--output` inside it is rejected. The graph writes only to the run directory and has no comment, approval, resolve, merge, push, commit, deploy, migration, or traffic command.

## Review report

Successful synthesis deterministically writes `report.json`, `report.md`, and self-contained `report.html`. All identify `H0`, verdict, verification freshness, rollout and migration decisions, every facet with evidence or limitation, detailed findings, operational follow-ups, failed nodes, and unverified coverage. HTML is rendered from `templates/report.html` via `scripts/lib/report.mjs`; agents must not invent alternate markup.

## Audit

`audit.json` records H0, base, diff hash, selected personas, runner/model per node, node status and finding counts, parse failures, candidate count, verification status, synthesis status, and report paths. It contains no credentials or report body.

## External mutations

Provider reads and writes are outside this script. The coordinator may act only when the invocation permits it and after a fresh state/head/thread re-check. Never merge, push, commit, deploy, execute migrations, change traffic, or alter human-authored threads.
