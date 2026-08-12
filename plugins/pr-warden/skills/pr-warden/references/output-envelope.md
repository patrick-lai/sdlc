# Result envelope `sdlc.pr-warden.result/v1`

Every manual or scheduled result uses this shape. Facts and decisions stay in separate blocks.

```json
{
  "schema": "sdlc.pr-warden.result/v1",
  "skill": "pr-warden",
  "mode": "manual",
  "generatedAt": "2026-08-12T00:00:00.000Z",
  "idempotencyKey": "pr-warden:…",
  "item": {
    "provider": "bitbucket",
    "key": "bitbucket:ws/repo#42",
    "workspace": "ws",
    "repo": "repo",
    "number": 42,
    "url": "https://bitbucket.org/ws/repo/pull-requests/42",
    "title": "…",
    "branch": "feat/x",
    "jiraKeys": ["ABC-1"]
  },
  "facts": { "lifecycle": "open", "ci": "red", "hasConflicts": false },
  "conditions": {
    "repairable": ["…"],
    "operatorActions": [],
    "externalGates": ["Approval required"],
    "waiting": [],
    "ignored": []
  },
  "gates": {
    "ci": "blocked",
    "conflicts": "done",
    "feedback": "done",
    "approvals": "human",
    "ready": "pending"
  },
  "state": "ciRed",
  "displayWord": "CI red",
  "decision": {
    "decision": "dispatch_repair",
    "reason": "…",
    "mayDispatchRepair": true,
    "mayMerge": false
  },
  "policy": {
    "mayMerge": false,
    "codeChangeMode": "pr_only_trusted_paths",
    "trustedPaths": ["src/**"],
    "dryRun": true
  },
  "actions": [
    {
      "surface": "bitbucket",
      "kind": "repair_pass",
      "status": "planned",
      "itemKey": "bitbucket:ws/repo#42",
      "evidenceUrl": "https://bitbucket.org/ws/repo/pull-requests/42",
      "idempotencyKey": "…"
    },
    {
      "surface": "jira",
      "kind": "risk_note",
      "status": "planned",
      "itemKey": "ABC-1",
      "evidenceUrl": "https://jira.atlassian.com/browse/ABC-1"
    }
  ],
  "confidence": 0.85,
  "provenance": [{ "source": "mechanical-read", "tool": "twg …", "at": "…" }],
  "assumptions": [],
  "evidenceGaps": [],
  "audit": { "events": [] },
  "duplicateOf": null,
  "error": null
}
```

## Required operator-facing fields

- `confidence` (0–1)
- `provenance[]`
- `assumptions[]`
- `evidenceGaps[]`
- `policy.mayMerge === false`

## Atlassian markdown

`renderAtlassianMarkdown(envelope)` produces a short comment body for Bitbucket/Jira with item links and evidence.

## Risk digest wrapper

```json
{
  "schema": "sdlc.pr-warden.risk-digest/v1",
  "skill": "pr-warden",
  "window": "2026-08-12",
  "riskCount": 2,
  "items": [ /* subset of envelopes + markdown */ ]
}
```
