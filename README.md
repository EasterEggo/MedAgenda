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

### Enroll 2FA for the admin

The seed does not create TOTP. Admin routes require 2FA, so the admin enrolls it once. The easiest way is the web UI: sign in at `/pt-BR/login` and use Settings, then Two-factor authentication. Through the API instead, use `http://localhost:3001/api/v1` and keep the `sid` cookie between requests (for example with `curl -c jar -b jar`):

1. `POST /auth/login` with `{ "email": "admin@medagenda.local", "password": "<SEED_ADMIN_PASSWORD>" }`. Keep the returned `csrfToken`.
2. `POST /auth/mfa/setup` with header `x-csrf-token: <csrfToken>`. It returns `otpauthUri` and `qrDataUrl`. Add the secret to an authenticator app.
3. `POST /auth/mfa/enable` with `{ "code": "<6 digits from the app>" }` and the CSRF header. It returns 10 recovery codes, shown once. Store them.
4. From then on, each login returns `mfaRequired: true`. Call `POST /auth/mfa/verify` with `{ "code": "..." }` before using admin routes.

Never commit the seed passwords, recovery codes or TOTP secrets.

## Scripts

| Command           | What it does                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `pnpm dev`        | Runs API and web in watch mode                                              |
| `pnpm build`      | Builds all packages                                                         |
| `pnpm lint`       | ESLint across the workspace                                                 |
| `pnpm typecheck`  | `tsc --noEmit` across the workspace                                         |
| `pnpm test`       | Vitest across the workspace                                                 |
| `pnpm format`     | Prettier write                                                              |
| `pnpm db:migrate` | Applies Prisma migrations (dev)                                             |
| `pnpm db:seed`    | Idempotent seed: catalog, clinics, providers, slots, admin and demo patient |
| `pnpm e2e`        | Builds the web app and runs the Playwright E2E suite (see below)            |

## End-to-end tests (Playwright)

`pnpm e2e` builds the web app into `apps/web/.next-e2e`, starts its own API on `:3101` and web on `:3100` (so it does not collide with `pnpm dev`) and runs `apps/web/e2e`:

- `patient-flow`: register, verify the email through the Mailpit API, enable 2FA (TOTP computed with `otplib`), log out and in with a TOTP code, book an exam, see it in the calendar, download the `.ics`, cancel; then profile, calendar feed, data export and account deletion.
- `admin-flow`: forbidden state for patients and for admins without 2FA, specialty CRUD, slot generation and block/unblock.

Requirements:

1. `docker compose up -d` (Postgres and Mailpit on `:8025`), `.env` filled in, `pnpm db:migrate && pnpm db:seed`, and `pnpm exec playwright install chromium` once (run it in `apps/web`).
2. The runner's API gets `AUTH_RATE_LIMIT_MAX=1000` by default because one run signs in many times from one IP. Override with the `AUTH_RATE_LIMIT_MAX` env var.
3. `admin-flow` promotes the most recently registered test user to ADMIN with `psql` inside the compose Postgres (`docker compose exec -T postgres psql ...`). Override the command with `E2E_PSQL` (SQL on stdin). Test users are left in the dev database.

Options (env vars): `E2E_LOCALE=pt-BR|en` (default `pt-BR`; selectors use the translated catalog text), `MAILPIT_URL` (default `http://localhost:8025`), `E2E_WEB_PORT`, `E2E_API_PORT`. To rerun without rebuilding: `pnpm --filter @medagenda/web exec playwright test`.

## Security notes

- Never commit `.env`. Only `.env.example` lives in git.
- API errors return codes such as `{ "error": { "code": "NOT_FOUND" } }`. Clients translate them.
