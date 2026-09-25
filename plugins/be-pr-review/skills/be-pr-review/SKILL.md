---
name: be-pr-review
description: Review backend changes with focused parallel specialists, complete risk coverage and concrete defect evidence. Use for backend pull requests or local diffs.
---

# Backend review

Use [the focused workflow](references/workflow.md) and the backend section of [review lenses](references/lenses.md). If `review` or the host already supplied a snapshot, requirements or focus, reuse them. If coordinating, partition the relevant risks and launch independent specialists concurrently. If already a specialist, finish the assigned scope without starting another panel. Return findings and remaining gaps in the requested format.

Do not start a second graph, reclassify the whole repository or repeat another reviewer's completed work. Trace a cross-boundary contract when this change affects it; keep one combined verdict for a mixed change.

Normal native fan-out uses the shared workflow. Read [the legacy graph workflow](references/deep-review.md) only for an explicitly requested legacy runner or formal audit-artifact contract. Its external runner requires explicit consent and `--portable-cli`; it is never a capacity fallback. Resolve script paths from this installed skill directory and keep the reviewed repository as the working directory.

Prepare [authored-only review context](references/generated-files.md) before reading patches or starting reviewers. Generated Relay/GraphQL output bodies are omitted by default; handwritten schemas, operations and generator inputs remain in scope.

For explicitly requested inline blocker comments, use [the publication format](references/blocking-pr-comment.md). Source edits, PR approval, merge and unrelated publication remain outside a review request.
