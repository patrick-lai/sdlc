# Architecture map

```text
provider URL
  → link-parse.mjs (provider key)
  → provider API or supplied snapshot (mechanical facts)
  → policy.mjs (state + decision; mayMerge is always false)
  → trusted-paths.mjs (PR branch + allowed files)
  → envelope.mjs (facts, confidence, evidence gaps, planned actions)
  → ledger.mjs (watch state + idempotency)
```

The public package owns this contract. Provider adapters may gather facts differently, but they must preserve fail-closed reads, a three-attempt repair budget, trusted paths, no repeated fingerprints, and the permanent never-merge rule.
