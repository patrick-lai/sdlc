# Frontend review contracts

## Batch orchestration

Scheduled batch mode freezes at most four eligible PRs before work starts and launches one top-level worker per PR concurrently. Extra PRs are deferred. Each worker owns one repository and PR identity, immutable `H0`, isolated run directory, and absolute 30-minute deadline.

The schedule prompt stays lean. It selects scheduled batch mode and the eligibility source. The `review` and `fe-pr-review` skills own admission, concurrency, persona selection, deadlines, decision mapping, and Statlas publication.

Every admitted PR must end in one of these batch states:

- `completed` with a reachable Statlas report;
- `timed-out` with a truthful `REJECT: incomplete` report;
- `publication-failed` with the exact upload or reachability failure;
- `stale-head` with no stale publication; restart once only when the full remaining budget can support the new revision.

## Runtime and fan-out

A PR deadline covers admission, snapshot, learned-knowledge recall, fan-out, synthesis, coordinator verification, fresh `H0` check, report rendering, upload, and reachability verification. Stop work that cannot fit the remaining time.

Use 3-6 persona reviewers and never more than six. Native fan-out is preferred. At least two top-level persona reviewers must materially overlap in wall-clock time. `fanout.json` records actual IDs, parents, depth, persona, timestamps, status, and derived concurrency. The coordinator derives overlap from timestamps rather than trusting a claimed count.

Top-level persona reviewers run at depth 1. Each may optionally create at most two focused probe children at depth 2. A child covers one narrow question, returns compact evidence to its parent, and cannot delegate. Depth 3, more than two children per reviewer, duplicate full-persona children, or children outside the parent interval invalidate fan-out evidence.

Portable CLI fallback disables child delegation and uses:

```text
--max-workers 4
--max-attempts 2
--deadline-epoch-ms <outer-pr-deadline-ms>
--node-timeout-seconds 480
--synthesis-timeout-seconds 240
--run-timeout-seconds 1500
```

Permit at most two attempts per node across provider kinds. Do not retry every provider. Authentication, capacity, configuration, or timeout failure opens a circuit for that provider kind for the rest of the PR run.

## Reviewer coverage and findings

Each reviewer returns JSON: `{ "persona": "...", "coverage": [...], "findings": [...] }`. `coverage` contains every assigned facet in declared order. Every row requires `id`, `status`, concrete `summary`, and evidence. Status is `checked`, `finding`, `not-applicable`, or `unverified`. Vague pass claims and omitted facets fail the node.

Every finding requires `title`, `lens`, `file`, a positive changed `line`, realistic `trigger`, concrete `reproduction`, an `executionPath` of at least two steps, `rootCause` at the first changed behavior that violates the contract, `violatedContract`, material `impact`, concrete `evidence`, `severity`, numeric `confidence`, `disconfirmingReason`, `suggestedFix`, a minimal code-level `suggestedPatch` or clearly labelled pseudocode, and focused `verification`. Empty findings are valid. Malformed output fails the node and forces internal `UNVERIFIED`.

Children return probe evidence only. They do not emit a second persona verdict or count as independent agreement.

## Historical regression evidence

Coverage separately reports CI-surface parity, runtime or service-descriptor substitution, dependency-resolution risk, dynamic-key boundary grammar, schema-selection compatibility, temporal history or cache behavior, side-effect liveness, and test-oracle validity. A test claim needs a fixture that distinguishes the broken path and fails against pre-fix behavior.

## Feature-gate trace

The `rollout-gates` result requires `gateRequirement`: `required`, `not-required`, or `unverified`, with rationale, evidence, and discovered keys. When required, coverage enumerates requirement, definition, type, owner, default, evaluation context and timing, targeting, exact off path, complete on path, exposure, SSR and client parity, persistence and rollback, tests, and cleanup.

For explicit gate cleanup, compare `H0` with the selected winning branch. A control confined to the deleted losing branch is retired with it unless current policy or inspected evidence proves otherwise. Missing external targeting data alone is not an unverified code claim.

## Synthesis and deterministic decision

The synthesizer returns `{ "blocking": [], "nonBlocking": [], "unverified": [], "operationalFollowUps": [], "verdict", "rationale" }`. Internal `verdict` is `PASSABLE`, `BLOCKED`, or `UNVERIFIED`.

The coordinator derives the public decision:

- `PASSABLE` plus complete evidence, valid overlap, unchanged `H0`, no failed nodes, deadline compliance, and fresh supplied QA evidence gives `ACCEPT`.
- `BLOCKED` gives `REJECT: defect`.
- `UNVERIFIED`, timeout, invalid fan-out, failed nodes, stale `H0`, stale supplied QA, or incomplete evidence gives `REJECT: incomplete`.

Only `ACCEPT` or `REJECT` appears as the public decision badge. The reason distinguishes `defect` from `incomplete`. Reviewer voting never overrides evidence.

## Optional QA and verification

`qa-demo` is opt-in. No QA request gives status `not-run`, which does not change a supported code verdict. Supplied QA must identify the same `H0`; stale, failed, unreadable, or revision-unverifiable evidence contributes `UNVERIFIED`.

Do not run broad builds or test suites. Run only focused blessed checks needed for a concrete claim and only when they fit the remaining deadline. Do not install dependencies, boot a browser, record a TestReel, or start a demo surface by default.

## Runner safety

Adapters run installed CLIs non-interactively and read-only. Unsafe permission bypass, write modes, shell fragments, and mutation-capable flags are refused. Prompts never run through a shell.

## Filesystem safety

The run directory stays outside the reviewed repository. Reviewer nodes have no comment, approval, resolve, merge, push, commit, deploy, or install command.

## Statlas report

Every admitted completed or timed-out PR gets `report.json`, `report.md`, and self-contained `report.html`. The report includes `H0`, internal verdict, public decision and reason, deadline state, fan-out evidence, every facet, findings, failed nodes, QA state, and limitations. The publication command binds normalized repository and PR identity to that immutable report.

Scheduled batch mode publishes each admitted PR. A standalone review publishes only when the user explicitly requests Statlas or report publication. Publication occurs only after a fresh `H0` check. The idempotency key is normalized repository identity plus PR identity plus `H0`. Upload retries must not create duplicate logical reports. Sanitize secrets, private raw comments, and machine-local paths. Verify the returned URL is reachable before marking publication successful.

Use `scripts/publish-statlas.mjs` with the run directory, normalized repository identity, PR identity, and freshly fetched provider head. Namespace and auth group come from explicit flags or `STATLAS_NAMESPACE` and `STATLAS_AUTH_GROUP`. The helper uploads only `report.html`, checks every embedded `H0` and decision, verifies the exact returned bytes, and emits one JSON result.

A moved head invalidates publication. Restart once only when the full remaining budget can support the new revision; otherwise record `stale-head`. A publication or reachability failure is reported explicitly and never represented as success.

Scheduled mode authorizes Statlas publication only. Automatic PR comments, approvals, Slack notifications, merges, and code mutations remain forbidden.

## Audit

`audit.json` records `H0`, diff hash, deadline, duration, selected personas, agent hierarchy, overlap, maximum observed concurrency, runner and model per node, attempts, node status, candidate count, QA status, synthesis status, internal verdict, public decision, and reason. Publication output separately records the idempotency key, URL, and reachability. Neither artifact contains credentials or QA body.
