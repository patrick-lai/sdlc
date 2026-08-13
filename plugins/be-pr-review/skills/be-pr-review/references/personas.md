# Reviewer personas

Every node receives the same immutable `H0`, diff hash, publish bar, structured-output contract, and untrusted-input warning. Each reviewer returns one explicit, evidence-backed coverage row for every assigned facet; missing or vague rows fail the node.

1. **repository-contract** — root and nearest instructions, module/build boundaries, dependency direction, generated artifacts, ownership, manifests/locks, suppressions, test placement, CI parity, runtime descriptors, configuration substitution, and startup fail-fast behavior.
2. **api-compatibility** — request/response and event contracts, validation, status/error semantics, versioning, unknown fields, generated clients, consumers, deploy order, and rollback compatibility.
3. **data-migrations** — schema and persistence invariants, tenant partitioning, transaction boundaries, partial success, retries/idempotency, absent/null/empty semantics, backfill safety, expand/migrate/contract sequencing, data repair, and rollback.
4. **concurrency-reliability** — read-check-write atomicity, races, ordering, cancellation/deadlines, duplicate delivery, lifecycle isolation, sequential/parallel backpressure changes, timeouts/retries/backoff, resource cleanup, load shedding, dependency failure, and graceful shutdown.
5. **security-observability-performance** — authentication/authorization and tenant scope, injection/SSRF/deserialization, secrets/PII, auditability, global identifier uniqueness, metrics/logs/traces and cardinality, derived-value consistency, alert/SLO usefulness, query/algorithm bounds, resource use, and feature-gated rollout.
6. **tests-rollout** — acceptance criteria and test-oracle validity, explicit verification obligations, negative and fault tests, integration/contract coverage, production-parity verification, sibling-path sweeps, release ordering, migration/gate rollback, canary signals, ownership/runbooks, and cleanup.

The planner always uses repository-contract, api-compatibility, concurrency-reliability, and security-observability-performance. Persistence, schema, migration, queue, or data-access changes add data-migrations. Backend tests, infrastructure, deployment, configuration, or rollout changes add tests-rollout. A caller may force 3–6 known IDs with `--personas`.

Add a specialist only by replacing, not duplicating, a broad lens. Keep the total at six. Specialists still use the same finding and self-disconfirmation contract.

## Adversarial self-grill

Before a finding survives synthesis, independently ask:

- Is the trigger reachable in the changed deployment, or only hypothetical?
- Is the violated invariant documented or proven by callers, data, tests, or runtime behavior?
- Did this diff introduce or materially worsen it?
- What is the strongest benign interpretation or existing guard?
- Does the precise changed line participate in the execution path?
- Could deployment order, retry middleware, transaction scope, generated code, or platform behavior disprove it?
- Is the impact material enough for the claimed severity?
- What focused test or inspection would falsify the claim?

Consensus is never evidence. Cluster candidates by root cause, retain the strongest anchor, preserve disconfirming evidence, and reject style preferences or speculative hardening.

## Historical regression probes

The probes below are based on recurring backend fix/revert shapes, including orchestration lifecycle failures, partial-success writes, workflow conflict semantics, aggregate-query regressions, contract evolution, gate cleanup, and alert routing. They are portable archetypes, not team-specific policy:

- partial-write atomicity and idempotent resume after a later step fails;
- API/event/schema compatibility across mixed-version deploy and rollback;
- transaction, retry, duplicate-delivery, and exactly-once boundaries;
- cancellation/deadline propagation and graceful shutdown isolation;
- migration expand/backfill/contract sequencing and resumability;
- query shape, fan-out, cardinality, and worst-case resource bounds;
- feature-gate default, both branches, persisted state, measurable exposure, and cleanup;
- environment/configuration symmetry and startup fail-fast behavior;
- telemetry signal, PII/secrets, cardinality, ownership, alert routing, and SLO usefulness;
- test-oracle validity: the fixture distinguishes the defect and fails on the pre-fix path;
- read-check-write atomicity across locks, transactions, leases, and conditional updates;
- concurrency-model preservation when sequential becomes parallel, synchronous becomes asynchronous, or a lock boundary moves;
- absent/null/empty/unknown/dependency-failed semantics at storage and API boundaries;
- fail-soft fallbacks that can return a plausible successful but incomplete result;
- global namespace uniqueness for error codes, metric names, schema symbols, analytics IDs, and registry keys;
- derived-value consistency across capping, sampling, filters, units, and time windows;
- sibling-path recurrence across equivalent endpoints, operations, consumers, clouds, and regions;
- explicit verification obligations backed by revision-bound results, not prose intent.

Mark a probe `not-applicable` only with concrete changed-code evidence. A post-merge-only infrastructure failure is a validation limitation unless the original diff made the defect review-detectable.
