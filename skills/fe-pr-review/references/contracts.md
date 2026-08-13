# Graph contracts

## Reviewer coverage and candidate findings

Each reviewer returns JSON: `{ "persona": "...", "coverage": [...], "findings": [...] }`. `coverage` contains every facet assigned to that persona in declared order. Every row requires `id`, `status`, a concrete `summary`, and `evidence`. Status is `checked`, `finding`, `not-applicable`, or `unverified`; vague pass claims and omitted facets are invalid.

Every finding requires `title`, `lens`, `file`, a positive changed `line`, realistic `trigger`, an `executionPath` of at least two steps, `violatedContract`, material `impact`, concrete `evidence`, `severity`, numeric `confidence`, `disconfirmingReason`, `suggestedFix`, and focused `verification`. Empty findings are valid. Malformed output fails the node and caps synthesis at `unverified`.

Surviving findings are collected into `candidates.json` with their `persona` and `sourceRoute`.

## Feature-gate trace

The `rollout-gates` result additionally requires `gateRequirement`: `required`, `not-required`, or `unverified`, with rationale, evidence, and discovered gate keys. Coverage must enumerate the full `fg-*` path: requirement; definition/type/owner/default; evaluation context/timing; targeting; exact off path; complete on path; exposure; SSR/client parity; persistence/rollback; tests; and cleanup. A required or potentially required gate with an unverified decision or path prevents a `passable` verdict.

## Synthesis

The synthesizer returns `{ "blocking": [], "nonBlocking": [], "unverified": [], "operationalFollowUps": [], "verdict", "rationale" }`. `operationalFollowUps` holds human/process work that does not affect the code verdict: routine owner checklists, QA tasks, rollout communication, and post-merge archive work. Such items block only when they carry concrete unresolved correctness/safety evidence or an explicit mandatory pre-approval policy. It deduplicates by root cause, rejects speculation, preserves disconfirming evidence, caps blocking findings at five, and uses inspected evidence only. `verdict` is `blocked`, `passable`, or `unverified`; it is advice, not a provider action.

## QA evidence

`--qa-report` accepts a fresh qa-demo JSON or Markdown report. The coordinator must establish that its revision equals `H0`. JSON may declare `revision`, `head`, or `h0`; Markdown may use a labelled revision line.

| Situation | Status |
|---|---|
| No `--qa-report` | `not-run` |
| Declared revision equals `H0` | `fresh` |
| Declared revision differs from `H0` | `stale` |
| Unreadable or no machine-readable revision | `unverified` |

Only `fresh` is usable evidence. Supplied `stale` or `unverified` QA forces a nominal pass down to `unverified`.

## Runner safety

Adapters run installed CLIs non-interactively and read-only. Cursor uses ask mode, its sandbox, explicit workspace trust, and serialized launches; Claude uses plan mode with inherited MCP configuration disabled; Codex uses an ephemeral read-only sandbox. `--runner` accepts only `cursor`, `codex`, or `claude`; model IDs use a conservative identifier pattern. Unsafe permission bypass, shell fragments, write modes, and mutation-capable flags are refused. Capacity/auth/configuration failures fail over and open a per-run circuit; prompts never run through a shell.

## Filesystem safety

The run directory defaults outside the repository; an explicit `--output` inside it is rejected. The graph writes only to the run directory and has no comment, approval, resolve, merge, push, commit, or deploy command.

## Review report

Successful synthesis deterministically writes `report.json`, `report.md`, and self-contained `report.html`. All identify `H0`, verdict, QA freshness, the feature-gate requirement and full path, every facet with evidence or limitation, detailed findings, and unverified coverage. Upload success and URL reachability are checked separately.

## Audit

`audit.json` records H0, base, diff hash, selected personas, runner/model per node, node status and finding counts, parse failures, candidate count, QA status, synthesis status, and report paths. It contains no credentials or QA body.

## External mutations

Provider reads and writes are outside this script. The coordinator may act only when the invocation permits it and after a fresh state/head/thread re-check. Never merge, push, commit, deploy, or alter human-authored threads.
