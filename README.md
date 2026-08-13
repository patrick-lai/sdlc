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
| **fe-pr-review** | Fan out 3–6 read-only frontend review personas, synthesize their evidence, and fold in a `qa-demo` run without depending on one forge or model vendor. |

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
```

## fe-pr-review

Use it when a frontend PR needs independent accessibility, rollout, privacy, repository-contract, correctness, and product reviewers plus a separate synthesis pass:

```text
/fe-pr-review review <pull-request-url> and use qa-demo when the change is visual
```

The coordinator works with the authenticated forge integration already available to the agent. Its dependency-free graph runner snapshots one head, assigns 3–6 read-only personas across installed Claude Code, Codex CLI, and Cursor Agent routes, validates evidence for every declared facet, and runs a distinct synthesis node. Feature-gate review gets a prominent full-path trace from requirement decision through definition, evaluation, off/on behavior, exposure, SSR parity, rollback, tests, and cleanup. Visual proof stays with the installed `qa-demo` skill and can be attached with `--qa-report`. Every completed attempt emits self-contained `report.json`, `report.md`, and `report.html` artifacts. Reports separate the code verdict from operational follow-ups, so routine owner checklists, QA tasks, rollout communication, and post-merge cleanup do not turn sound code into a false failure. Runner exhaustion still produces an explicit `UNVERIFIED` report with all missing code facets instead of silently omitting evidence. The graph runner fails over safe routes, serializes Cursor authentication, isolates Claude from inherited MCP configuration, and never comments, approves, merges, pushes, commits, or deploys.

```bash
node .agents/skills/fe-pr-review/scripts/review-graph.mjs plan --repo-root "$PWD" --base origin/main
node .agents/skills/fe-pr-review/scripts/review-graph.mjs run --repo-root "$PWD" --base origin/main --dry-run
npm run test:fe-pr-review
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
npm run test:fe-pr-review    # fan-out routing, schemas, graph, QA handoff
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
skills/fe-pr-review/             # frontend review graph + provider-neutral runners
plugins/qa-demo/                # Claude Code plugin package
plugins/pr-warden/              # Claude Code plugin package
plugins/fe-pr-review/            # Claude Code plugin package
.claude-plugin/marketplace.json # marketplace catalog
```

Canonical skills live under `skills/`. After editing, refresh plugin mirrors:

```bash
rm -rf plugins/qa-demo/skills/qa-demo && cp -a skills/qa-demo plugins/qa-demo/skills/qa-demo
rm -rf plugins/pr-warden/skills/pr-warden && cp -a skills/pr-warden plugins/pr-warden/skills/pr-warden
rm -rf plugins/fe-pr-review/skills/fe-pr-review && cp -a skills/fe-pr-review plugins/fe-pr-review/skills/fe-pr-review
```

## Links

- [TestReel](https://github.com/greentfrapp/testreel) (`npm i testreel`)
- [Agent Skills CLI](https://github.com/vercel-labs/skills)

## License

MIT
