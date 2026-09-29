---
name: ci-loop
description: >
  Verify work in a large monorepo by treating CI as the source of truth: run only
  cheap local checks, push, then watch the pipeline for the head commit, fix red
  checks from logs, and stop when required checks are green. Use when a repo is too
  big to fully build or test locally, or when the user says "get it green", "babysit
  CI", "watch the pipeline", or "rely on CI". Never merges.
---

# ci-loop

Large monorepos are often cloned sparsely or without blobs, cannot be fully installed,
and take too long to typecheck or test end to end on a laptop. In those repos, local
checks are a fast first pass and **CI is the verdict**. This skill is the loop for
using CI well: push, watch, diagnose, fix, repeat, then stop.

Scheduled multi-PR sweeps belong to `pr-warden`. This skill is the interactive,
single-branch loop inside a working session. Reuse its safety rules; do not fork them.

## When it applies

Use it when a push or PR is authorized for the current branch. "Get it green", "ship
it", and "babysit CI" authorize the loop. Without authorization, prepare the commit
and stop. Never push to a branch the task does not own.

## Local first pass (cheap only)

Do what is cheap and reliable, and no more:

- A focused test file or package, changed-file lint, and a formatter on touched files.
- Storybook, a dev server, or an app preview on demand for UI changes.
- Scope every command to the smallest package or directory. Prefer the repo's own
  wrapper commands over raw package-manager or compiler invocations.

Do not run repo-wide installs, builds, typechecks, or test suites, and do not fetch
missing blobs just to force one. If a check cannot run locally, say so and defer it
to CI instead of fighting the environment. Record which checks were local and which
are pending on CI.

## The loop

1. **Push safely.** Serialize git commands. Fetch only the ref you need, never a
   generic pull. Push to the PR source branch, keeping hooks enabled (LFS and commit
   hooks matter). Open new PRs as drafts.
2. **Bind to the head commit.** Record `git rev-parse HEAD`. Only a pipeline whose
   commit equals that SHA counts. A green run on an older commit is not green.
3. **Watch without spinning.** Read state with the provider CLI or API (see
   [providers](references/providers.md)). Wait with the host's scheduled wakeup, a
   `/loop`-style timer, or a PR monitor if the host has one. Poll at multi-minute
   intervals matched to how long the pipeline runs, not in a sleep loop. Prefer
   push notifications from the host over polling when they exist.
4. **Diagnose from logs.** On the first red check, read the failed step's log and
   test report. Classify it:
   - **Caused by this diff:** fix the root cause.
   - **Also red on the base branch:** prove it with a base-branch run or the same
     failure on an unrelated branch, then report it. Do not fix or suppress it here.
   - **Infra or flake** (runner loss, timeout, network, cache): rerun only the failed
     steps once. A second identical failure is not a flake.
5. **Fix and re-verify narrowly.** Reproduce locally only if cheap. Otherwise reason
   from the log, patch, and let CI confirm. Never skip, retry-wrap, or suppress a
   check to make it pass.
6. **Repeat from step 1** with a new commit.

## Stop conditions

- **Green:** every required check has completed successfully on the current head
  commit and there are no merge conflicts. Stop and report. Name any optional or
  informational checks still pending; do not wait on them.
- **Budget:** at most 3 fix pushes for the same failure fingerprint (same check, same
  error). Then hand off with the log evidence.
- **Unknown is not green:** a failed, missing, or partial read of CI state means
  unknown. Say so.
- **Human actions stay human:** never merge, approve, dismiss a review, or mark a
  draft ready. Report and hand back.

## Large-monorepo hazards

- **Wrapper timeouts.** Git and workflow wrappers may have hard internal timeouts.
  A killed rebase can silently drop a commit, and a push can land while the wrapper
  reports failure. After any rebase, check `git diff --stat <base>...HEAD` and
  `git log` for every intended change. After a reported push failure, check
  `git ls-remote origin refs/heads/<branch>` before retrying, since a blind re-push
  can fail its lease check.
- **Prefer manual rebase with a long timeout** on branches far behind the base.
- **Generated files.** Do not hand-edit generated or signed sources, and do not commit
  build output that CI owns. Regenerate with the repo's generator, scoped to the
  package.
- **Path-scoped guidance.** Read the nearest agent guide for the package you change
  before editing; it overrides root guidance.

## Report

Close with: head SHA, pipeline identifier and result, which checks were confirmed by
CI versus locally, any failures classified as base-branch or flaky with evidence,
what remains unverified, and the next human action.
