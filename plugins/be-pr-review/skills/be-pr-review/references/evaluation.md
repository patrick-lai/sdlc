# Historical evaluation and tuning discipline

Use historical fixes, reverts, incidents, and human review comments to test the review method—not to memorize repository names or one-off bugs.

## Corpus protocol

1. Collect two independent strata: post-merge failures and high-signal human review findings.
2. Require stable artifact identifiers and enough evidence to state the violated invariant. Title-only inference is rejected or marked low confidence.
3. Deduplicate by root cause, not by PR. A revert and its follow-up fix are one case unless they exercise different invariants.
4. Distill private evidence into portable defect shapes. Never copy internal names, comments, URLs, customer data, or team policy into this public skill.
5. Freeze the taxonomy before scoring. Map every case to an existing facet and one primary probe.
6. Use a train/validation/holdout split by root-cause family and repository, not randomly: 60% tuning, 20% validation, 20% holdout. Keep all siblings and recurrence variants in one split.
7. Score `catch` only when a persona explicitly requires the decisive trace and evidence; `partial` when it names the broad area but not the decisive invariant; otherwise `miss`.
8. Tune only a portable pattern recurring in at least three independent PRs across at least two repositories, or in both corpus strata. One-offs remain evaluation evidence.
9. Re-score the untouched holdout after tuning. Do not weaken the publish bar to raise recall.

## Acceptance bar

A tuning change is acceptable only when it:

- improves aggregate holdout catch-or-partial coverage without reducing exact `catch` coverage;
- leaves every negative control non-blocking;
- introduces no repository, team, ticket, class, endpoint, or vendor-specific rule;
- keeps a current finding anchored to `H0`, reachable, materially introduced or worsened, and independently disconfirmed;
- has a synthetic positive test and a nearby benign negative control.

## Negative controls

The review must reject:

- a requested load, failover, migration, or staging check that was actually completed with revision-bound evidence;
- a null assertion or fail-fast lookup that protects an impossible-state invariant;
- a feature gate carried by an enum, registry, middleware, or callee rather than visible at the changed call site;
- synchronization required by a documented callback or shared-state threading model;
- a proposed type or helper move that violates module dependency direction or ownership;
- a deliberate empty result whose contract distinguishes it from dependency failure;
- a bounded metric dimension with an enumerated value set;
- a pre-existing issue not introduced or materially worsened by the diff.

## Portable regression families

Repeated historical evidence justifies explicit probes for:

- verification obligations stated in the PR: required load, failover, compatibility, staging, migration, or rollback checks must have revision-bound results rather than prose intent;
- read-check-write races: state that controls a mutation must be read or revalidated inside the same lock, transaction, lease, or conditional write;
- concurrency-model changes: sequential-to-parallel, sync-to-async, or widened/narrowed locks must preserve backpressure, ordering, memory bounds, and ownership semantics;
- absence semantics: absent, null, empty, unknown, and dependency-failed states must not collapse unless every consumer contract permits it;
- fail-soft fallbacks: dependency or parse failures must not become plausible successful empty responses without an explicit contract and signal;
- global namespace uniqueness for error codes, metric names, analytics identifiers, schema symbols, and registry keys;
- derived-value consistency: numerators, denominators, thresholds, and percentages must share the same sampling, capping, filtering, time window, and unit;
- rollout closure: every changed production path, including shadow paths and shared predicates, must preserve the exact control behavior when off and avoid user-visible effects during dark launch;
- dependency/runtime compatibility: transitive module alignment, generated/runtime artifact parity, descriptor endpoints, initialization order, and environment-specific credentials or naming;
- sibling-path recurrence: when one endpoint, cloud, region, consumer, or operation fixes an invariant, inspect structurally equivalent paths rather than assuming local closure.

Historical agreement still is not proof. These probes select questions; only current code and verification evidence support findings.
