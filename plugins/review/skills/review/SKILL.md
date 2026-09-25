---
name: review
description: Review working-tree changes, a branch or pull request with one focused pass, evidence-backed findings and risk-based optional parallel checks. Use for ordinary code review and bounded PR batches.
---

# Review

Resolve the requested target and use [the focused workflow](references/workflow.md). Default to a direct review by the current agent. Reuse an existing host review assignment or panel.

Select lenses from the behavior and contracts, not file extensions. Read only the relevant section of [review lenses](references/lenses.md). Frontend and backend concerns share one snapshot and one verdict. The `fe-pr-review` and `be-pr-review` entrypoints specialize this same method; invoking both must not create two full reviews.

For a requested multi-PR or scheduled run, read [batch handling](references/batch.md). For explicitly requested inline blocker comments, read [the publication format](references/blocking-pr-comment.md). Otherwise return the findings directly in the conversation or host format.

Only an explicit request for the full multi-persona graph or its audit artifacts activates [the slower graph workflow](references/deep-review.md). An ordinary request for a thorough review means stronger evidence on relevant risks, not a mandatory reviewer fleet.
