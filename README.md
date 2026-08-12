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
| **pr-warden** | Keep open Bitbucket PRs healthy. Say `/pr-warden keep all my prs healthy` (or schedule that every 30m). **Never merges.** |

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
```

## pr-warden

**That’s the product:**

```text
/pr-warden keep all my prs healthy
```

Schedule that prompt **every 30 minutes** in Claude/Codex/Cursor. Needs `twg` signed in. Never merges.

```bash
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
# Claude: /plugin install pr-warden@sdlc
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
4. Record with TestReel (MP4 if `ffmpeg` is available, else WebM)
5. Deliver video path + a short QA report

Helper scripts live under `skills/qa-demo/scripts/`:

| Script | Purpose |
|--------|---------|
| `caption-overlay.mjs` | DOM caption banner (`#__sdlc_caption`) via Playwright |
| `smoke-testreel.mjs` | Self-contained narrated smoke against TodoMVC |

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
plugins/qa-demo/                # Claude Code plugin package
plugins/pr-warden/              # Claude Code plugin package
.claude-plugin/marketplace.json # marketplace catalog
```

Canonical skills live under `skills/`. After editing, refresh plugin mirrors:

```bash
rm -rf plugins/qa-demo/skills/qa-demo && cp -a skills/qa-demo plugins/qa-demo/skills/qa-demo
rm -rf plugins/pr-warden/skills/pr-warden && cp -a skills/pr-warden plugins/pr-warden/skills/pr-warden
```

## Links

- [TestReel](https://github.com/greentfrapp/testreel) (`npm i testreel`)
- [Agent Skills CLI](https://github.com/vercel-labs/skills)

## License

MIT
