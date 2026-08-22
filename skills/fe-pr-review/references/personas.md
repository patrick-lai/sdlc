# Reviewer personas

Every persona receives the same `H0`, diff hash, publish bar, structured-output contract, deadline, and untrusted-input warning. Each returns one concrete coverage row for every assigned facet. Missing or vague rows fail the node.

Use 3-6 personas per PR and no more than six. Always select the three core personas. Add conditional specialists only when the frozen diff and contracts justify them.

## Core personas

1. **repository-contract**: root and nearest instructions, package and import boundaries, entrypoints, generated APIs, ownership, lockfiles, suppressions, test placement, CI-surface parity, runtime or service-descriptor substitution, fail-fast behavior, and dependency-resolution blast radius.
2. **correctness-platform**: state transitions, async and error paths, SSR and hydration, compatibility and deploy order, performance and resilience, dynamic-key grammar, GraphQL or Relay selection compatibility, history and cache state, and exactly-once side-effect liveness.
3. **privacy-security-data**: authorization and tenancy, telemetry PII, secrets and error capture, taxonomy and cardinality, integrity, retries, and exactly-once behavior across duplicate events, tabs, and sessions.

## Conditional specialists

4. **accessibility-ui**: semantics and names, keyboard and focus, programmatic state, contrast and tokens, modes, reflow, motion, touch, i18n, RTL, and design-system use.
5. **rollout-gates**: decide whether a gate is required, then trace definition, key, type, owner, default, evaluation identity and timing, targeting, exact off behavior, complete on states, exposure, SSR and client parity, persistence and rollback, both-branch tests, and cleanup. For explicit cleanup, compare with the selected winning branch.
6. **product-tests**: stated criteria, inferred states, responsive and theme behavior, content limits, parity, adjacent behavior, tests, docs, messaging, and proof that regression fixtures fail against pre-fix behavior.

Frontend source or stories usually add `accessibility-ui` and `rollout-gates`. Frontend behavior or test changes may add `product-tests`. Replace a broad lens with a more relevant specialist rather than exceeding six.

## Native fan-out contract

The Codex parent agent launches the first four selected built-in persona subagents concurrently. Launch remaining personas as slots free. At least two top-level reviewers must show material overlap in recorded timestamps. Agreement is not evidence. Do not invoke Cursor, Claude, Codex CLI, or another external model process for the native graph.

Top-level reviewers are depth 1. Each may optionally launch no more than two focused probe children at depth 2:

- one narrow question per child;
- a short bounded timeout inside the parent's deadline;
- compact evidence returned to the parent;
- no full-persona duplication;
- no independent verdict;
- no child delegation and no depth 3.

Probe children are useful for focused caller tracing, contract lookup, or test-oracle inspection. They are not a mechanism for an unbounded nested army.

Portable CLI mode is explicit user opt-in only. It uses the same personas but disables probe children because their hierarchy and timing cannot be enforced reliably.

## Historical regression probes

The cross-cutting probes are CI-surface parity, runtime or service-descriptor substitution, dependency-resolution risk, dynamic-key boundaries, schema-selection compatibility, temporal history or cache behavior, side-effect liveness, and test-oracle validity. Answer them with changed-code evidence, not generic assurances.
