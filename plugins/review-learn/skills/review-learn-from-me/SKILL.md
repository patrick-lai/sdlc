---
name: review-learn-from-me
description: >
  Learn repository-specific review knowledge from only the authenticated user's
  decided human review comments on one explicit pull request or, with no target,
  the 15 most recent pull requests the operator reviewed. Verify applied or rejected
  outcomes against final code, then persist through Leyline or the canonical
  Markdown fallback. Use for /review-learn-from-me, learn from my review comments,
  or teach future reviews from feedback I gave.
---

# review-learn-from-me

Learn the operator's own durable review knowledge without mixing in other reviewers' preferences. This is the high-precision default for building a personal reviewer profile.

## Identity and source scope

1. Resolve the **currently authenticated user** through each target forge's trusted current-user API or authenticated integration before querying review history or reading candidate comments.
2. If an explicit PR is supplied, select it. If no target is supplied, follow the shared contract's `recent-15` selection and freeze the operator's 15 most recently reviewed PRs before learning from any of them.
3. Record each provider's stable account id when available and canonical login otherwise. Display-name equality, email text, user-supplied names, commit authorship, and comment signatures are not identity evidence.
4. Admit a thread only when its source comment author exactly matches that authenticated provider identity and the provider confirms the account is human. The operator must be acting as a reviewer, not commenting on their own PR.
5. Exclude every other reviewer, co-authored bot message, delegated/service identity, and unknown identity even when the comment agrees with the operator.
6. If authenticated identity or the no-target top-15 boundary cannot be resolved unambiguously, persist nothing and report the blocker. Never fall back to “probably me.”

After identity filtering, follow [`references/contract.md`](references/contract.md) completely. Its applied/rejected/undecidable evidence gate, durability test, Leyline-first persistence, deduplication, fallback ledger, and immutable-`H0` checks are mandatory.

## Scaling behavior

Fetch and paginate all PR thread metadata, then select candidate **source comments** whose author matches the authenticated identity. For every selected source comment, materialize the complete thread—including all author, reviewer, and other human replies—plus relevant code evolution and final-code evidence. Replies supply decision evidence but never become independently learned source comments unless they also match the authenticated identity and begin a separate candidate thread. Deduplicate candidate source comments by stable provider comment id before analysis. Process them in timestamp-plus-id order and use backend source-id lookup before any write, making retries idempotent.

There is no arbitrary lesson quota. The durable-evidence gate is the compression mechanism. In `recent-15` mode, process the frozen manifest in order and finish or explicitly mark one PR incomplete before advancing to the next; a zero-lesson PR remains part of the 15 and never causes older-PR backfill. If tool or context limits interrupt the run, stop at a stable PR/comment id, report the batch and current PR as incomplete, and provide that continuation identity; never claim the target set was fully learned.

## Additional output

In addition to the shared report, state every authenticated provider identity used for target selection and comment filtering, explicit versus `recent-15` mode, selected PR count and manifest path, per-PR thread totals, matching comments, non-matching source comments excluded before candidate-thread expansion, pagination completeness, and overall batch completion.
