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

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Runs API and web in watch mode |
| `pnpm build` | Builds all packages |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm test` | Vitest across the workspace |
| `pnpm format` | Prettier write |

## Security notes

- Never commit `.env`. Only `.env.example` lives in git.
- API errors return codes such as `{ "error": { "code": "NOT_FOUND" } }`. Clients translate them.
