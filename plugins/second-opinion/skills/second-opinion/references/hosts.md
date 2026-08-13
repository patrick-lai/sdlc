Use the **current host's native in-chat subagent API**. Never start another vendor's CLI, Task, or agent from inside this host.

## Model

Stay on this host's native catalog. Prefer the cheapest capable native model that can read a diff:

| Host | Preferred reviewer model | If that id is not advertised |
|------|--------------------------|------------------------------|
| Cursor | `gpt-5.6-luna` (or the cheapest advertised `luna` / `gpt-5.6-luna*` id) | host default cheap / auto |
| Claude Code | `haiku` | cheapest native Claude id |
| Codex | cheapest native Codex id (Luna when the host exposes it on Codex) | inherit the session model |
| Other | cheapest native model on **this** host | host default |

Do not invent a model id. Do not pass a Claude id on Cursor, a Cursor id on Codex, or a Codex/Cursor id on Claude.

## Spawn

Detect the host from available tools, not from guesswork.

**Cursor.** Use the native Task / Agent subagent tool. Request a read-only or ask/plan reviewer. Set `model` to the Cursor row above. Do not call `claude` or `codex`.

**Claude Code.** Prefer `Task` with `subagent_type: second-opinion` when that plugin agent is registered. Otherwise `Task` with a read-only explore/general reviewer, `model: haiku`, tools limited to Read / Grep / Glob. Do not call `cursor-agent` or `codex`.

**Codex.** Use Codex's native spawn / subagent API. Ask for a read-only explorer/reviewer role when the host has one. Stay on a Codex-native model. Do not call `claude` or `cursor-agent`.

**Any other host.** Use that host's native subagent/Task/Agent API the same way: fresh isolated context, read-only, cheapest native model, inject [reviewer.md](reviewer.md).

Same-vendor CLI is a last resort only when the host has **no** in-chat subagent API. Keep the subprocess read-only and never add bypass / yolo / no-sandbox / skip-permission / auto-approve flags.

| Host | Last-resort same-vendor CLI |
|------|-----------------------------|
| Cursor | `cursor-agent --print --output-format text --mode ask --sandbox enabled --trust --workspace <repo>` plus `--model <advertised-luna-id>` when known |
| Claude Code | `claude --print --output-format text --permission-mode plan --tools Read,Glob,Grep` plus `--model haiku` when the CLI accepts it |
| Codex | `codex exec --sandbox read-only --ephemeral --color never -C <repo> -` |

If spawn fails, the parent reports `FAILED` and continues. The parent must not review the change itself.
