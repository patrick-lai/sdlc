# Earlier single-reviewer trial

This records the earlier solo-default policy at commit `af816b0`, superseded by parallel specialist review. It is not validation of the current fan-out policy.

On 26 September 2026, a native reviewer used the revised `review` skill on two small synthetic local changes without seeing the expected outcomes. It found the tenant cache leak and accepted the intentional feature-gate removal. Both original tests passed; focused checks distinguished the defect and exercised the safe path. The working trees stayed clean and both source heads stayed unchanged.

| Case | Expected and observed | Wall-clock time | Tool calls | Helpers |
| --- | --- | ---: | ---: | ---: |
| A | BLOCKED, tenant data leak | 37 seconds | 4 | 0 |
| B | PASSABLE, intended gate cleanup | 26 seconds | 3 | 0 |

Each tool call used one `functions.exec` with one shell command tool. Case A includes loading the shared instructions. These are two synthetic examples, not a latency distribution, a timed comparison with the old graph, or evidence about large production PRs. No whole-session speedup is claimed.

The prior mixed-change entrypoints contained 5,757 whitespace-delimited words across review, FE and BE. The new default entrypoint plus shared workflow and lenses contains 1,298. This is a context-size comparison, not an inference-speed measurement. The full graph remains available on explicit request. That version used a five-minute work budget; the current policy uses it only as a progress checkpoint and continues until material coverage is resolved.

The `base/` and `head/` directories preserve each input exactly. To replay, copy a base directory into a temporary Git repo, commit it, replace its files with that case's head files, and commit again. Ask a reviewer to use the installed `review` skill for the two commits without supplying this result file. Tests are `python3 -B -m unittest -v` for A and `node test.mjs` for B. Score against `results.json` only after the review.
