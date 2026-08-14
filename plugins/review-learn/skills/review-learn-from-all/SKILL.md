---
name: review-learn-from-all
description: >
  Learn repository-specific review knowledge from all verified human reviewers on
  one explicit pull request or, with no target, the 15 most recent pull requests
  the authenticated operator reviewed. Page and batch decided threads without silent truncation,
  verify applied or rejected outcomes against final code, then persist through
  Leyline or the canonical Markdown fallback. Use for /review-learn-from-all,
  learn from all reviewers, or capture team review knowledge from this PR.
---

# review-learn-from-all

Learn durable team review knowledge from every verified human reviewer on each selected PR. Use this broader mode deliberately: it has higher coverage and a larger poisoning/conflict surface than `/review-learn-from-me`.

## Identity and source scope

1. Resolve the **currently authenticated operator** through each target forge's trusted current-user API or authenticated integration before querying review history.
2. If an explicit PR is supplied, select it. If no target is supplied, follow the shared contract's `recent-15` selection and freeze the operator's 15 most recently reviewed PRs before learning from any reviewer on them.
3. For each selected PR, page the provider's complete thread and review metadata before claiming coverage.
4. Admit source comments from all provider-confirmed human reviewers except the PR author. Include the authenticated operator only when they reviewed somebody else's PR.
5. Exclude bots, service/delegated identities, generated summaries, unknown account types, and author self-review before expanding comment bodies.
6. Preserve reviewer identity on every candidate and every distinct lesson's evidence. Agreement between reviewers is corroboration, not proof or a reason to create duplicate active memories.

After identity filtering, follow [`references/contract.md`](references/contract.md) completely. Its applied/rejected/undecidable evidence gate, durability test, Leyline-first persistence, deduplication, fallback ledger, and immutable-`H0` checks are mandatory.

## Bounded, deterministic ingestion

Scale by reducing evidence before model reasoning, never by lowering the gate:

1. Fetch lightweight metadata for every page and deduplicate by stable provider thread/comment id.
2. Apply deterministic exclusions first: non-human source, PR author, non-substantive review event, superseded duplicate, or missing stable identity/anchor.
3. Sort remaining source comments by timestamp and stable id. Analyze at most **40 candidate threads per batch** and write only normalized decided-thread records to an external temporary checkpoint bound to repository, PR, and `H0`. Do not write the knowledge backend during analysis batches.
4. Re-check `H0` between batches. Source movement invalidates the full temporary candidate set and restarts once; no partial knowledge has been published.
5. After every batch is analyzed, collapse across reviewers only when lessons have the same trigger, scope, invariant, review action, and resolution. Keep all corroborating source ids and reviewer identities in evidence; never merge merely similar advice or applied and rejected outcomes.
6. Resolve cross-batch conflicts, re-check `H0` once more, then enter the persistence phase. Before each write, search the selected backend by repository plus PR/comment id. Retries skip already-persisted outcomes and update stronger evidence in place.

In `recent-15` mode, this six-step sequence is the inner loop for one manifest entry. Finish or explicitly mark the current PR incomplete before advancing, never combine candidate batches across PRs, and never backfill an older PR when a selected one yields zero lessons.

Process all batches when resources permit. Never silently truncate at 40, at one provider page, or at a model context limit. If interrupted during analysis, emit `INCOMPLETE`, persist no lessons for that PR, and report the external checkpoint path/id, last stable comment id, remaining candidate count when known, and `H0`. Resume from that checkpoint only when its repository, PR, `H0`, and manifest hash still match; otherwise restart the full scan. If interrupted during persistence, a later full run is safe because source-id lookup makes writes idempotent.

## Conflict handling

When two decided human outcomes conflict, do not pick by majority, seniority, or recency alone. Narrow their scopes using final code, ownership, callers, repository rules, and tests. Store separate non-overlapping lessons when both are valid. If they remain contradictory in the same scope, persist neither as active knowledge and report the conflict for human curation.

## Additional output

In addition to the shared report, include explicit versus `recent-15` mode, selected PR count and manifest path, complete per-PR page/thread counts, verified-human reviewer count, per-reviewer candidate/admitted/skipped counts, inner batch count, collapsed corroborations, unresolved conflicts, selection and pagination completeness, and per-PR plus overall `COMPLETE` or `INCOMPLETE` status.
