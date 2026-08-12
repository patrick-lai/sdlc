---
name: pr-warden
description: >
  Keep GitHub or Bitbucket pull requests healthy: re-read them, fix red CI,
  conflicts, and review feedback when safe, and never merge. Use when the user
  says /pr-warden, "keep my PRs healthy", "babysit my PRs", asks why a PR is
  stuck, or schedules a pull-request health sweep.
---

# pr-warden

One public skill, one install. It works with GitHub and Bitbucket pull requests and does not require a particular company toolchain.

## Start

```text
/pr-warden keep all my prs healthy
/pr-warden babysit https://github.com/OWNER/REPO/pull/123
/pr-warden explain <pull-request-url>
/pr-warden readiness <pull-request-url>
```

For a scheduled watch, run the first prompt every 30 minutes. Use the provider credentials already available to the coding agent (`gh`/`GITHUB_TOKEN` for private GitHub repositories, or the equivalent Bitbucket connector). Public GitHub PRs can be inspected without credentials:

```bash
node .agents/skills/pr-warden/scripts/adapter.mjs inspect \
  --url https://github.com/patrick-lai/sdlc/pull/2
```

## Every run

1. Load `.pr-warden-state.json` from the workspace root; create it if absent.
2. List the user's open PRs with the available provider CLI/API.
3. Re-read each full PR: lifecycle, checks, conflicts, current review states, unresolved threads, and source branch.
4. Classify it with `scripts/lib/policy.mjs`.
5. Repair only red CI, conflicts, or current code-review feedback, and only within the safety rules below.
6. Report ready/waiting/handoff states briefly. **Never merge.**
7. When the user wants a shareable status sheet, fill the baked HTML template with `--html`; do not invent a new page or rewrite its operator copy.

### Hard safety rules

- Never merge, approve, dismiss a review, or mark a PR ready on a person's behalf.
- Push only to the PR source branch. Prefer an isolated worktree.
- A missing or failed read is unknown, never green.
- Start in read-only mode when the user's intent is explanation, readiness, audit, or proof.
- Do not comment on unchanged scheduled ticks.

### Trusted paths

Before any automated code change, collect the intended files and check them with:

```bash
node .agents/skills/pr-warden/scripts/adapter.mjs gate-paths \
  --files 'src/a.ts,tests/a.test.ts' \
  --trusted 'src/**,lib/**,app/**,packages/*/src/**,tests/**,docs/**,*.md'
```

Reject traversal and anything outside the configured trusted globs. If nothing is trusted, hand off without pushing.

### Attempt budget

Store a record under the canonical key (`github:owner/repo#123` or `bitbucket:workspace/repo#123`):

- `attempts`: repair pushes spent
- `fingerprint`: repairable facts acted on
- `escalated`: stops further automatic repair

At most **3 automatic repair attempts** per PR. Do not repeat the same fingerprint. Reset only after new human activity or an explicit retry request.

### Provider reads

- GitHub: prefer `gh pr view <url> --json ...`; the adapter's `inspect` command is a credential-free fallback for public PRs. Supply known branch-protection checks with `--required-checks build,test` (or `githubRequiredChecks` in adapter config); unscoped failures stay informational.
- Bitbucket: use the authenticated provider API/connector available in the environment.
- Normalize evidence into the provider-neutral snapshot/envelope documented under `references/`.

## Install

```bash
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
```

Codex, Cursor, and compatible agents share `.agents/skills/`. Claude Code can install `pr-warden@sdlc` from the repository marketplace.

## Operator report

`run`, `sweep`, and `digest` accept `--html [path]`; omitting the path writes `.pr-warden-report.html`. The adapter injects envelopes into [`templates/report.html`](templates/report.html), grouping Needs you, Warden can act, Waiting, Ready, and Settled without changing policy. Hand the resulting file to the user when a visual digest is more useful than terminal JSON.

```bash
node .agents/skills/pr-warden/scripts/adapter.mjs digest   --fixture-dir <provider-snapshots>   --html .pr-warden-report.html
```

## Local checks

```bash
npm run test:pr-warden
node skills/pr-warden/scripts/adapter.mjs inspect --url https://github.com/patrick-lai/sdlc/pull/2
```
