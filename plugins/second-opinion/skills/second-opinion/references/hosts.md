The **parent agent owns handoff selection**. This skill defines the reviewer job and safety constraints; it never chooses a named agent, subagent type, model, or vendor-specific command.

## Select by capability

Before handing off, the parent inspects the native in-chat agents and models actually exposed by the current host. Choose exactly one target that best satisfies, in order:

1. read-only or least-privilege repository access;
2. fresh isolated context;
3. enough code-reading ability for the bounded diff and named files;
4. lower cost than the parent when the host exposes a suitable cheaper option.

Prefer a reviewer or explorer capability when available, but do not infer one from an agent name alone. The parent decides from advertised capabilities and remains responsible for the choice. Do not invent an agent, subagent type, or model id, and do not encode host-specific target names in this skill.

## Handoff packet

The parent gives the selected target:

- the bounded brief from the skill;
- [reviewer.md](reviewer.md) as the complete reviewer role and response contract;
- an explicit read-only constraint;
- the pass state, `in-flight` or `completed`.

The target only reviews. The parent parses and triages the result and owns every edit.

## Fallback

If no native target advertises every preferred capability, the parent chooses the safest available native target and reinforces read-only behavior in the packet. If no native in-chat handoff is available, report `FAILED` and continue without a second opinion. Do not start another vendor's CLI, choose a target prescribed by this skill, or let the skill make the routing decision.
