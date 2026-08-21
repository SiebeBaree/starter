# starter

This is how I start new projects.

I kept rebuilding the same setup every time: env validation, rate limiting, error tracking, analytics, logging, CI, CSP, linting, formatting. Then creating the repo, the database, the Vercel projects, the Sentry projects, wiring env vars and deploying. That's a full day of work before writing a single feature. This repo is that day, done once.

It holds two templates and a CLI. The templates are complete apps with every decision already made. The CLI, `sb-setup`, turns a template into a private GitHub repo with provisioned services and a live deployment in a few minutes.

Everything is opinionated on purpose. These are my defaults, not a framework. Fork it and make them yours.

## Templates

Both templates are a small todo app, enough real code to show how each piece is meant to be used, small enough to delete in ten minutes. Neither ships auth because I alternate between Clerk and better-auth per project. All services run in EU regions.

### `nextjs/`

Next.js 16 App Router for the simple projects. Drizzle on Neon Postgres, TanStack Query, React Hook Form with Zod, t3-env with a strict client/server split, shadcn/ui on Tailwind v4.

The parts I never want to build again:

- Every mutation goes through a `createAction()` wrapper: Zod validation, rate limiting via Upstash and consistent error shapes in one place.
- A strict nonce-based CSP in `src/proxy.ts`, no `unsafe-inline`.
- A request id minted in the proxy correlates Axiom logs, Sentry events and the error reference the user sees.
- PostHog and Sentry are proxied through the app's own routes, verified against EasyPrivacy, uBlock and AdGuard lists.
- Observability degrades gracefully without keys. `DATABASE_URL` is required and fails fast at boot.
- CI runs typecheck, lint, format check, unit tests and Playwright e2e.

### `react-fastify-turbo/`

A Turborepo monorepo for the bigger projects: Vite + React Router (framework mode, SPA) in `apps/web`, Fastify 5 in `apps/api`, shared packages for contracts, db, env, logger and configs.

The interesting decisions:

- Zod wire contracts live in `packages/contracts` and the api uses `fastify-type-provider-zod`, so every request is validated and every response is serialized against the same schemas the web client imports.
- The web app talks to the api cross-origin directly, no proxy hop. `apiFetch` reports contract-violating 200s to Sentry, which is how you notice deploy skew.
- Hash-based CSP for the web bundle, no nonces and no `unsafe-inline`. A post-build script hashes the React Router bootstrap scripts and injects the policy, and an e2e test asserts zero violations.
- The api writes canonical log lines as JSON to stdout, shipped to Axiom through Vercel's log drain.
- Api integration tests run against PGlite with real migrations, no database container needed.

## sb-setup

A Bun CLI in `sb-setup/`. One run takes you from nothing to a deployed project:

1. Checks your API tokens against each service and tells you exactly which ones are missing or broken, with the URL to create them.
2. Asks for name, slug, directory, template and which services you want. Answers are cached and prefilled next run.
3. Copies the template from your local checkout, fills in the placeholders, commits and pushes to a new private GitHub repo.
4. Provisions what you picked: Neon Postgres (and runs migrations), Upstash Redis, Axiom, PostHog, Sentry.
5. Creates the Vercel project (two for the monorepo), sets all env vars and deploys.

Every step finds before it creates, so if a run fails halfway you re-run with the same answers and it resumes where it stopped. Tokens live in `~/.config/sb-setup/credentials.json`, created with mode 600 on first run.

The optional services are exactly Neon, Upstash, Axiom, PostHog and Sentry. GitHub and Vercel are always required.

## Using it yourself

The CLI copies templates straight from this repo's checkout on disk, so there is nothing to host separately. To use it:

1. Fork or clone this repo. Editing the template folders is how you make the defaults yours.
2. `cd sb-setup && bun install`, then symlink `index.ts` somewhere on your PATH:

   ```sh
   ln -s "$(pwd)/index.ts" ~/.local/bin/sb-setup
   ```

   It runs uncompiled through Bun, so a `git pull` is the whole upgrade.

3. Run `sb-setup`. The doctor walks you through the tokens on first run.

You'll need Bun, pnpm and git. Templates use `%APP_NAME%`, `%SLUG_NAME%` and `%DOMAIN%` as placeholders, so if you edit them, keep those intact.

## License

MIT
