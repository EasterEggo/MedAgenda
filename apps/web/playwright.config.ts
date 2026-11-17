import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against its own API (:3101) and web build (:3100) so it never collides with `pnpm dev`.
 * It still needs docker Postgres + Mailpit (`docker compose up -d`) and a seeded DB (`pnpm db:seed`).
 * Choose the UI language with E2E_LOCALE=pt-BR (default) or E2E_LOCALE=en.
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const webUrl = `http://localhost:${WEB_PORT}`;
const apiUrl = `http://localhost:${API_PORT}`;
const locale = process.env.E2E_LOCALE === "en" ? "en" : "pt-BR";
const distDir = process.env.NEXT_DIST_DIR ?? ".next-e2e";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: webUrl,
    locale,
    acceptDownloads: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: locale, use: { ...devices["Desktop Chrome"], locale } }],
  webServer: [
    {
      // Raised auth rate limit: a full run signs in several times from one IP.
      command:
        "pnpm --filter @medagenda/api exec tsx --env-file-if-exists=../../.env src/server.ts",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        API_PORT: String(API_PORT),
        WEB_URL: webUrl,
        CORS_ORIGINS: webUrl,
        PUBLIC_API_URL: apiUrl,
        AUTH_RATE_LIMIT_MAX: process.env.AUTH_RATE_LIMIT_MAX ?? "1000",
      },
    },
    {
      // `pnpm e2e` builds first (NEXT_PUBLIC_API_URL is baked in at build time).
      command: `next start -p ${WEB_PORT}`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { NEXT_PUBLIC_API_URL: apiUrl, NEXT_DIST_DIR: distDir },
    },
  ],
});
