# Keep generated output out of reviewer context

Start from changed-path metadata, before reading or pasting a full patch. Exclude confirmed machine-generated bodies by default. This includes Relay compiler files such as `__generated__/UserQuery.graphql.ts`, generated GraphQL client types, generated protocol bindings and build outputs confirmed by repository configuration. Review their canonical schema, operations, generator inputs, templates and configuration instead.

Resolve the directory containing the installed skill and run its helper from the reviewed repository:

```sh
node <installed-skill>/scripts/review-context.mjs --repo-root "$PWD" --base <base> --head <head>
```

The CLI compares from the merge base of `base` and `head`; use `--exact-base` only when a direct two-revision comparison is intended. Add `--worktree` for a local review including staged, unstaged and non-ignored untracked changes. The helper prints artifact paths and counts. Keep the returned `context.json` identity; use `authored.patch` for review and `omitted-files.json` only as an inventory. Inspect the authored paths relevant to each specialist. Do not paste the omitted inventory or generated bodies into every prompt. An omitted generated file is not a truncated authored file to read later.

The helper classifies known output paths, generated headers and Git attributes without sending file bodies to a model. It preserves the full change identity even though the model patch excludes generated content. Git diff/text conversion and clean/process filters are disabled during capture; `disabledFilters` records configured transforms, so use a separate existing check for any relevant normalized-output contract. Use repository instructions and codegen configuration to identify additional proven outputs that the helper does not recognize; keep an explicit path/reason record and remove those bodies before handoff. If the helper is unavailable, list changed paths first, classify them, then read diffs for an explicit authored allowlist. Never pass an empty allowlist to `git diff`, which would return the full diff. Use literal path arguments after `--` so filenames cannot become options or glob patterns.

Do not exclude a file merely because its name contains `graphql`, `generated`, `schema`, `gen` or `dist`. Handwritten `.graphql` and `.gql` schemas and operations, resolvers, codegen config/templates, migrations, lockfiles and test snapshots remain reviewable. A generated-file rename must not hide an authored deletion or addition. Retain uncertain files until provenance is established. Repo-declared non-generated files override path guesses.

A large generated patch gets no dedicated reviewer. Verify source changes and reuse same-revision codegen/type/contract checks when relevant. Generated-only churn is not proof of correctness: identify the source/toolchain cause and required generation checks, or state the gap. Do not manually audit thousands of generated lines to close that gap.

Open a generated artifact only when the user explicitly requests it or a concrete source/output discrepancy cannot be resolved from the inputs and check evidence. Name the reason and inspect only the needed symbol, hunk or generated contract once. Do not reopen the whole output tree or add a general generated-code review pass.
