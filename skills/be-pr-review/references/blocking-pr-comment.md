# Blocking PR comment format

Use this format only for a verified `blocking` finding that is anchored to a changed line in the current immutable review snapshot. It is an inline PR comment, not a generic top-level summary.

```markdown
### 🔴 Blocker: <short defect title>

#### 🧪 How to reproduce

1. <concrete precondition or input>
2. <user, request, job, event, or deployment action>
3. <observable incorrect result>

#### 🔎 Root cause

`<path>:<line>` <first changed behavior that violates the contract>. This causes <execution path>, so <invariant> no longer holds.

#### 💥 Why this blocks the PR

<specific user, data, security, availability, or compatibility impact.>

#### 🛠 Suggested fix

<one sentence naming the smallest safe change.>

```<language>
<minimal code-level patch or explicitly labelled pseudocode when exact syntax cannot be established safely>
```

#### ✅ Focused verification

<test or reproduction that fails before the fix and passes after it.>

<!-- sdlc-review:blocker h0=<H0> fingerprint=<stable finding fingerprint> -->
```

## Publication gate

- Publish only after the coordinator independently confirms the finding against `H0`, including the root cause, all reproduction steps, a changed-line anchor, impact, and a code-level fix.
- Re-fetch the PR, source head, inline threads, and target line immediately before posting. If the source no longer equals `H0`, do not comment and restart the review once.
- Post at most one inline comment per distinct root cause. Deduplicate against the marker for the same `H0` and finding fingerprint. Do not update, resolve, or alter human-authored threads.
- Do not publish `UNVERIFIED`, operational, rollout-confirmation-only, speculative, or non-blocking observations. A missing code snippet is not a reason to invent one: keep the finding private until an exact patch or clearly labelled pseudocode can be supported by inspected code.
- If the blocker is conditional, state the exact safe condition first. Do not call it a blocker when the condition is only hypothetical.
