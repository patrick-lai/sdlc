---
name: fe-pr-review
description: Review frontend changes with a focused read-only pass, concrete defect evidence and optional parallel checks for independent risks. Use for frontend pull requests or local diffs.
---

# Frontend review

Use [the focused workflow](references/workflow.md) and the frontend section of [review lenses](references/lenses.md). If `review` or the host already supplied a snapshot, requirements or focus, reuse them. Review the assigned behavior once and return findings directly in the requested format.

Do not start a second graph, reclassify the whole repository or repeat another reviewer's completed work. Trace a cross-boundary contract when this change affects it; keep one combined verdict for a mixed change.

Read [the slower graph workflow](references/deep-review.md) only for an explicit full multi-persona graph or audit-artifact request. Its external runner requires explicit consent and `--portable-cli`; it is never a capacity fallback. Resolve script paths from this installed skill directory and keep the reviewed repository as the working directory.

For explicitly requested inline blocker comments, use [the publication format](references/blocking-pr-comment.md). Source edits, PR approval, merge and unrelated publication remain outside a review request.
