# MedAgenda

One place for all your medical appointments: book consultations and exams, see them on a calendar, and export to Google Calendar.

UI languages: pt-BR (default) and English.

## Stack

- pnpm workspaces + Turborepo, TypeScript (strict), Node 22 LTS
- API: Fastify 5 (Prisma and PostgreSQL 16 arrive in Phase 2)
- Web: Next.js 15 (App Router), Tailwind CSS
- Shared: Zod schemas, error codes and i18n catalogs in `packages/shared`
- Dev infra: Docker Compose with PostgreSQL 16 and Mailpit

## Layout

```
apps/api         Fastify API
apps/web         Next.js web app
packages/shared  Zod schemas, types, error codes, i18n catalogs
packages/config  ESLint, TypeScript and Prettier presets
docker-compose.yml  PostgreSQL 16 and Mailpit
```

## Getting started

Prerequisites: Node 22+, pnpm, Docker.

```bash
cp .env.example .env          # then replace the placeholder secrets
pnpm install
docker compose up -d          # PostgreSQL on :5432, Mailpit UI on :8025
pnpm dev                      # API on http://localhost:3001, web on http://localhost:3000
```

Check it works:

- API health: http://localhost:3001/health
- Web home: http://localhost:3000

## Seed data and first admin

```bash
pnpm db:migrate               # apply migrations (dev)
pnpm db:seed                  # idempotent: safe to run again, creates no duplicates
```

`SEED_ADMIN_PASSWORD` must be set in `.env` (at least 10 characters, not a common password). The seed creates:

- 12 specialties, 10 exam types (pt-BR and English names, preparation text, duration)
- 4 clinics (São Paulo x2, Rio de Janeiro, Belo Horizonte), 15 doctors and 5 exam resources
- Slots Mon-Fri 08:00-18:00 (clinic time) for the next 60 days: 30 min for consultations, the exam's duration for exams
- `admin@medagenda.local` (password from `SEED_ADMIN_PASSWORD`, email verified, role ADMIN)
- `paciente.demo@medagenda.local` (email verified, profile filled). Its password is `SEED_DEMO_PASSWORD` if set on the first run. Otherwise it is random and unknown: use "forgot password" and read the email in Mailpit at http://localhost:8025.

Never commit the seed passwords.

## Scripts

| Command           | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `pnpm dev`        | Runs API and web in watch mode                                              |
| `pnpm build`      | Builds all packages                                                         |
| `pnpm i18n:check` | Fails if the pt-BR and en catalogs differ or a catalog key is unused        |
| `pnpm lint`       | `i18n:check`, then ESLint across the workspace                              |
| `pnpm ci`         | `lint` + `typecheck` + `test`, the chain to run in CI                       |
| `pnpm typecheck`  | `tsc --noEmit` across the workspace                                         |
| `pnpm test`       | Vitest across the workspace                                                 |
| `pnpm format`     | Prettier write                                                              |
| `pnpm db:migrate` | Applies Prisma migrations (dev)                                             |
| `pnpm db:seed`    | Idempotent seed: catalog, clinics, providers, slots, admin and demo patient |
| `pnpm e2e`        | Builds the web app and runs the Playwright E2E suite (see below)            |

## i18n

Catalogs live in `packages/shared/i18n/{pt-BR,en}.json` with the namespaces `common`, `auth`, `booking`, `calendar`, `settings`, `errors`, `admin` and `ics`. The API reads the same files for emails and ICS (`translateCatalog` in `packages/shared`). Emails use the user's stored locale.

`pnpm i18n:check` (`scripts/i18n-check.mts`) fails when the two locales have different keys, empty values or different `{placeholders}`, when `errors` does not match the shared `ErrorCodes` enum, or when a key is not referenced from `apps/web`, `apps/api` or `packages/shared`. Keys built at runtime (for example `t(\`admin.fields.${name}\`)`) must use a prefix listed in `DYNAMIC_PREFIXES` in that script.

## End-to-end tests (Playwright)

`pnpm e2e` builds the web app into `apps/web/.next-e2e`, starts its own API on `:3101` and web on `:3100` (so it does not collide with `pnpm dev`) and runs `apps/web/e2e`:

- `patient-flow`: register, verify the email through the Mailpit API, log in, book an exam, see it in the calendar, download the `.ics`, cancel; then profile, calendar feed, data export and account deletion.
- `admin-flow`: forbidden state for patients, specialty CRUD, slot generation and block/unblock.

Requirements:

1. `docker compose up -d` (Postgres and Mailpit on `:8025`), `.env` filled in, `pnpm db:migrate && pnpm db:seed`, and `pnpm exec playwright install chromium` once (run it in `apps/web`).
2. The runner's API gets `AUTH_RATE_LIMIT_MAX=1000` by default because one run signs in many times from one IP. Override with the `AUTH_RATE_LIMIT_MAX` env var.
3. `admin-flow` promotes the most recently registered test user to ADMIN with `psql` inside the compose Postgres (`docker compose exec -T postgres psql ...`). Override the command with `E2E_PSQL` (SQL on stdin). Test users are left in the dev database.

Options (env vars): `E2E_LOCALE=pt-BR|en` (default `pt-BR`; selectors use the translated catalog text), `MAILPIT_URL` (default `http://localhost:8025`), `E2E_WEB_PORT`, `E2E_API_PORT`. To rerun without rebuilding: `pnpm --filter @medagenda/web exec playwright test`.

## Security notes

- Never commit `.env`. Only `.env.example` lives in git.
- API errors return codes such as `{ "error": { "code": "NOT_FOUND" } }`. Clients translate them.
