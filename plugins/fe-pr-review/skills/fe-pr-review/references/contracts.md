# Graph contracts

## Reviewer coverage and candidate findings

Each reviewer returns JSON: `{ "persona": "...", "coverage": [...], "findings": [...] }`. `coverage` contains every facet assigned to that persona in declared order. Every row requires `id`, `status`, a concrete `summary`, and `evidence`. Status is `checked`, `finding`, `not-applicable`, or `unverified`; vague pass claims and omitted facets are invalid.

Every finding requires `title`, `lens`, `file`, a positive changed `line`, realistic `trigger`, an `executionPath` of at least two steps, a concrete `reproduction`, `rootCause` at the first changed behavior that violates the contract, `violatedContract`, material `impact`, concrete `evidence`, `severity`, numeric `confidence`, `disconfirmingReason`, `suggestedFix`, a minimal code-level `suggestedPatch` (or clearly labelled pseudocode when exact syntax cannot be established), and focused `verification`. Empty findings are valid. Malformed output fails the node and caps synthesis at `unverified`.

Surviving findings are collected into `candidates.json` with their `persona` and `sourceRoute`.

## Historical regression evidence

Coverage must separately report CI-surface parity, runtime/service-descriptor substitution, dependency-resolution risk, dynamic-key boundary grammar, schema-selection compatibility, temporal history/cache behavior, side-effect liveness, and test-oracle validity. A test claim needs a fixture that distinguishes the broken path and would fail against the pre-fix behavior; a post-merge-only infrastructure failure stays a limitation unless the original diff made it review-detectable.

## Feature-gate trace

The `rollout-gates` result additionally requires `gateRequirement`: `required`, `not-required`, or `unverified`, with rationale, evidence, and discovered gate keys. Coverage must enumerate the full `fg-*` path: requirement; definition/type/owner/default; evaluation context/timing; targeting; exact off path; complete on path; exposure; SSR/client parity; persistence/rollback; tests; and cleanup. A required or potentially required gate with an unverified decision or path prevents a `passable` verdict.

For an explicit feature-gate cleanup, treat full rollout to the selected winning branch as the cleanup precondition unless repository policy requires attached rollout proof or inspected evidence contradicts it. Establish code safety by comparing `H0` with that winning branch, not with the intentionally deleted losing branch. A nested evaluation confined to the losing branch does not become an independently required live control. Missing external targeting data alone is neither an `unverified` code claim nor a blocking finding, and a hypothetical still-off cohort is not a realistic trigger.

## Synthesis

The synthesizer returns `{ "blocking": [], "nonBlocking": [], "unverified": [], "operationalFollowUps": [], "verdict", "rationale" }`. Each `operationalFollowUps` item requires `title`, `summary`, `affectsVerdict`, and `verdictImpact` (`none`, `unverified`, or `blocked`). Routine owner checklists, QA tasks, rollout communication, and post-merge archive work use `affectsVerdict: false` plus `verdictImpact: none`. Concrete unresolved correctness/safety evidence or explicit mandatory pre-approval policy uses `affectsVerdict: true`; deterministic validation derives the overall verdict from code findings plus verdict-affecting follow-ups, regardless of the model-supplied verdict. Operational policy remains in its own structured list and never consumes or deletes one of the five code-finding slots. It deduplicates by root cause, rejects speculation, preserves disconfirming evidence, caps blocking findings at five, and uses inspected evidence only. `verdict` is `blocked`, `passable`, or `unverified`; it is advice, not a provider action.

## QA evidence

`qa-demo` is **opt-in**. The graph does not require a demo. Default with no `--qa-report` is `not-run`; that is not a failure and does not change the code verdict.

`--qa-report` accepts a fresh qa-demo JSON or Markdown report when the user requested visual proof or already produced one. The coordinator must establish that its revision equals `H0`. JSON may declare `revision`, `head`, or `h0`; Markdown may use a labelled revision line.

| Situation | Status |
|---|---|
| No `--qa-report` | `not-run` |
| Declared revision equals `H0` | `fresh` |
| Declared revision differs from `H0` | `stale` |
| Unreadable or no machine-readable revision | `unverified` |

Only `fresh` is usable evidence. Default `not-run` leaves the code verdict unchanged. Supplied `stale` or `unverified` QA forces a nominal pass down to `unverified`.

## Runner safety

Adapters run installed CLIs non-interactively and read-only. Cursor uses ask mode, its sandbox, explicit workspace trust, and serialized launches; Claude uses plan mode with inherited MCP configuration disabled; Codex uses an ephemeral read-only sandbox. `--runner` accepts only `cursor`, `codex`, or `claude`; model IDs use a conservative identifier pattern. Unsafe permission bypass, shell fragments, write modes, and mutation-capable flags are refused. Capacity/auth/configuration failures fail over and open a per-run circuit; prompts never run through a shell.

## Filesystem safety

The run directory defaults outside the repository; an explicit `--output` inside it is rejected. The graph writes only to the run directory and has no comment, approval, resolve, merge, push, commit, or deploy command.

## Review report

Successful synthesis deterministically writes `report.json`, `report.md`, and self-contained `report.html`. All identify `H0`, verdict, QA freshness, the feature-gate requirement and full path, every facet with evidence or limitation, detailed findings, and unverified coverage. HTML is rendered from `templates/report.html` via `scripts/lib/report.mjs` — agents must not invent alternate markup. Upload success and URL reachability are checked separately.

## Audit

`audit.json` records H0, base, diff hash, selected personas, runner/model per node, node status and finding counts, parse failures, candidate count, QA status, synthesis status, and report paths. It contains no credentials or QA body.

## External mutations

Provider reads and writes are outside this script. The coordinator may act only when the invocation permits it and after a fresh state/head/thread re-check. Never merge, push, commit, deploy, or alter human-authored threads.
