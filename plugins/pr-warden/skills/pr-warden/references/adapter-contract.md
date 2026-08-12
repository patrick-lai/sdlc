# Portable adapter contract

The adapter is a provider-neutral, read-only-by-default seam for agents and schedulers.

## Commands

```bash
node scripts/adapter.mjs parse-link <url>
node scripts/adapter.mjs inspect --url <public-github-pr-url>
node scripts/adapter.mjs classify --facts <snapshot.json>
node scripts/adapter.mjs run --fixture <snapshot.json> --config <config.json>
node scripts/adapter.mjs arm --url <github-pr-url>
```

`inspect` reads public GitHub metadata and reviews, emits `sdlc.pr-warden.result/v1`, and never mutates the PR. `arm` and fixture-free `sweep` currently support GitHub watches; Bitbucket remains available through supplied snapshots or an authenticated provider connector, but the adapter rejects arming a Bitbucket watch until it has a live-read seam. Private repositories use provider credentials already configured for the agent. The skill stores no tokens.

Canonical keys are `github:owner/repo#number` and `bitbucket:workspace/repo#number`. Missing auth or evidence fails closed: low confidence, evidence gaps, and no actions.

Config controls ledger path, dry-run, check interval, maximum attempts, trusted paths, enabled provider actions, and repositories. `dryRun: true` withholds every provider mutation. Every action carries an idempotency key; duplicates are skipped.
