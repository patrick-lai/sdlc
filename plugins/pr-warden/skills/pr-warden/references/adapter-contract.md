# Portable adapter contract

Applies to Claude, Codex, Cursor, Grok, cron, and other agents that invoke PR Warden outside or beside Lumine.

## Invocation

| Field | Values |
|-------|--------|
| `skill` | `pr-warden` (single skill; mode is the prompt, not a separate install) |
| `mode` | `manual` \| `scheduled` \| `scheduled-digest` |
| `trigger` | `{ kind: "agent"\|"cli"\|"cron"\|"mcp", schedule_id?, fired_at }` |
| `target` | `{ url }` or `{ workspace, repo, number }` |
| `config` | see below |

CLI:

```bash
node skills/pr-warden/scripts/adapter.mjs <command> [options]
```

## Schedule trigger

- **Sweep:** every N minutes (default aligns with 15m mechanical check)
- **Digest:** daily (UTC day window in idempotency key)
- Host may use system cron, agent automations, or Raphael standing automations
- Config is **per repository/workspace** via `repositories[]` and optional overrides

## Credentials / context

| Need | Source |
|------|--------|
| Bitbucket PR read | signed-in `twg` |
| Jira write/comment | signed-in `twg` |
| Raphael MCP | optional; prefer when present |
| Git push for repair | operator/agent credentials already available to the coding agent |

The skill does not store tokens. Missing auth → permission envelope (`confidence` ~0.15, no mutations).

## Idempotency key

```text
pr-warden:<skill>:bitbucket:<ws>/<repo>#<n>:<actionKind>:<activityFingerprint>:<window?>
```

- `activityFingerprint` — hash of state + facts + repairable/waiting buckets
- `window` — UTC date for digest-style actions; optional for pure checks
- Ledger path records keys; duplicate → skip side effects, return `duplicateOf`

## Retries

| Failure | Behavior |
|---------|----------|
| Mechanical read / network | `unreadable` / retry next tick; no repair dispatch |
| Permission 403 | permission envelope; do not thrash |
| Bitbucket/Jira action fail | mark action `failed` or `retrying`; keep evidence gap; next sweep may retry with **same** action idempotency key until success recorded |
| Repair agent boot fail | refund attempt (Lumine parity); audit `pr_warden_boot_failed` |
| Partial trusted-path block | edit only allowed files; list blocked in envelope |

Max automatic repair attempts default: **3** (`maxAttempts`).

## Audit record

Every run appends `audit.events[]`:

```json
{ "event": "pr_warden_check", "at": "ISO-8601", "detail": "…" }
```

Known event names (aligned with Lumine where applicable):

- `pr_warden_armed` / `pr_warden_stopped`
- `pr_warden_check` / `pr_warden_manual_refresh`
- `pr_warden_unreadable` / `pr_warden_permission_denied`
- `pr_warden_repair_planned` / `pr_warden_escalate`
- `pr_warden_duplicate_skipped`

## Config shape

See `examples/schedule.config.json`:

```json
{
  "ledgerPath": ".pr-warden-ledger.json",
  "dryRun": true,
  "jiraBaseUrl": "https://jira.example.com",
  "checkIntervalMinutes": 15,
  "maxAttempts": 3,
  "codeChangeMode": "pr_only_trusted_paths",
  "trustedPaths": ["src/**", "packages/*/src/**"],
  "actions": { "bitbucket": true, "jira": true },
  "repositories": [
    { "workspace": "acme", "repo": "payments", "number": 1, "jiraKeys": ["PAY-1"] }
  ]
}
```

- `dryRun: true` → actions emit `status: "skipped"` and `policy.dryRun: true` (withhold side effects).
- `dryRun: false` → actionable items emit `status: "planned"`.
- `jiraBaseUrl` → optional site origin for Jira `evidenceUrl`; when null/omitted, Jira actions have `evidenceUrl: null` (no fabricated atlassian.com links).

## Output

Always `sdlc.pr-warden.result/v1` (or digest wrapper). See [output-envelope.md](output-envelope.md).

## Coexistence with Lumine

- If Lumine owns the watch ledger, **do not** arm a parallel portable watch for the same key unless Lumine is disabled for that workspace
- Portable adapter is the offline/CI/fixture and non-Lumine agent path
- See [migration.md](migration.md)
