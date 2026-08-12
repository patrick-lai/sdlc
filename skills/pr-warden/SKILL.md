---
name: pr-warden
description: >
  Keep open Bitbucket PRs healthy: re-read them, fix red CI / conflicts /
  review feedback when safe, never merge. Use when the user says /pr-warden,
  "keep my PRs healthy", "babysit my PRs", scheduled PR sweep, explain why a
  PR is stuck, merge readiness, or follow-up after a repair.
---

# pr-warden

One skill. One install. Modes are just how you phrase the prompt.

## What you say

```text
/pr-warden keep all my prs healthy
```

| Intent | Prompt |
|--------|--------|
| Default / schedule (30m) | `/pr-warden keep all my prs healthy` |
| One PR | `/pr-warden babysit <bitbucket-pr-url>` |
| Explain | `/pr-warden explain <pr>` |
| Ready to merge? | `/pr-warden readiness <pr>` |
| After a fix | `/pr-warden followup <pr>` |

Schedule the default line **every 30 minutes**. Needs `twg` signed in. No fixtures required.

## What the agent does (each run)

1. **Load run state** from `.pr-warden-state.json` in the workspace root (create if missing).
2. **List open PRs** (Raphael `pr_warden_status` / Today, else twg open PRs for the user).
3. **For each open PR** — full read via twg.
4. **Decide**
   - CI running or human-only gates (approvals, mark ready) → note; no code change.
   - Ready to merge → tell user; **never merge**.
   - Red CI / conflicts / code review feedback → repair only if under attempt budget (below).
5. **Reply short** — one line per PR that changed or needs the user. Silence is OK when nothing changed.

### Hard rules (always)

- **Never merge.** Never approve / mark-ready as a human.
- Push only to the **PR source branch** (force-with-lease only after your rebase on that branch).
- Prefer an isolated worktree.
- Auth/read failure → skip with a note; do not invent green.

### Trusted paths (required for any automatic edit)

Automatic edits are **PR branch + trusted paths only**. Before editing or pushing:

1. Collect the file list you intend to change.
2. Keep only paths under trusted globs (repo override in `.pr-warden-state.json` → `trustedPaths`, else defaults: `src/**`, `lib/**`, `app/**`, `packages/*/src/**`, `tests/**`, `docs/**`, `*.md`, lockfiles — same as `scripts/lib/trusted-paths.mjs` `DEFAULT_TRUSTED_PATHS`).
3. Reject traversal (`..`) and anything outside the list. If **no** intended files are trusted, **do not push** — hand off: “needs you (out of trusted paths)”.
4. Optional check:  
   `node skills/pr-warden/scripts/adapter.mjs gate-paths --files 'a,b' --trusted 'src/**,lib/**'`

### Attempt budget (stop looping)

Per PR key `bitbucket:ws/repo#n` in `.pr-warden-state.json`:

| Field | Meaning |
|-------|---------|
| `attempts` | Auto-repair pushes this watch has spent |
| `fingerprint` | Hash/summary of last repairable conditions you acted on |
| `escalated` | If true, **no more auto-repair** until human activity changes the picture |

- **Max automatic repairs: 3** per PR (same as policy `maxRepairAttempts`).
- After a push that tried to fix: `attempts += 1`, store fingerprint.
- If `attempts >= 3` and still repairable → set `escalated: true`, **stop fixing**, tell the user once (“automatic attempts exhausted — your turn”).
- Reset `attempts` / `escalated` only when **new human activity** clearly changes the PR (new reviewer feedback after your last push, or user asks to retry) — not merely because 30 minutes passed.
- Same fingerprint as last tick and nothing new to do → **no re-push**, no extra comments.

### First scheduled ticks / side effects

- **Default is live repair** when the user asked to keep PRs healthy (they want action).
- Still respect trusted paths + attempt budget + fingerprint skip above (this is the lightweight ledger; full adapter CLI is optional).
- If state file has `"observeOnly": true`, **only report** — no edits/pushes/comments until the user clears it or says “go live”.
- Do not spam PR comments every 30m; comment only on handoff / escalate / meaningful change.

### If Raphael has PR Warden tools

Prefer `pr_warden_watch` / `pr_warden_status` / `pr_warden_stop`. Don’t double-babysit the same PR outside that ledger.

## Schedule every 30 minutes

```text
/pr-warden keep all my prs healthy

Re-check my open Bitbucket PRs. Fix red CI, conflicts, and code review feedback only on trusted paths, at most 3 auto-repair attempts per PR, then hand off. Never merge. Skip no-op ticks. Short per-PR status only when something changed or needs me.
```

Install once:

```bash
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
```

## Optional (debug only)

`npm run test:pr-warden` · `references/` · `scripts/` adapter (internal; not required day-to-day)
