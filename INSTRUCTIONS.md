# MedAgenda — Build Instructions for Sonnet / Haiku

## Context
The user wants one app that brings all their medical appointments together: register securely, book different kinds of doctors (consultations) and exams from a seeded catalog, see everything on a calendar, and export to Google Calendar via `.ics`. The UI must be in **Portuguese (pt-BR, default) and English**. Security level: **strong baseline + TOTP 2FA**. Platform: **web first, with an API a mobile app reuses** (Expo app is the last phase).

The working directory `/home/apolu/claudiao_test` is empty, so this is a greenfield build. This document is the deliverable: an instruction set for a Sonnet or Haiku agent to carry out phase by phase. **Nothing gets built during planning.**

---

## 0. Rules for the executing agent (read first)
1. Do the phases **in order**. Don't start a phase until the previous phase's acceptance checks pass.
2. After each phase, run `pnpm lint && pnpm typecheck && pnpm test` and fix every failure before moving on.
3. Never hard-code secrets. Every key goes in `.env` (git-ignored) with a placeholder in `.env.example`.
4. Never log decrypted personal data, passwords, tokens, TOTP secrets or recovery codes.
5. Every user-facing string goes through i18n. A literal string in a JSX component counts as a bug.
6. API errors return `{ error: { code: "SLOT_ALREADY_BOOKED", ... } }`. The **client** translates the code. The API never returns prose.
7. Validate every API input with the shared Zod schemas from `packages/shared`.
8. Run `git init` at the start. Commit at the end of each phase with the message `phase N: <summary>`.
9. Model routing: use **Sonnet** for phases 2, 3, 4 and 6 (crypto, auth, booking concurrency, ICS). **Haiku** is fine for phases 1, 5, 7, 8 and 9.

---

## 1. Tech stack (fixed — do not substitute)
| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, TypeScript strict everywhere, Node 22 LTS |
| API | Fastify 5, Prisma ORM, PostgreSQL 16 |
| Web | Next.js 15 (App Router), Tailwind CSS, shadcn/ui, TanStack Query |
| Calendar UI | FullCalendar (`@fullcalendar/react`, daygrid, timegrid, list, locales pt-br) |
| i18n | `next-intl` (web), shared JSON message catalogs in `packages/shared/i18n` |
| Validation | Zod (shared between API and clients) |
| Password hashing | `argon2` (argon2id, memoryCost 19456 KiB, timeCost 2, parallelism 1) |
| Field encryption | Node `crypto` AES-256-GCM (no third-party crypto libraries) |
| 2FA | `otplib` (TOTP, 30 s, 6 digits), `qrcode` for the QR image |
| ICS | `ics` npm package |
| Email (dev) | `nodemailer` → Mailpit (docker) |
| Tests | Vitest (unit/integration), Supertest-style `fastify.inject`, Playwright (E2E) |
| Mobile (last phase) | Expo (React Native), `expo-secure-store`, `i18next` |
| Infra (dev) | `docker-compose.yml`: postgres, mailpit |

### Repository layout
```
/apps/api        Fastify server (src/modules/<feature>/{routes,service,schema}.ts)
/apps/web        Next.js app (app/[locale]/...)
/apps/mobile     Expo app (phase 9)
/packages/shared zod schemas, TS types, error codes, i18n/{pt-BR,en}.json
/packages/config eslint, tsconfig, prettier presets
docker-compose.yml  .env.example  README.md
```

---

## 2. Data model (Prisma) — `apps/api/prisma/schema.prisma`
Translatable catalog names use `namePt` / `nameEn` columns. Fields marked 🔒 are stored **encrypted** (`Bytes`). Fields marked 🔎 are **blind indexes** (HMAC-SHA256, hex, unique) used for lookups.

- **User**: id (cuid), emailEnc 🔒, emailHash 🔎 unique, passwordHash, locale (`pt-BR`|`en`), role (`PATIENT`|`ADMIN`), emailVerifiedAt, totpSecretEnc 🔒 nullable, totpEnabledAt nullable, failedLoginCount, lockedUntil, createdAt, updatedAt, deletedAt.
- **PatientProfile** (1:1 User): fullNameEnc 🔒, cpfEnc 🔒, cpfHash 🔎 unique nullable, birthDateEnc 🔒, phoneEnc 🔒, healthInsuranceEnc 🔒 nullable, consentLgpdAt, consentVersion.
- **Session**: id, userId, tokenHash (SHA-256 of an opaque 32-byte token), userAgent, ipHash, createdAt, lastUsedAt, expiresAt, revokedAt, mfaPassed (bool).
- **RecoveryCode**: id, userId, codeHash (argon2), usedAt.
- **EmailToken**: id, userId, purpose (`VERIFY`|`RESET`), tokenHash, expiresAt, usedAt.
- **Specialty** (doctor kinds: Cardiologia, Dermatologia, Clínico Geral, Ginecologia, Ortopedia, Pediatria, Oftalmologia, Psiquiatria, …): id, slug, namePt, nameEn.
- **ExamType** (Hemograma, Raio-X, Ultrassom, Ressonância, Eletrocardiograma, Tomografia, …): id, slug, namePt, nameEn, preparationPt, preparationEn, durationMin.
- **Clinic**: id, name, address, city, state, phone, timezone (default `America/Sao_Paulo`), lat, lng.
- **Provider** (doctor or exam lab resource): id, clinicId, name, crm nullable, kind (`DOCTOR`|`EXAM_RESOURCE`), bioPt, bioEn.
- **ProviderSpecialty** (M:N), **ProviderExam** (M:N).
- **Slot**: id, providerId, startsAt (UTC), endsAt (UTC), serviceType (`CONSULTATION`|`EXAM`), specialtyId nullable, examTypeId nullable, status (`OPEN`|`BOOKED`|`BLOCKED`). Index on (providerId, startsAt). Unique on (providerId, startsAt).
- **Appointment**: id, userId, slotId **unique** (stops double booking), status (`SCHEDULED`|`CANCELLED`|`COMPLETED`|`NO_SHOW`), notesEnc 🔒 nullable, icsUid (stable UUID), sequence (int, ICS revision), createdAt, cancelledAt.
- **CalendarFeed**: id, userId unique, tokenHash, createdAt, revokedAt.
- **AuditLog**: id, userId nullable, action (e.g. `LOGIN_OK`, `LOGIN_FAIL`, `MFA_ENABLED`, `APPT_BOOKED`, `PROFILE_READ`), ipHash, createdAt, meta Json (never PII).

---

## 3. Security spec (Phase 2 + 3 — Sonnet)

### 3.1 Field encryption — `apps/api/src/lib/crypto.ts`
- Env `DATA_KEYS` = JSON map `{"1":"<base64 32 bytes>"}` and `DATA_KEY_CURRENT=1` (this allows key rotation).
- `encrypt(plaintext: string): Buffer` → layout `[1 byte version][12 byte random IV][ciphertext][16 byte GCM tag]`. Use the current key.
- `decrypt(buf: Buffer): string` → read the version byte, pick that key, and verify the tag (throw on tamper).
- Pass AAD = `"<model>.<field>"` so a ciphertext can't be swapped between columns. Signature: `encrypt(value, aad)`.
- `blindIndex(value, purpose)` = HMAC-SHA256 with a **separate** key `BLIND_INDEX_KEY`, applied to the normalized value (email lowercased and trimmed; CPF digits only).
- Prisma integration: write explicit mappers `toDbUser()` / `fromDbUser()` in each service. No Prisma middleware magic, so the crypto stays visible and testable.
- Script `pnpm --filter api keys:generate` prints new random keys.
- Unit tests: round trip; tampered byte → throws; wrong AAD → throws; old key version still decrypts after rotation; blind index is deterministic and differs per purpose.

### 3.2 Authentication
- **Register** `POST /auth/register` {email, password, fullName, cpf?, birthDate, phone, locale, consentLgpd:true}.
  - Password policy: ≥ 10 chars, checked against a bundled top-10k common-password list. Validate CPF check digits when given.
  - Return the same generic response whether or not the email exists (no account enumeration). Send the verification email.
- **Login** `POST /auth/login` {email, password} → look up by emailHash and verify with argon2.
  - If the email is unknown, still run a dummy argon2 verify (constant time).
  - After 5 failures, lock for 15 min (`lockedUntil`). Also add a per-IP rate limit with `@fastify/rate-limit` (10/min on auth routes).
  - If TOTP is enabled: create the session with `mfaPassed=false` and respond `{ mfaRequired: true }`.
- **MFA** `POST /auth/mfa/verify` {code | recoveryCode} → sets `mfaPassed=true`. Allow ±1 window. Store the last used time-step so a code can't be replayed. A recovery code is single-use.
- **MFA setup** `POST /auth/mfa/setup` → generate the secret, store it encrypted (not yet enabled), and return an otpauth URI plus a QR data-URL. `POST /auth/mfa/enable` {code} → enable and return 10 recovery codes (shown once, stored as argon2 hashes). `POST /auth/mfa/disable` {password, code}.
- **Sessions**: opaque 32-byte random token; only the SHA-256 is stored. Lifetime 30 days sliding, 12 h idle for web.
  - Web gets it as cookie `sid`: `HttpOnly; Secure; SameSite=Lax; Path=/`. Mobile sends it as `Authorization: Bearer <token>`.
  - `POST /auth/logout`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`.
- **CSRF** for cookie requests: double-submit token (`@fastify/csrf-protection`) on every state-changing route. Bearer requests are exempt.
- **Password reset**: `POST /auth/forgot` (generic response) → emailed token (1 h, single use, hashed) → `POST /auth/reset` revokes all sessions.
- Auth guard `requireAuth({ mfa: true })` rejects sessions where `mfaPassed=false`. `requireRole('ADMIN')` protects admin routes.

### 3.3 Hardening
- `@fastify/helmet` (strict CSP on web via Next headers), CORS allowlist from env, body size limit of 100 KB.
- Every query is scoped by `userId` from the session. Never trust an id from the client without an ownership check. Write tests that try to access another user's appointment and expect 404.
- LGPD:
  - `GET /me/export` returns all of the user's data as JSON (decrypted).
  - `DELETE /me` soft-deletes, wipes the encrypted fields, revokes sessions, and cancels future appointments.
- Audit-log the auth events and every profile read.

---

## 4. API endpoints (Phase 4 — Sonnet)
All endpoints are under `/api/v1`. Responses are JSON and list endpoints are paginated with a cursor.

**Catalog (public)**

| Method | Route | Notes |
|---|---|---|
| GET | `/catalog/specialties` | |
| GET | `/catalog/exams` | |
| GET | `/catalog/clinics?city=` | |
| GET | `/catalog/providers?specialtyId=&examTypeId=&clinicId=` | |
| GET | `/slots?serviceType=&specialtyId=&examTypeId=&clinicId=&providerId=&from=&to=` | Only `OPEN` slots in the future. `to - from` ≤ 31 days. |

**Appointments (auth + MFA)**

| Method | Route | Notes |
|---|---|---|
| POST | `/appointments` | {slotId, notes?} — see transaction rules below |
| GET | `/appointments?from=&to=&status=` | Feeds the calendar view |
| GET | `/appointments/:id` | |
| PATCH | `/appointments/:id/reschedule` | {newSlotId} — atomic; frees the old slot; `sequence++` |
| POST | `/appointments/:id/cancel` | Allowed until 2 h before start; frees the slot; `sequence++` |
| GET | `/appointments/:id/ics` | Single-event `.ics` download |

`POST /appointments` runs in **one transaction**:
1. `UPDATE Slot SET status='BOOKED' WHERE id=? AND status='OPEN' AND startsAt > now()`.
2. If 0 rows were updated → `409 SLOT_ALREADY_BOOKED`.
3. Insert the Appointment. The unique `slotId` is the backstop.
4. Block the booking if the user already has an appointment overlapping the same time → `409 USER_TIME_CONFLICT`.

**Calendar feed**

| Method | Route | Notes |
|---|---|---|
| POST | `/calendar/feed` | Create or rotate the token; returns the subscription URL |
| DELETE | `/calendar/feed` | Revoke |
| GET | `/calendar/feed/:token.ics` | **Public, token-authenticated.** All SCHEDULED appointments from −30 days to +365 days. `Cache-Control: private, max-age=900` |

**Profile**

| Method | Route |
|---|---|
| GET | `/me` |
| PATCH | `/me` |
| PATCH | `/me/locale` |
| GET | `/me/export` |
| DELETE | `/me` |

**Admin** (`ADMIN` role + MFA required)
- CRUD for specialties, exams, clinics and providers.
- `POST /admin/slots/generate` {providerId, weekdays[], startTime, endTime, durationMin, from, to, serviceType, specialtyId|examTypeId} — skips existing slots.
- `PATCH /admin/slots/:id` to block or unblock a slot.

Integration tests are mandatory:
- 20 parallel booking requests for one slot → exactly 1 succeeds and 19 get 409.
- Cancel frees the slot.
- Reschedule is atomic.
- A user cannot read another user's appointment.

---

## 5. Seed data (Phase 5 — Haiku)
`apps/api/prisma/seed.ts`:
- 12 specialties and 10 exam types, each with pt-BR + en names and exam preparation text.
- 4 clinics in São Paulo, Rio de Janeiro and Belo Horizonte.
- 15 doctors and 5 exam resources.
- Slots generated Mon–Fri 08:00–18:00 for the next 60 days: 30 min for consultations, the exam type's `durationMin` for exams.
- One admin user (`admin@medagenda.local`, password from `SEED_ADMIN_PASSWORD` env) and one demo patient.
- The seed is idempotent (upserts by slug).

---

## 6. ICS / Google Calendar (Phase 6 — Sonnet)
`apps/api/src/modules/calendar/ics.ts`, built with the `ics` package:
- Event fields:
  - UID = `<icsUid>@medagenda`, and SEQUENCE = `appointment.sequence`.
  - DTSTART/DTEND in UTC.
  - SUMMARY in the user's locale, e.g. `Consulta – Cardiologia (Dr. Fulano)` / `Appointment – Cardiology (Dr. Fulano)`.
  - LOCATION = clinic name + address. DESCRIPTION = exam preparation instructions + clinic phone.
  - **No CPF, no notes, no health-insurance data in the ICS.** The calendar feed leaves our encryption boundary.
- Add `VALARM` reminders at 24 h and 2 h before.
- Cancelled appointments in the feed are emitted with `STATUS:CANCELLED` and a bumped SEQUENCE, so Google removes or updates them.
- Headers: `Content-Type: text/calendar; charset=utf-8`; `Content-Disposition: attachment; filename="consulta-<date>.ics"` for single events.
- Web UI gives the user three options:
  1. **Download .ics** for a single appointment.
  2. **Subscribe in Google Calendar**: a button that opens `https://calendar.google.com/calendar/r?cid=<webcal-url-encoded feed URL>`, plus a copyable URL and step-by-step instructions (Google → Other calendars → From URL).
  3. **Add this event** quick link: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=..&dates=..&location=..&details=..`.
- Tests:
  - Snapshot an ICS output.
  - Validate that the output parses with `node-ical`.
  - Check that the feed with a revoked or invalid token returns 404.

---

## 7. Web app (Phase 7 — Haiku, Sonnet for auth screens if Haiku struggles)
Routes live under `app/[locale]/`, with locales `pt-BR` (default) and `en`. Middleware detects the locale from cookie → Accept-Language. A language switcher in the header persists the choice to the cookie and to `PATCH /me/locale`.

**Public pages**
- `/` landing page
- `/login` — includes a MFA step screen
- `/register` — multi-step: account → personal data → LGPD consent
- `/forgot`, `/reset`, `/verify-email`

**App pages (auth required)**
- `/app` dashboard: next appointments, quick "Book" buttons.
- `/app/book` booking wizard:
  1. Choose **Consultation** or **Exam**.
  2. Choose a specialty or exam type (searchable grid with icons).
  3. Optional city/clinic filter.
  4. Pick a provider or "any available".
  5. Week view of open slots (grouped by day).
  6. Confirm, showing exam preparation text and an optional notes field.
  7. Success screen with ICS / Google buttons.
- `/app/calendar`: FullCalendar with month, week and list views.
  - Colour by type: consultation vs exam. Status badges.
  - Clicking an event opens a drawer with details, cancel, reschedule, `.ics` and Google links.
  - Uses the FullCalendar locale matching the current language.
- `/app/appointments`: list with filters (upcoming / past / cancelled).
- `/app/settings`:
  - profile editing
  - language
  - 2FA setup (QR + code + recovery codes shown once with a "I saved them" checkbox)
  - active sessions with revoke
  - calendar feed subscription
  - export data, delete account
- `/admin/*`: catalog CRUD tables and the slot generator form.

**UX requirements**
- Mobile-first responsive layout, WCAG AA contrast, keyboard navigable.
- Dates and times are shown in the clinic timezone via `Intl.DateTimeFormat` with the active locale (pt-BR → `16/11/2026 14:30`).
- Errors are mapped from API codes → `errors.<CODE>` i18n keys.

---

## 8. i18n (Phase 8 — Haiku)
- Catalogs live in `packages/shared/i18n/pt-BR.json` and `en.json`, namespaced: `common`, `auth`, `booking`, `calendar`, `settings`, `errors`, `admin`, `ics`.
- Add a CI script `pnpm i18n:check`. It fails if the key sets differ between the two locales or if any key is unused.
- Catalog entities render `namePt` / `nameEn` based on the locale.
- Emails (verify, reset, booking confirmation) are templated in both languages and use the user's stored `locale`.

---

## 9. Mobile app (Phase 9 — Haiku, optional, after web is done)
`apps/mobile` uses Expo Router and reuses the `packages/shared` schemas, types and i18n JSON via `i18next`.
- Screens: login (+MFA), register, dashboard, booking wizard, calendar (`react-native-calendars`), appointment detail, settings.
- Auth uses a bearer token stored in `expo-secure-store` (never AsyncStorage).
- To add an appointment to the calendar, use `expo-calendar` to write directly to the device calendar, and offer the feed URL as well.

---

## 10. Phase checklist with acceptance criteria
| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold monorepo, docker-compose, lint/tsconfig, empty Fastify + Next apps, `.env.example` | `docker compose up -d && pnpm dev` serves the API `/health` and the web home page |
| 2 | Prisma schema + migrations + `crypto.ts` + tests | crypto unit tests pass; `prisma migrate dev` clean |
| 3 | Auth: register/verify/login/lockout/sessions/CSRF/reset/TOTP/recovery codes | integration tests for every flow, including MFA replay rejection and lockout |
| 4 | Catalog, slots, appointments, admin routes | concurrency test (20 parallel → 1 success); ownership tests |
| 5 | Seed | `pnpm db:seed` twice without errors; slots visible via API |
| 6 | ICS single + feed + Google links | `node-ical` parses the output; cancelled event has STATUS:CANCELLED |
| 7 | Web UI | Playwright E2E: register → enable 2FA → log in with TOTP → book exam → see in calendar → download .ics → cancel |
| 8 | i18n completeness | `pnpm i18n:check` passes; E2E run once in `en` and once in `pt-BR` |
| 9 | Mobile (optional) | Expo app logs in against the local API and books an appointment |

---

## 11. Verification (end-to-end)
1. `cp .env.example .env && pnpm keys:generate` (paste the keys into `.env`), `docker compose up -d`, `pnpm install`, `pnpm db:migrate && pnpm db:seed`, `pnpm dev`.
2. Run `pnpm test` (unit + integration) and `pnpm e2e` (Playwright).
3. Manual check:
   - Register at `http://localhost:3000/pt-BR/register` and verify the email via Mailpit (`http://localhost:8025`).
   - Enable 2FA with an authenticator app.
   - Book one consultation and one exam, then confirm both show up in the calendar view.
   - Switch to English and confirm all text changes.
4. Check the data at rest: `psql` → `SELECT "cpfEnc","phoneEnc" FROM "PatientProfile"` must show binary ciphertext, never plaintext.
5. Google Calendar:
   - Import a downloaded `.ics` and confirm it appears correctly.
   - Subscribe to the feed URL. This needs a public URL: use a tunnel such as `cloudflared` in dev.
   - Cancel the appointment and confirm Google updates it after a refresh.
6. Security checks:
   - Six wrong passwords lock the account.
   - Reusing a TOTP code fails.
   - Accessing another user's `/appointments/:id` returns 404.
   - The feed with a revoked token returns 404.
