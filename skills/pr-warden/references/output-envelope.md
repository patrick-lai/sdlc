# Output envelope

Every adapter result uses `sdlc.pr-warden.result/v1` and separates evidence from policy:

- `item`: provider, canonical key, URL, title, branch
- `facts`: lifecycle, CI, conflicts, review state, gates
- `conditions`: repairable, operator, external, waiting, ignored
- `state` and `decision`: policy output
- `policy`: `mayMerge: false`, trusted paths, dry-run
- `actions`: provider surface, kind, status, evidence URL, idempotency key
- `confidence`, `provenance`, `assumptions`, `evidenceGaps`

Consumers must not treat a missing fact as green. `planned` means an executor may act only after all branch, trust, and attempt checks; `skipped` means no provider mutation occurred.

## Operator views

- `renderMarkdown(envelope)` produces a short provider-neutral status body.
- `--html [path]` on `run`, `sweep`, or `digest` fills [`templates/report.html`](../templates/report.html) with `sdlc.pr-warden.report/v1` data from `scripts/lib/report.mjs`.
- Report copy comes from `scripts/lib/copy.mjs`; callers supply evidence, not new policy or prose.
