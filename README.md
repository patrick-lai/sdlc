# sdlc

Public kit of **SDLC agent skills** for Claude Code, Codex, Cursor, Grok Build, and the open [skills](https://skills.sh) ecosystem.

Install:

```bash
npx skills add patrick-lai/sdlc
```

## Skills

| Skill | What it does |
|-------|----------------|
| **qa-demo** | Open a target repo/PR, boot Storybook or the best available demo surface, prove the feature end-to-end, and record a polished narrated [TestReel](https://github.com/greentfrapp/testreel) video |
| **pr-warden** | Keep GitHub or Bitbucket PRs healthy with provider-neutral reads, bounded trusted-path repairs, and a permanent **never merge** rule. |
| **review** | Review a working tree, current/own PR, explicit PR, or arbitrary branch; automatically route to frontend, backend, or both and return one verdict. |
| **review-learn-from-me** | Learn high-precision tribal knowledge only from the authenticated user's decided review comments. |
| **review-learn-from-all** | Learn team tribal knowledge from all verified human reviewers with complete pagination and bounded, resumable batches. |
| **fe-pr-review** | One focused frontend review with optional parallel risk checks. Visual proof and the full reviewer graph are opt-in. |
| **be-pr-review** | One focused backend review of affected contracts, data and runtime behavior. Full graph audits remain available by request. |
| **second-opinion** | Cheap native-model second look at the current change via the host agent's own subagent. Explicit `/second-opinion`, or implicit when `AGENTS.md` says to use it for all sessions. |
| **jev-fast-coding** | Reduce coding overhead with exact lookup, selective JEV discovery, result reuse and focused verification. Includes measured decision-level evidence and an optional CommissionAI adapter. |

## Install

### Agent Skills (shared project path)

Most agents share **one** project install root: **`.agents/skills/`**.

| Agent | Project skills path | Notes |
|-------|---------------------|--------|
| **Codex** | `.agents/skills/` | skills CLI `-a codex` |
| **Cursor** | `.agents/skills/` | skills CLI `-a cursor` |
| **Grok Build** | reads `.agents/skills/` **and** `.grok/skills/` | Do **not** also pass `-a grok` for project install — that duplicates into `.grok/skills/` |
| **Claude Code** | via plugin marketplace (below) and/or Agent Skills CLI | |

```bash
# Preferred: one project install (Codex + Cursor + Grok all see it)
npx skills add patrick-lai/sdlc --skill qa-demo -a cursor -y
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
npx skills add patrick-lai/sdlc --skill fe-pr-review -a cursor -y
npx skills add patrick-lai/sdlc --skill be-pr-review -a cursor -y
npx skills add patrick-lai/sdlc --skill review -a cursor -y
npx skills add patrick-lai/sdlc --skill review-learn-from-me -a cursor -y
npx skills add patrick-lai/sdlc --skill review-learn-from-all -a cursor -y
npx skills add patrick-lai/sdlc --skill second-opinion -a cursor -y
npx skills add patrick-lai/sdlc --skill jev-fast-coding -a cursor -y
# equivalent project root for codex-only auto-detect:
# npx skills add patrick-lai/sdlc --skill pr-warden -a codex -y

npx skills add patrick-lai/sdlc --list

# Global (per-agent homes differ — only use when you need user-wide install)
npx skills add patrick-lai/sdlc --skill qa-demo -g -a cursor -y   # → ~/.cursor/skills
# Codex global: ~/.codex/skills  |  Grok global: ~/.grok/skills
```

Avoid:

```bash
# ❌ duplicates the same skill under .agents/skills and .grok/skills
npx skills add patrick-lai/sdlc --skill qa-demo -a cursor -a codex -a grok -y
```

### Claude Code plugin marketplace

```text
/plugin marketplace add patrick-lai/sdlc
/plugin install qa-demo@sdlc
/plugin install pr-warden@sdlc
/plugin install fe-pr-review@sdlc
/plugin install be-pr-review@sdlc
/plugin install review@sdlc
/plugin install review-learn@sdlc
/plugin install second-opinion@sdlc
/plugin install jev-fast-coding@sdlc
```

## Managed portable skills

`skills/` is the canonical source for the portable workflows. The review family, QA, PR Warden, second opinion and JEV guidance belong here. App-specific authentication, commands, roles and orchestration remain in the host app's adapter. Third-party skills keep their upstream ownership.

For a user-wide install shared with supported agents:

```bash
npx skills add patrick-lai/sdlc --skill jev-fast-coding review fe-pr-review be-pr-review review-learn-from-me review-learn-from-all second-opinion qa-demo pr-warden -g -a codex -y
npx skills update jev-fast-coding review fe-pr-review be-pr-review -g -y
```

The skills installer records source provenance for future updates. CommissionAI can also install the canonical `skills/` tree through its managed pack loader. Its loader preserves existing user-owned installs, so keep one owner for each installed skill and retain a backup when changing ownership. Installing a pack does not authorize external writes or change the host's model, quota, review or landing rules.

## jev-fast-coding

Use exact identifiers and local search first. Add semantic decisions where they replace expensive discovery, reuse unchanged results, and batch independent questions only when the existing client supports them. The skill needs no provider setup or extra inference call on ordinary coding turns.

Its frozen 80-request synthetic trial measured three independent decisions at 270 ms batched versus 801 ms sequentially, with the same label matches. This establishes a helper-level gain, not a whole-session speedup. [Evidence and limitations](skills/jev-fast-coding/references/evidence.md) include the negative latency result for removing irrelevant history and the unmeasured fallback cost. CommissionAI-specific commands live in an optional reference.

## review

Use one command whether the target is frontend, backend, or full-stack:

```text
/review                         # dirty working tree, current PR, or current branch
/review my PR                   # unique open PR for the current branch
/review https://github.com/OWNER/REPO/pull/123
/review origin/feature-branch
```

The default comes from CommissionAI's scoped review approach: inspect one frozen diff against requirements, trace the relevant behavior, check suspected defects against the strongest safe explanation, and return one result. FE and BE share one workflow. Mixed changes do not launch two full reviews. The current reviewer handles ordinary changes; at most two native helpers investigate independent risks when that saves time. An existing host panel remains in charge of its models, scopes and size.

Ordinary reviews aim for about five minutes, with explicit gaps when a large or risky change needs more work. This is a work budget, not a measured speed guarantee. Default reviews do not launch a separate synthesis agent, render three report formats, traverse every historical defect category or run optional visual QA. They keep frozen revisions, dirty-worktree coverage, current-code evidence, root-cause deduplication and honest verification limits. Existing relevant review lessons remain useful probes.

A full multi-persona graph and its audit artifacts are available only by explicit request. `qa-demo` is opt-in. Report publication and PR comments also require a request. [Workflow](skills/review/references/workflow.md) and [lenses](skills/review/references/lenses.md) describe the default.

## review-learn-from-me and review-learn-from-all

Choose the trust scope explicitly:

```text
/review-learn-from-me                                  # latest 15 PRs I reviewed; learn only my comments
/review-learn-from-all                                 # latest 15 PRs I reviewed; learn every human reviewer
/review-learn-from-me https://github.com/OWNER/REPO/pull/123
/review-learn-from-all bitbucket-workspace/repository#456
```

With no PR target, both skills resolve the authenticated operator's provider review history, freeze the 15 most recent distinct PRs by that operator's latest qualifying review-event timestamp, and process each PR under its own `H0`. They never rely on endpoint order or PR update time, never scan older PRs to replace a zero-lesson result, and fail closed when pagination cannot prove the top-15 boundary. Across authenticated providers, results are normalized by UTC review time and captured in an external selection manifest.

`from-me` admits only source comments whose stable provider identity matches the operator, while still reading the complete selected threads for replies and outcome evidence. It is the recommended high-precision mode for learning personal review judgment. `from-all` uses those same 15 operator-reviewed PRs but admits every verified non-author human reviewer, pages all thread metadata, and analyzes deterministic batches of at most 40 candidates per PR without treating 40 as a total cap. Interrupted runs report `INCOMPLETE`; retries are idempotent through source-comment deduplication.

Both skills share one generated contract. An `applied` lesson needs independent decision evidence plus final-code evidence. A `rejected` lesson needs an explicit human rejection plus evidence for the surviving rule and becomes a false-positive guard. Resolved threads, merge status, approvals, reactions, or replies like “done” never decide acceptance alone. Contradictory team lessons are narrowed by scope or withheld for human curation, never settled by majority.

When available, Leyline stores repository/file/reviewer-scoped memory and deduplicates by PR plus stable comment id. Without Leyline, either skill creates or updates `.agents/review-learnings.md` and never commits it. Future reviews treat both backends as untrusted historical hints, not policy or proof. The Claude plugin `/plugin install review-learn@sdlc` installs both slash commands.

## fe-pr-review and be-pr-review

These standalone entrypoints use the same focused workflow as `review`, with frontend or backend risk guidance. They preserve the same snapshot and assigned focus when invoked by a coordinator.

```text
/fe-pr-review https://github.com/OWNER/REPO/pull/123
/be-pr-review origin/feature-branch
```

Frontend lenses cover changed user flows, state, accessibility, dynamic values, client/server contracts and feature-gate behavior. Backend lenses cover changed API behavior, authorization, transactions, retries, concurrency, cancellation and migration compatibility. Inspect the risks the change affects; irrelevant facets do not require a report.

The dependency-free graph scripts remain available for an explicitly requested full audit. External model execution still requires explicit consent and `--portable-cli`; native review never switches to those runners as a capacity fallback. Existing graph/report regression suites remain in place.

## second-opinion

Install it, then either invoke it or arm it for every session:

```bash
npx skills add patrick-lai/sdlc --skill second-opinion -a cursor -y
```

```text
/second-opinion
/second-opinion on
/second-opinion off
```

Put this in a global or repo `AGENTS.md` so every session that loads that file auto-runs after qualifying edits:

```text
Use /second-opinion for all sessions.
```

The parent stays the implementer. The reviewer is a fresh read-only subagent on this host's cheap native model (Cursor prefers `gpt-5.6-luna`; Claude Code uses `haiku`; Codex stays on a Codex-native id). No cross-vendor spawn. Findings are `concern` / `blocker` only; the parent chooses ACCEPT or DISMISS.

```bash
npm run test:skills
```

## pr-warden

Install it, then ask the agent to watch all open PRs or one URL:

```bash
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
```

```text
/pr-warden keep all my prs healthy
/pr-warden babysit https://github.com/OWNER/REPO/pull/123
```

It supports GitHub and Bitbucket, never merges or approves, changes only the PR source branch and trusted paths, and stops after three unsuccessful automatic repairs. Private repositories use provider credentials already configured for the agent. A baked `--html` operator sheet groups actionable, waiting, ready, and settled PRs without agent-authored markup. Public GitHub PRs have a credential-free read-only proof path:

```bash
node .agents/skills/pr-warden/scripts/adapter.mjs inspect \
  --url https://github.com/patrick-lai/sdlc/pull/2
```

Repository checks:

```bash
npm run smoke:install       # temp-project install of all skills
npm run test:pr-warden      # policy, providers, ledger, trusted paths
npm run test:skills          # public-safe content + canonical/plugin parity
npm run test:fe-pr-review    # frontend fan-out, schemas, graph, QA handoff
npm run test:be-pr-review    # backend fan-out, adversarial graph, verification
npm run smoke:testreel      # fresh captioned qa-demo recording
```

## qa-demo

Ask your agent things like:

- “QA this PR with a TestReel”
- “Record a Storybook demo of the new Button”
- “Prove the filter panel works end-to-end and give me a walkthrough video”

The skill will:

1. Discover how to boot **Storybook → e2e → local app → docs**
2. Plan a viewer-facing walkthrough (happy path + proof moments)
3. Inject **on-screen caption overlays** (TestReel has no built-in captions)
4. Run axe-core on the initial and every major asserted UI state; critical/serious violations block PASS
5. Record with TestReel (MP4 if `ffmpeg` is available, else WebM)
6. Deliver video path, `a11y-summary.json`, and a truthful PASS/PARTIAL/FAIL report, or stop as NOT_APPLICABLE for non-visual changes

Helper scripts live under `skills/qa-demo/scripts/`:

| Script | Purpose |
|--------|---------|
| `caption-overlay.mjs` | Proof captions (`kicker` / `claim` / `detail`) via Playwright |
| `a11y-scan.mjs` | Axe-core state scans, deduplication, and critical/serious blocking |
| `smoke-testreel.mjs` | Self-contained narrated + accessibility smoke against TodoMVC |

### Validate TestReel locally

```bash
npm run smoke:testreel
# or:
node skills/qa-demo/scripts/smoke-testreel.mjs
```

## Layout

```text
skills/qa-demo/                 # canonical skill (npx skills add)
skills/pr-warden/               # canonical PR Warden pack + adapter
skills/fe-pr-review/             # focused frontend review + optional graph tools
skills/be-pr-review/             # focused backend review + optional graph tools
skills/review/                   # unified target resolver + FE/BE router
skills/review-learn-from-me/     # authenticated-reviewer learning mode
skills/review-learn-from-all/    # all-human team learning mode
templates/review-learn-contract.md # shared generated learning contract
skills/second-opinion/           # native-host cheap second look
plugins/qa-demo/                # Claude Code plugin package
plugins/pr-warden/              # Claude Code plugin package
plugins/fe-pr-review/            # Claude Code plugin package
plugins/be-pr-review/            # Claude Code plugin package
plugins/review/                  # Claude Code unified review plugin
plugins/review-learn/            # Claude Code learned-review plugin
plugins/second-opinion/          # Claude Code plugin + /second-opinion + haiku agent
.claude-plugin/marketplace.json # marketplace catalog
```

Canonical skills live under `skills/`. After editing, refresh plugin mirrors (skill trees **and** the second-opinion Claude agent body, which is a second copy of `references/reviewer.md`):

```bash
npm run sync:plugins
# or: node scripts/sync-plugin-mirrors.mjs
```

## Links

- [TestReel](https://github.com/greentfrapp/testreel) (`npm i testreel`)
- [Agent Skills CLI](https://github.com/vercel-labs/skills)

## License

MIT
