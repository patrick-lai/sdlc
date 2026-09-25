---
name: review
description: Review working-tree changes, a branch or pull request with focused parallel specialists, explicit coverage ownership and evidence-backed findings. Use for ordinary code review and bounded PR batches.
---

# Review

Resolve the requested target and use [the focused workflow](references/workflow.md). Default to concurrent native specialists for substantial changes while the coordinator checks requirements and integration seams. Reuse an existing host review assignment or panel.

Select lenses from the behavior and contracts, not file extensions. Read only the relevant section of [review lenses](references/lenses.md). Frontend and backend concerns share one snapshot and one verdict. The `fe-pr-review` and `be-pr-review` entrypoints specialize this same method; invoking both must not create two full reviews.

Prepare [authored-only review context](references/generated-files.md) before reading patches or starting reviewers. Generated Relay/GraphQL output bodies are omitted by default; handwritten schemas, operations and generator inputs remain in scope.

For a requested multi-PR or scheduled run, read [batch handling](references/batch.md). For explicitly requested inline blocker comments, read [the publication format](references/blocking-pr-comment.md). Otherwise return the findings directly in the conversation or host format.

The default native panel does not need the legacy runner or its report machinery. Read [the legacy graph workflow](references/deep-review.md) only when the user explicitly requests that runner or its formal audit artifacts. Keep those optional mechanics separate from normal parallel review.
