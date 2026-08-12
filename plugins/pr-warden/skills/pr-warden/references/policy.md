# Policy (portable)

Parity target: `PRWardenPolicy` in `~/claude/raphael/Sources/RaphaelCore/PRWarden.swift`.

## Classify priority

1. merged / deployed → `merged`
2. declined → `closed`
3. CI red → `ciRed`
4. changes requested OR unresolved tasks → `needsWork`
5. conflicts → `conflict`
6. draft → `draft`
7. operatorActionCount > 0 → `needsYou`
8. CI running → `ciRunning`
9. CI unknown → `ciUnknown`
10. no conflicts + approvals satisfied → `readyToMerge`
11. gateless green (no approval req, no external gate, green CI, no conflicts) → `readyToMerge`
12. else → `awaitingReview`

## Agent actionability

`isActionableByAgent` ⇔ `ciRed | conflict | needsWork`

`needsOperator` ⇔ `draft | readyToMerge | needsYou`

## Never merge

```js
mayMerge(_) => false
```

## Check intervals

| State | Next check |
|-------|------------|
| ciRunning | now + activeInterval (default 15m, floor 5m) |
| unknown / unreadable / ciUnknown | ≥ 5m |
| awaitingReview / draft | 30m |
| readyToMerge / needsYou | 12h |
| ciRed / conflict / needsWork | now |
| merged / closed | null (stop) |

## Gates (derived, not stored)

Journey: **CI → conflicts → feedback → approvals → ready**

Status per gate: `pending | active | blocked | human | done`

While a repair agent is live, blocked mechanical gates lift to `active`.

## AFM special case

Repo `atlassian/atlassian-frontend-monorepo` may ensure custom pipeline `default-jira-branch-deploy`. Non-AFM → no pipeline call.

## Decisions (`decideNext`)

| Decision | Meaning |
|----------|---------|
| `dispatch_repair` | Spend a coding agent on repairable work |
| `wait_and_recheck` | Mechanical wait |
| `handoff_operator` | Human ball |
| `escalate_exhausted` | Max attempts reached |
| `retry_mechanical_read` | Unreadable |
| `settle` | Terminal PR |
