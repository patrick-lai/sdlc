---
name: second-opinion
description: >
  Run a cheap native-model second-opinion review of the current change
  through this host agent's own subagent system. Use when the user runs
  /second-opinion, asks for a second opinion, turns implicit second-opinion
  on or off, or when AGENTS.md / user rules say to use /second-opinion for
  all sessions. After qualifying completed edits, auto-run when always-on
  is armed. Do not use for multi-vendor review, PR fan-out, or fe-pr-review.
---

# second-opinion

The parent implements and triages. A **fresh, read-only native subagent** on a cheaper native model is the reviewer. Never review your own diff.

## Mode

Default is **off**: run only on explicit `/second-opinion` / "second opinion".

**Arm always-on** for this session only when one of these phrases appears, case-insensitive, in a **user/global rules file** or a **repo instruction file** (`AGENTS.md`, or that host's stand-in `CLAUDE.md` / `CODEX.md` / `.cursorrules`):

- `use /second-opinion for all sessions`
- `use second-opinion for all sessions`
- `second-opinion: always`
- `second-opinion: on`
- `always run second-opinion`
- `enable implicit second-opinion`

Never arm from this skill (description, body, or fenced examples), its references, plugin copies, README, marketplace text, or any other documentation. Those sources may mention the phrases; they are not an instruction to turn always-on on.

**This session only:**

| User says | Effect |
|-----------|--------|
| `/second-opinion on` | arm always-on |
| `/second-opinion off` | disarm; cancel an in-flight review |
| `/second-opinion` or `once` | one explicit review now |
| `skip second-opinion` | skip this turn; leave always-on armed |

Put this in a global or repo `AGENTS.md` to auto-run in every session that loads that file:

```text
Use /second-opinion for all sessions.
```

The fenced line above is a copy target, not an arming instruction.

## When an implicit pass is allowed

Always-on still skips unless **all** of these hold:

- this turn mutated the workspace (edits landed), or the user is about to be told the work is done
- the new text is substantial (rough floor: 160 characters and 28 words of turn delta, or a non-empty source diff)
- no second-opinion review is already running
- at most **one** implicit review per user turn, and at most **two** implicit cycles after you just patched from a previous review

Explicit invocation ignores the size floor and the cycle cap. It still stays read-only and still uses the native reviewer.

Do not implicit-review Q&A, planning, or read-only investigation.

## Run

1. Collect a bounded parent brief: 2–4 sentences of what just changed; the **full** changed-file list; and `git diff` (staged + unstaged; if empty, `HEAD~1` only when the user asked to review the last commit). Paste at most ~1500 diff lines (~80k characters). If you truncate, name every omitted file in a `truncated:` list and tell the reviewer those files must be re-read with Read — do not treat the paste as the whole change. Do not paste the full chat.
2. Spawn **one** reviewer with [references/hosts.md](references/hosts.md). Paste [references/reviewer.md](references/reviewer.md) plus the brief. Mark the pass `in-flight` when edits are still mid-function; otherwise `completed`.
3. If the reply has no `<<<SECOND_OPINION` frame, send one repair turn: return the already-reached conclusion in that frame, or `{"findings":[]}`. Do not review again. If still off-contract, report `FAILED`.
4. Parse at most five `concern` / `blocker` findings. Empty `findings` is success with nothing to do — do not invent nits.

## Triage

The reviewer advises; **you** dispose. Do not ask the user to triage routine findings.

For each finding, choose **ACCEPT** or **DISMISS** against the current workspace:

- **ACCEPT** — implement the smallest correct fix and verify it
- **DISMISS** — say why, leave the code unchanged

A `blocker` you believe is wrong needs explicit evidence in your report. Do not argue in place of a fix or a dismissal.

## Report

One short status line, then only accepted/dismissed items:

`SECOND OPINION · NONE | N findings | FAILED`

Do not publish a second essay. Do not claim a review ran if spawn failed.

## Hard rules

- Native subagent only. No other vendor.
- Reviewer is read-only. Parent owns every edit.
- Agent agreement is not proof.
- Fail closed: no reviewer means `FAILED`, not a parent self-review.
- This is not `fe-pr-review`. One cheap pass, current working tree, no persona fan-out.
