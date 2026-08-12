# Agent conventions (sdlc)

This repo ships **Agent Skills** for multiple coding agents. For project-scoped skills, treat **two roots** as the real contract — do not proliferate per-vendor copies.

## Skill roots (prefer only these)

| Root | Who reads it | Use for |
|------|----------------|---------|
| **`.agents/skills/`** | Codex, Cursor, Grok Build, and most Agent Skills CLI targets that share the universal project path | **Default** project install for everyone except Claude’s plugin path |
| **`.claude/skills/`** (and Claude Code **plugins**) | Claude Code | Claude-native install; optional symlink into `.agents/skills/` if you want one tree |

### Do not duplicate

- **Grok** also scans **`.agents/skills/`** (alongside `.grok/skills/`). Installing with both `-a cursor` and `-a grok` copies the same skill twice — prefer **one** install into `.agents/skills/`.
- **Codex** and **Cursor** already share `.agents/skills/` for project scope. One of `-a codex` or `-a cursor` is enough.
- Agent-native dirs (`.grok/skills/`, `~/.cursor/skills`, `~/.codex/skills`, `~/.grok/skills`) exist for **globals** or legacy paths. For **this repo**, project skills live under **`.agents/`** (and Claude under **`.claude/`** / marketplace plugins).

```text
.agents/skills/<skill-name>/SKILL.md   ← shared project skills
.claude/skills/<skill-name>/SKILL.md   ← Claude Code project skills (optional)
plugins/<name>/                        ← Claude Code marketplace package (this repo)
skills/<name>/                         ← canonical skill source (npx skills add)
```

## Install (this package)

```bash
# Shared project path → Codex + Cursor + Grok (and peers)
npx skills add patrick-lai/sdlc --skill qa-demo -a cursor -y

# Discover
npx skills add patrick-lai/sdlc --list
```

Claude Code plugin marketplace:

```text
/plugin marketplace add patrick-lai/sdlc
/plugin install qa-demo@sdlc
```

Canonical skill source in-repo: `skills/qa-demo/`. Plugin mirror: `plugins/qa-demo/skills/qa-demo/` (keep in sync after skill edits).

## Repo map

| Path | Role |
|------|------|
| `skills/` | Source of truth for `npx skills add` |
| `plugins/` | Claude Code plugin packages |
| `.claude-plugin/marketplace.json` | Marketplace catalog |
| `fixtures/` | Local QA fixtures (e.g. dummy Java Task Board) — not required to install the skill |

## Working rules

1. Edit **`skills/qa-demo`** first; refresh the plugin mirror when the skill changes.
2. Prefer **TestReel + caption helper** paths documented in the skill; do not invent a second caption system.
3. Runtime deps (`testreel`, `playwright`, optional `ffmpeg`) are installed by runners/smoke — not vendored in the skill tree.
4. Keep project skill installs on **`.agents/skills/`**; use **`.claude`** only for Claude-specific packaging or compatibility links.
