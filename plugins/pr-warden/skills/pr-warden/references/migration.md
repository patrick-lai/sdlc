# Migration, rollout, disable, rollback

## Compatibility with Lumine-baked flow

| Environment | Use |
|-------------|-----|
| Raphael/Lumine with PR Warden UI + MCP | **Primary.** Arm via UI or `pr_warden_*`. Do not run portable `sweep` on the same keys. |
| Claude / Codex / Cursor without Lumine | Portable skill + `adapter.mjs` + twg |
| CI / fixtures | `npm run test:pr-warden` and fixture `run` / `sweep` |

Portable policy modules are **parity ports** of pure functions from RaphaelCore. If Lumine policy changes, update `scripts/lib/policy.mjs` and tests.

## Rollout

1. Install skill into project shared path:

   ```bash
   npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
   ```

2. Confirm twg signed-in (`twg status` or equivalent).

3. Dry-run fixtures:

   ```bash
   npm run test:pr-warden
   node skills/pr-warden/scripts/adapter.mjs run \
     --fixture skills/pr-warden/fixtures/pr-snapshot.ci-red.json \
     --config skills/pr-warden/examples/schedule.config.json
   ```

4. Copy `examples/schedule.config.json` → repo-local config; set `trustedPaths`, `repositories`, `dryRun: true`.

5. Enable scheduled sweep on a single low-risk repo; review envelopes for 1–2 cycles.

6. Set `dryRun: false` only when Bitbucket/Jira write paths are accepted; keep trusted paths tight.

7. Claude marketplace:

   ```text
   /plugin marketplace add patrick-lai/sdlc
   /plugin install pr-warden@sdlc
   ```

## Disable

- **Portable:** stop cron/automation; or `adapter.mjs stop --id …` for each watch; or delete/rename ledger file.
- **Lumine:** global PR Warden pause / stop watches (existing UI).
- Config flag pattern: `"actions": { "bitbucket": false, "jira": false }` and `codeChangeMode: "observe_only"`.

## Rollback

1. Disable schedules first (stops new side effects).
2. Revert skill install / plugin uninstall.
3. Remove `.pr-warden-ledger.json` if portable-only (does not touch Lumine `pr-warden.json` under Raphael home).
4. Lumine ledger path is channel-scoped (`RaphaelRuntime.homeDirectory()`); portable ledger is separate by design — no shared stomping.

## Verification commands

```bash
# Unit/fixture suite
npm run test:pr-warden

# Manual one-shot
node skills/pr-warden/scripts/adapter.mjs run --fixture skills/pr-warden/fixtures/pr-snapshot.ready.json --config skills/pr-warden/examples/schedule.config.json

# Scheduled shapes
node skills/pr-warden/scripts/adapter.mjs sweep --fixture-dir skills/pr-warden/fixtures --config skills/pr-warden/examples/schedule.config.json
node skills/pr-warden/scripts/adapter.mjs digest --fixture-dir skills/pr-warden/fixtures --config skills/pr-warden/examples/schedule.config.json --force

# Link + policy smoke
node skills/pr-warden/scripts/adapter.mjs parse-link 'acme/payments#1'
node skills/pr-warden/scripts/adapter.mjs classify --facts skills/pr-warden/fixtures/pr-snapshot.ci-red.json
node skills/pr-warden/scripts/adapter.mjs gate-paths --files 'src/a.ts,.env' --trusted 'src/**'
```

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Behavioral drift from Lumine | Policy tests mirror RaphaelCore expectations; re-diff against `PRWarden.swift` on upgrade |
| Notification noise | Per-item actions + once-per-handoff semantics; digest is risk-only |
| False positives | Confidence + evidence gaps; incomplete → best effort, not silent green |
| Permission boundaries | Permission fixture path; no mutations on 403 |
| Scheduler duplication | Coexistence rule: one owner per PR key |
| Credential differences | Document twg requirement; fail closed |
| Mirror divergence | Refresh plugin from `skills/pr-warden` after edits |
