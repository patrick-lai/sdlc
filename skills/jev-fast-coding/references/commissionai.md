# CommissionAI adapter

Read this only inside a CommissionAI-managed agent session or when working on the CommissionAI integration. The daemon owns provider credentials, decision caching, concurrent request sharing and local ACP fallback. Use its authenticated CLI. Keep the session's role permissions and daemon-owned runtime landing unchanged.

## Discovery commands

For an exact source title or browser skill name, bypass inference:

```sh
commissionctl context "Source title"
commissionctl browser skill name=known-skill
```

For semantic discovery across unfamiliar board sources or taught browser workflows:

```sh
commissionctl context --query "Relevant source for the current question"
commissionctl browser skill query="Relevant taught workflow"
```

Read the relevant full source or skill and complete index before deciding. Suggestions may miss evidence. Source selection and passage selection depend on each other and stay sequential.

Reuse unchanged results. The daemon caches completed identical requests and shares simultaneous identical decisions. Changed evidence, criteria or provider settings require a fresh decision. Limit distinct semantic queries to two at once; busy decision slots fall back to local behavior. The current selection commands accept one question per decision and expose no generic batch command.

## Assessment and diagnostics

The Commander can assess an actual ticket ambiguity:

```sh
commissionctl board assess KEY
```

Confirm suggested gaps in the full ticket and board context before asking the user. Do not assess every ticket as a speed preflight. Classification can start a slower local ACP fallback and never grants permission, replaces review or establishes readiness.

For an overhead investigation, inspect decision telemetry:

```sh
commissionctl tool decision_status '{}'
```

`shared_requests` counts callers joining pending decisions, including cases where the owner eventually fails. `cache_hits` counts reuse of completed results. Do not poll this command on ordinary turns.

Review agents remain read-only and the Commander delegates implementation. Development assistants outside the app follow the user's Git authorization and repository rules. In the CommissionAI repository, iterate with `make fast` and pass `make check` before pushing.
