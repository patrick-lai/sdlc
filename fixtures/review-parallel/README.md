# Parallel review trial

A fresh single reviewer and three fresh parallel specialists reviewed the same frozen synthetic change on 26 September 2026. Neither saw the expected findings or the other run's reports. All four seeded defects were found in both modes: cross-tenant access, leaked job capacity on error/cancellation, invoice units across the API/client boundary, and stale search results. Neither mode flagged the intentional label cleanup.

| Measurement | Single reviewer | Parallel specialists |
| --- | ---: | ---: |
| Seeded defects found | 4 / 4 | 4 / 4 |
| False positives | 0 | 0 |
| Reviewer stage | 104 seconds | 97 seconds |
| Reviewer shell calls | 15 | 19 |
| Native reviewers | 1 | 3 |

Parallel specialist durations were 36, 87 and 45 seconds, with overlapping execution. The stage spans the first worker's start to the last worker's end. It excludes dispatch and the coordinator. Dispatch to the last worker's end was 128 seconds, so startup erased the small stage saving. The coordinator's source/coverage checkpoint was 177 seconds after dispatch, while the parent also edited and validated the skills. That checkpoint is not a controlled pure-review measurement. Do not claim an end-to-end speedup from this trial.

The result supports scoped defect detection on this fixture only. It does not establish production recall, general thoroughness, reliable speed gains or cost savings. Scope assignments were supplied manually, so automatic partitioning was not tested. More agents can use more tokens and quota. The slowest scope dominates latency; split a large independent workload when useful, while keeping tightly coupled behavior together.

`base/` and `head/` preserve the exact input files. `oracle.json` records the expected defects, negative control and scope map. `results.json` records timings, findings and limits. To replay, create a temporary Git repository from base, commit it, replace with head and commit again. Use the installed parallel `review` workflow with distinct reviewers that have not seen the oracle. For the serial comparison explicitly request one reviewer. Preserve the same revisions and model settings, capture both dispatch and completion times, and score only after reviewing.

Run `python3 -B checks.py` in either snapshot to see that existing happy-path tests pass. Focused probes must exercise cross-tenant requests, worker failure and cancellation, invoice display across the boundary, and out-of-order async completion. Use event-controlled probes, not timing thresholds.
