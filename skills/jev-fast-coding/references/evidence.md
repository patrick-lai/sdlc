# Evidence for JEV-assisted coding speed

Evaluated in CommissionAI on 26 September 2026. These are decision-level results. No whole coding-session acceleration has been measured.

## Concurrent identical requests

A deterministic provider test with 16 simultaneous identical callers previously made two provider requests and returned two usable selections; 14 callers received unavailable results. Sharing the pending decision reduced this to one provider request with 16 usable selections. This establishes request sharing and availability, not a measured latency gain.

The daemon retains its two distinct-request limit, separates provider revisions and cleans up cancelled owners. Tests cover waiting-caller cancellation, owner cancellation, failed-result sharing and retry, independent request capacity and provider changes.

Exact source and browser-skill selectors already bypass inference; unchanged semantic requests already use the daemon cache. Use those paths when the answer is known. Required-test selection remains deterministic and repository-owned.

## Live independent-question trial

The frozen fixture contained six synthetic sessions, each with three independent questions: implementation area, relevant board source and check-output category. Four development sessions had two repetitions in each of two input variants; two held-out sessions had one repetition per variant. Held-out cases included ambiguity and misleading embedded instructions. These are agent-authored labels with repetitions, not 120 independent examples or a human-labelled benchmark.

The 80-request run compared 20 three-question batches with 60 single-question requests. Pair order and input-variant order were randomized. The requested model was `typesafe/jev-1.13`, returning snapshot `typesafe/jev-1.13-20260917`. There were no retries or prompt changes after inference began.

| Measure | Batched | Sequential |
| --- | ---: | ---: |
| Median time for three decisions | 269.7 ms | 801.5 ms |
| Label matches including repetitions | 60/60 | 60/60 |
| Held-out matches including input variants | 12/12 | 12/12 |
| Accepted at confidence ≥ 0.9 | 54/60 | 54/60 |
| Accepted errors | 0 | 0 |
| Reported input tokens | 31,492 | 73,276 |
| Reported provider cost | USD 0.001322664 | USD 0.003077592 |

Batches were faster in all 20 pairs; the median paired ratio was 2.98 and saving 531.8 ms. Input tokens fell 57.0%. All 80 requests completed. Total reported provider cost was USD 0.004400256.

Six predictions per mode fell below the app's threshold. They matched the labels, but their required local ACP fallback time was not measured. The runner used a fresh HTTP opener and socket timeout for each call; the daemon pools connections and imposes a whole-request deadline. Parallel separate requests and coding-task completion time were not measured.

This supports batching independent questions when a suitable client and use case already exist. It does not establish that CommissionAI or coding sessions became three times faster. Current app commands have single questions or sequential source and passage selection and expose no generic batch API.

## Rejected or unproven speed claims

- Removing unrelated history preserved accuracy and reduced tokens, but batched median latency was 271 ms compact versus 270 ms noisy. No latency win was demonstrated.
- An earlier requirements fixture accepted only 8 of 18 answers directly from JEV at the app's threshold. Do not add ticket assessment to every task merely for speed.
- Model-selected test skipping, model-granted approvals and routine extra coding agents have no supporting evidence here.
- The synthetic routes and failure categories could often be inferred locally. Do not add JEV to a deterministic lookup just because a classifier can answer it.

## Provenance and further trials

This portable summary derives from the CommissionAI evaluation report `docs/jev-coding-speed.md`, frozen results `docs/evals/2026-09-26-jev-speed.json`, and runner `scripts/jev_speed_eval.py`. Those source-project artifacts are not installation or runtime dependencies of this skill. The runner defaults to no network calls. Its opt-in live mode makes at most 80 synthetic requests and stops at the first failure. Do not run it during routine coding sessions.

TypeSafe's official documentation describes [JEV's bounded decision role](https://docs.typesafe.ai/introduction/coding-agents) and the [API's map of typed questions](https://docs.typesafe.ai/api). JEV returns structured decisions; the coding agent still writes code and judges correctness.

For a new optimization, freeze cases and labels before trialling and preserve failed results. Measure fallback, rework and time to verified task completion before claiming a session-level speedup.

[The frozen synthetic inputs, schedule and per-call results](evaluation.json) are included for audit. They are evidence, not runtime instructions.
