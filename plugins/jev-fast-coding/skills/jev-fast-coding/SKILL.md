---
name: jev-fast-coding
description: Reduce coding-session overhead with direct evidence lookup, selective JEV discovery, result reuse and focused verification. Use when speeding up coding work or evaluating JEV-assisted workflows.
---

# JEV-assisted coding speed

Use JEV when a bounded semantic choice replaces expensive discovery. Keep implementation and correctness judgments with the coding agent. Measure time to a verified result. Provider latency alone does not establish coding-session speed.

## Choose the next action

- When a file path, symbol, source title or skill name is known, read it directly or use exact search with `rg`. An explicit process exit code also needs no classifier.
- Read independent files and run independent read-only lookups together when your tools permit it. Keep dependent steps and shared mutations sequential. Delegate a bounded task only when it can finish alongside useful work in the current session.
- For unfamiliar material, use a focused semantic lookup only through an available client authorized for the task. Check its suggestion against the full relevant source and source index before deciding. Keep source selection and passage selection sequential when one determines the input to the other.
- Reuse a result while its evidence, question, criteria and provider settings remain unchanged. Do not paraphrase a query merely to ask it again.
- Batch independent questions over the same state when the existing client supports multiple questions. Follow that client's concurrency limits. Do not invent a JEV command or add a provider just to activate this skill.
- After an edit, run the repository's affected checks when available, then its required completion checks. Repeat passed checks after relevant changes or new evidence of a problem. A model decision cannot remove required tests or grant approval.

Use relevant bounded input. Do not send repository content or transcripts to a new provider without authorization. If JEV is unavailable or confidence is insufficient, return to the original evidence and continue with the coding agent. Avoid repeated classification attempts.

When working inside CommissionAI, read the [CommissionAI adapter](references/commissionai.md) for its authenticated commands and runtime constraints. Other environments use their own tools and repository rules.

## Trial an optimization

Read [the evaluation evidence](references/evidence.md) before citing gains or extending this workflow. Do not rerun live benchmarks during ordinary coding work.

Freeze representative inputs and expected answers before testing. Include ambiguous cases, no-match answers and misleading embedded instructions. Compare the current and proposed paths in interleaved runs, preserving request counts, correctness, fallback coverage and elapsed time. Use held-out cases after tuning. Include fallback and rework when measuring task completion.

Promote a change only when its measured quality and time meet the task's needs. Preserve slower runs, errors and incomplete trials in the evidence. Report synthetic results as synthetic. This skill's existing trials establish specific decision-level gains; they do not establish a whole-session speedup.
