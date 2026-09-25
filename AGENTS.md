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
/plugin install review@sdlc
/plugin install review-learn@sdlc
/plugin install second-opinion@sdlc
```

Canonical skill sources in-repo: `skills/qa-demo/`, `skills/pr-warden/`, `skills/fe-pr-review/`, `skills/be-pr-review/`, `skills/review/`, `skills/review-learn-from-me/`, `skills/review-learn-from-all/`, `skills/second-opinion/`, `skills/jev-fast-coding/`. Plugin mirrors under `plugins/` (keep in sync after skill edits).

## Repo map

| Path | Role |
|------|------|
| `skills/` | Source of truth for `npx skills add` |
| `plugins/` | Claude Code plugin packages |
| `.claude-plugin/marketplace.json` | Marketplace catalog |
| `fixtures/` | Local QA fixtures (e.g. dummy Java Task Board, pr-warden snapshots) — not required to install the skill |

## Working rules

1. Edit **`skills/<name>`** first; refresh plugin mirrors with `npm run sync:plugins` (or `node scripts/sync-plugin-mirrors.mjs`). That recopies every skill tree and rebuilds `plugins/second-opinion/agents/second-opinion.md` from `skills/second-opinion/references/reviewer.md`.
2. For **qa-demo**: prefer **TestReel + caption helper** paths documented in the skill; do not invent a second caption system. Runtime deps (`testreel`, `playwright`, optional `ffmpeg`) are installed by runners/smoke — not vendored in the skill tree.
3. For **pr-warden**: preserve the public provider-neutral policy in `skills/pr-warden/scripts/lib/`. Never auto-merge or approve. Code-change automation is PR-source-branch only, trusted paths only, and bounded to three attempts. Keep one skill tree; plugin copies are mirrors, not alternate sources of truth.
4. For **fe-pr-review** and **be-pr-review**: default to one focused read-only review and conditional risk lenses. Preserve immutable evidence, disconfirmation, revision-bound checks and opt-in visual QA. Full persona graphs are explicit-only compatibility tools; external runners remain consent-gated. Do not make reviewer counts, overlap logs, report formats or unrelated facet checklists a prerequisite for ordinary review.
5. Author shared review behavior in `templates/review-workflow.md` and lenses in `skills/review/references/lenses.md`; `npm run sync:plugins` copies them into all three standalone skill packages. Keep their entrypoints small and self-contained.
6. For **review**: resolve the target once, preserve dirty-worktree bytes and one shared `H0`, select lenses from behavior and return one verdict. Mixed changes do not run two full reviews. Reuse a host's assigned panel and checks. Learned knowledge may select probes but never proves a finding. Use at most two optional native helpers for independent risks; no separate synthesis agent on the default path.
7. For **review-learn-from-me/all**: author the shared evidence and persistence rules in `templates/review-learn-contract.md`, then run `npm run sync:plugins` to refresh both skills and the combined Claude plugin. With no explicit PR, both modes must freeze the operator's 15 most recently reviewed PRs by latest qualifying review-event timestamp, never endpoint order or PR update time. `from-me` must match the authenticated provider identity exactly; `from-all` must page every thread and batch without silent truncation. Both admit only decided human outcomes verified against final code, prefer Leyline, keep `.agents/review-learnings.md` canonical and deduplicated, and never infer acceptance from resolved/merged/approval wording alone.
8. For **second-opinion**: stay on the host's native subagent and native cheap model. No cross-vendor spawn. Reviewer is read-only; the parent triages ACCEPT or DISMISS.
9. Keep project skill installs on **`.agents/skills/`**; use **`.claude`** only for Claude-specific packaging or compatibility links.
10. Keep portable workflow instructions here and host-specific commands and orchestration in optional adapters. `jev-fast-coding` must preserve its synthetic evidence and limitations; never turn helper latency into an unmeasured whole-session speed claim.
