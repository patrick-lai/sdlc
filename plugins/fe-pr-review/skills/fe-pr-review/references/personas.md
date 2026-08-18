# Reviewer personas

Every node receives the same `H0`, diff hash, publish bar, structured-output contract, and untrusted-input warning. Each reviewer returns one explicit, evidence-backed coverage row for every assigned facet; missing or vague rows fail the node.

1. **repository-contract** — root and nearest instructions, package/import/dependency boundaries, entrypoints/generated APIs, ownership/lockfiles, suppressions/test placement, PR-versus-post-merge CI parity, runtime/service-descriptor substitution fail-fast behavior, and dependency-resolution blast radius.
2. **correctness-platform** — state transitions, async/error paths, SSR/hydration, compatibility/deploy order, performance/resilience, dynamic-key boundary grammar, GraphQL/Relay selection compatibility, reload/history/undo/cache state, and exactly-once side-effect liveness across refactors.
3. **accessibility-ui** — semantics/names, keyboard/focus, programmatic state, contrast/tokens/modes, reflow/motion/touch, i18n/RTL, and design-system use.
4. **rollout-gates** — first decide whether a gate is required, then trace definition/key/type/owner/default, evaluation context and identity timing, targeting, exact gate-off behavior, complete gate-on states, exposure, SSR/client parity, persisted-data rollback, both-branch tests, and cleanup ownership. For explicit gate cleanup, compare the result with the selected winning branch and treat controls confined to the deleted losing branch as retired with it. Do not invent a still-off cohort without concrete evidence. The full path is mandatory when gating is required.
5. **privacy-security-data** — authorization/tenancy, telemetry PII, secrets/error capture, taxonomy/cardinality, integrity, retries, and exactly-once behavior across duplicate events, tabs, and sessions.
6. **product-tests** — stated criteria, inferred states, responsive/themes/content limits, parity/adjacent behavior, tests/docs/messaging, and proof that regression-test fixtures fail on the pre-fix behavior.

The planner always uses repository-contract, correctness-platform, and privacy-security-data. Frontend source or stories add accessibility-ui and rollout-gates; frontend or test evidence adds product-tests. A caller may force 3–6 known IDs with `--personas`.

Add a specialist only by replacing, not duplicating, a broad lens. Keep the total at six.

## Historical regression probes

The eight added probes are deliberately cross-cutting: CI-surface parity, runtime/service-descriptor substitution, dependency-resolution risk, dynamic-key boundaries, schema-selection compatibility, temporal history/cache, side-effect liveness, and test-oracle validity. They came from recurring fix/revert archetypes and must be answered with changed-code evidence, not generic assurances.
