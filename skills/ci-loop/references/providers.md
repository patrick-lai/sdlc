# Reading CI state by provider

Inspect each command's current `--help` before relying on flags. Use structured
(JSON) output when available, and use credentials already configured for the agent.
A failed or partial read is unknown, never green.

## GitHub (`gh`)

```bash
# Head commit to bind to
gh pr view <pr> --json headRefOid,isDraft,mergeable

# Check state for the PR (bucket: pass, fail, pending, skipping, cancel)
gh pr checks <pr> --json name,state,bucket,link,workflow

# Runs for exactly the head commit
gh run list --commit <sha> --json databaseId,name,status,conclusion,url

# Failed-step logs only
gh run view <run-id> --log-failed

# Rerun only failed jobs (a mutation: read the run first)
gh run rerun <run-id> --failed
```

`gh pr checks --watch` and `gh run watch` block for the whole run. Prefer a scheduled
wakeup plus a single read per tick.

## Bitbucket Pipelines (REST or an authenticated connector)

Relevant resources (confirm against current API docs):

```text
GET /2.0/repositories/{workspace}/{repo}/pipelines/?sort=-created_on&pagelen=5
GET /2.0/repositories/{workspace}/{repo}/pipelines/{pipeline_uuid}/steps/
GET /2.0/repositories/{workspace}/{repo}/pipelines/{pipeline_uuid}/steps/{step_uuid}/log
GET /2.0/repositories/{workspace}/{repo}/pullrequests/{id}/statuses
```

- Pipeline lifecycle is `state.name` (`PENDING`, `IN_PROGRESS`, `COMPLETED`); the
  outcome is `state.result.name` (for example `SUCCESSFUL`, `FAILED`, `ERROR`,
  `STOPPED`).
- Compare `target.commit.hash` to the head SHA before trusting a result.
- Pull request statuses show the checks reported to the PR, which is what merge
  checks usually gate on.

## Other providers

Map the same four reads: head SHA, checks for that SHA, failed-step logs, rerun of
failed steps only. GitLab (`glab ci`), Buildkite, and CircleCI expose equivalents.

## Choosing a wait interval

| Pipeline stage | Wait |
|----------------|------|
| Queued, not started | 5 to 10 minutes |
| Running, typical length under 15 minutes | 3 to 5 minutes |
| Running, typical length 30 minutes or more | 8 to 10 minutes |
| Just pushed a fix | Wait for the new run to appear, then resume above |

Adjust to the repo's observed pipeline duration. If the host supports event-driven
wakeups for PR checks, use those and keep a long fallback timer only as a safety net.
