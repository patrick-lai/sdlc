# Policy

Classification priority is: terminal lifecycle; red CI; current change requests or unresolved tasks; conflict; draft; operator action; CI running/unknown; ready; awaiting review.

Only red CI, conflicts, and current code-review feedback are repairable. Draft state, approvals, readiness, and merge are human actions. `mayMerge()` is permanently false.

Automatic repair requires the PR source branch, trusted files, a new activity fingerprint, and fewer than three prior attempts. Auth or evidence failures produce no mutation. Scheduled no-op ticks produce no comment.
