# Behavioral map — Lumine PR Warden → portable skill

Source of truth for behavior: `~/claude/raphael` (not this document). This map is a portability index so agents preserve the flow without rewriting the app.

## Primary sources

| Area | Path |
|------|------|
| Feature doc | `docs/features/pr-warden.md` |
| Policy / records / gates | `Sources/RaphaelCore/PRWarden.swift` |
| Link parser | `Sources/RaphaelCore/PRWardenLink.swift` |
| Service loop / ledger / dispatch | `Sources/RaphaelApp/PRWardenService.swift` |
| UI ledger | `Sources/RaphaelApp/Stages/PRWardenStage.swift` |
| Mechanical snapshot | `Sources/RaphaelApp/TodayService.swift` (`PRWardenSnapshot`) |
| Repair brief | `Sources/RaphaelApp/WorkspaceStore+TodayDispatch.swift` (`TodayDispatchPrompts.prWarden`) |
| MCP | `pr_warden_watch`, `pr_warden_status`, `pr_warden_stop` |
| Tests | `Tests/RaphaelCoreTests/PRWardenTests.swift`, `PRWardenWatchTests.swift` |

## Flow (preserved)

```text
Arm watch (Today / paste / MCP)
    → state=unknown, nextCheck=now, attemptCount=0
    → mechanical read: twg bitbucket pull-requests get --full
    → facts + condition buckets
    → classify → PRWardenState
    → if actionable + agent selected → claim lease → dispatch repair
    → repair pushes to PR source branch only
    → settle / rest → recheck (no immediate re-dispatch storm)
    → handoff (ready / needs you) notifies once per transition
    → never merge
```

## Inputs

- Bitbucket PR coordinate: `workspace`, `repo`, `number` (canonical key `bitbucket:ws/repo#n`)
- Optional: coding agent name, check interval (floor 5m, default 15m), trusted paths (portable)
- Credentials: signed-in `twg` / Raphael session (no new secret store in the skill)

## State vocabulary

`unknown · unreadable · ciRed · conflict · needsWork · ciRunning · ciUnknown · draft · awaitingReview · readyToMerge · needsYou · merged · closed`

Operator words: "not read yet", "CI red", "ready to merge", …

## Side effects (Lumine)

| Effect | When |
|--------|------|
| Persist `pr-warden.json` ledger | every mutation |
| Spawn coding agent | actionable + agent + claim |
| AFM custom pipeline | AFM repo only |
| macOS notification | first ready / needs-you / exhausted |
| Audit events | arm, stop, refresh, unreadable, dispatch, escalate, … |
| Merge | **never** |

## Portable adapter mapping

| Lumine | Portable |
|--------|----------|
| `PRWardenService` loop | `adapter.mjs sweep` + agent schedule |
| `PRWardenPolicy` | `scripts/lib/policy.mjs` |
| `PRWardenLinkParser` | `scripts/lib/link-parse.mjs` |
| `pr-warden.json` | config `ledgerPath` |
| `TodayDispatchPrompts.prWarden` | `references/repair-brief.md` |
| MCP status DTO | `sdlc.pr-warden.result/v1` envelope |
| Notifications | envelope + Bitbucket/Jira per-item actions |

## Scheduling assumptions (Lumine)

- Global enable switch
- Single scheduler task; due = enabled, unleased, not hydrating, deadline passed
- Actionable results always eligible for dispatch (no second cooldown that strands red CI)
- Bounded attempts; exhaustion → needs you

## Explicit non-goals of the portable pack

- Rebuilding the Swift UI / rail / worktree pool
- GitHub PR watching (Bitbucket-only, same as Lumine)
- Auto-merge
