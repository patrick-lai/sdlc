# Boot detection heuristics

Use these checks to pick the best demo surface. Prefer **Storybook → e2e/integration → local app → docs**.

## Quick scan checklist

1. Read root (and workspace) `package.json` `scripts` + `dependencies` / `devDependencies`
2. Skim README “Development” / “Storybook” sections
3. Look for config files listed below
4. In monorepos, locate the package that owns the PR’s changed UI files
5. Match the package manager to the lockfile (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`)

## Storybook (preferred)

**Signals**

- Directory: `.storybook/` (`main.js|ts`, `preview.js|ts`)
- Deps: `storybook`, `@storybook/react`, `@storybook/vue3`, `@storybook/nextjs`, etc.
- Scripts: `storybook`, `build-storybook`
- Stories: `**/*.stories.@(tsx|ts|jsx|js|mdx)` near changed components

**Boot**

```bash
npm run storybook -- --ci
# or: npx storybook dev -p 6006 --ci
```

Default URL: `http://localhost:6006`

**Demo tips**

- Deep-link stories: `/?path=/story/<title>--<name>` (from Storybook sidebar)
- Prefer the story that matches the PR component; create a temporary story only if none exists and the user allows it
- Use the Canvas iframe selectors carefully — interact with the preview iframe when needed (`iframe#storybook-preview-iframe` → `frameLocator`)

## Playwright e2e / integration

**Signals**

- `playwright.config.ts|js`
- Deps: `@playwright/test`, `playwright`
- Scripts: `test:e2e`, `e2e`, `playwright`
- Specs: `**/*.{spec,test,e2e}.ts` under `e2e/`, `tests/`, etc.

**Boot**

- Read `use.baseURL` and `webServer` in config — Playwright may start the app for you
- If `webServer` exists, run the matching `npm run …` or let `npx playwright test` start it
- For TestReel demos, reuse `baseURL` and port; do not fight a second server on the same port

**Demo tips**

- Reuse selectors / flows from existing specs that cover the feature
- Prefer headed proof against a running preview URL rather than re-running the entire suite

## Cypress

**Signals**

- `cypress.config.ts|js`, `cypress/`
- Deps: `cypress`
- Scripts: `cypress`, `cypress:open`, `cypress:run`

**Boot**

- Start the app (`dev`/`start`) first, then point TestReel at the same base URL Cypress uses (`e2e.baseUrl`)

## Vite app

**Signals**

- `vite.config.ts|js`
- Deps: `vite`
- Scripts: `dev`, `preview`

**Boot**

```bash
npm run dev
```

Default: `http://localhost:5173` (check config `server.port`)

## Next.js

**Signals**

- `next.config.js|mjs|ts`
- Deps: `next`
- Scripts: `dev`, `start`, `build`

**Boot**

```bash
npm run dev
```

Default: `http://localhost:3000`

App Router: `app/`; Pages Router: `pages/`. Map PR files to routes for the walkthrough.

## Other app servers

| Signal | Typical boot | Default port |
|--------|--------------|--------------|
| `react-scripts` | `npm start` | 3000 |
| Remix | `npm run dev` | 3000 |
| Nuxt | `npm run dev` | 3000 |
| SvelteKit | `npm run dev` | 5173 |
| Angular | `ng serve` / `npm start` | 4200 |

Always confirm the URL printed in process logs.

## Monorepos (pnpm / Turborepo / Nx)

**Signals**

- `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`
- Root scripts that `filter` / `turbo run` / `nx run`

**Approach**

1. Find which package contains the changed UI
2. Run that package’s Storybook/dev script (e.g. `pnpm --filter @acme/ui storybook`)
3. Avoid booting unrelated apps

## Docker Compose

**Signals**

- `docker-compose.yml`, `compose.yaml`

Use only when README requires it for local UI, or when no Node script can serve the app. Prefer lighter Storybook/dev when available.

## Docs-only fallback

**Signals**

- Docusaurus / VitePress / Nextra / Astro docs package

Boot the docs `dev` script and demo the documented UI only if no interactive app/Storybook exists.

## No visual surface

If changed files and acceptance criteria are backend-, protocol-, migration-, or config-only and none of the surfaces above render the changed behavior, return `NOT_APPLICABLE`. List the evidence inspected and recommend the matching unit, integration, or API proof. Do not create a fake UI for the recording.

## Authenticated surfaces

Reuse repository-owned Playwright setup or `storageState` when available. Complete interactive login before recording and keep credentials, cookies, SSO, and 2FA out of artifacts. A missing test account is `BLOCKED`, not a feature failure.

## Decision log (copy into QA report)

```text
Chosen surface: Storybook
Why: .storybook/ present; PR touches Button.stories.tsx
Command: pnpm --filter ui storybook -- --ci
Base URL: http://localhost:6006
Alternatives considered: Vite app (heavier); Playwright (no story for this component)
```
