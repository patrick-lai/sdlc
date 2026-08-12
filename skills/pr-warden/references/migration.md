# Install and upgrade

Install once into the shared project skill root:

```bash
npx skills add patrick-lai/sdlc --skill pr-warden -a cursor -y
```

When upgrading, preserve the workspace's `.pr-warden-state.json` and any custom trusted paths. Run `npm run test:pr-warden`, then perform a read-only `inspect` against a public historical PR before enabling a schedule. Do not run two independent schedules for the same canonical PR key.

Rollback by disabling the schedule and restoring the prior skill directory. Removing the local ledger does not change any pull request.
