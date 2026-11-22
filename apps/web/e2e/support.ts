import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const LOCALE: "pt-BR" | "en" = process.env.E2E_LOCALE === "en" ? "en" : "pt-BR";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

const catalog = JSON.parse(
  readFileSync(resolve(__dirname, `../../../packages/shared/i18n/${LOCALE}.json`), "utf8"),
) as Record<string, unknown>;

/** Translated UI text for a catalog key, so selectors follow the language under test. */
export function t(key: string, values: Record<string, string | number> = {}): string {
  let node: unknown = catalog;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`Missing i18n key ${key}`);
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

/** Escapes a string for use inside a RegExp. */
export const rx = (text: string, flags = "i") =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

export const PASSWORD = "E2e-correct horse battery 42";

export interface TestUser {
  email: string;
  password: string;
}

export function newUser(): TestUser {
  return {
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: PASSWORD,
  };
}

/** Polls Mailpit for the verification mail sent to `email` and returns its token. */
export async function verificationToken(email: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = (await search.json()) as { messages?: { ID: string }[] };
    const id = messages?.[0]?.ID;
    if (id) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      const match = /verify-email\?token=([\w-]+)/.exec(message.Text);
      if (match?.[1]) return match[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email for ${email} in Mailpit (${MAILPIT})`);
}

/** Fills the 3-step register form. */
export async function register(page: Page, user: TestUser): Promise<void> {
  await page.goto(`/${LOCALE}/register`);
  await page.getByLabel(t("auth.register.email")).fill(user.email);
  await page.getByLabel(t("auth.register.password"), { exact: true }).fill(user.password);
  await page.getByLabel(t("auth.register.confirmPassword")).fill(user.password);
  await page.getByRole("button", { name: t("auth.register.next") }).click();
  await page.getByLabel(t("auth.register.fullName")).fill("Ana E2E Silva");
  await page.getByLabel(t("auth.register.birthDate")).fill("1990-05-01");
  await page.getByLabel(t("auth.register.phone")).fill("+55 11 99999-0000");
  await page.getByRole("button", { name: t("auth.register.next") }).click();
  await page.getByRole("checkbox", { name: t("auth.register.consentLabel") }).click();
  await page.getByRole("button", { name: t("auth.register.submit") }).click();
  await expect(page).toHaveURL(/\/verify-email$/);
}

export async function verifyEmail(page: Page, user: TestUser): Promise<void> {
  const token = await verificationToken(user.email);
  await page.goto(`/${LOCALE}/verify-email?token=${token}`);
  await expect(page.getByText(t("auth.verify.success"))).toBeVisible();
}

/** Signs in with email and password. */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto(`/${LOCALE}/login`);
  await page.getByLabel(t("auth.login.email")).fill(user.email);
  await page.getByLabel(t("auth.login.password")).fill(user.password);
  await page.getByRole("button", { name: t("auth.login.submit") }).click();
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/app$`));
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: t("common.nav.logout") }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Promotes the most recently registered user to ADMIN with psql inside the compose postgres.
 * Only safe because the E2E suite runs single-worker against a dev database.
 * Override the command with E2E_PSQL (it receives the SQL on stdin).
 */
export function promoteLatestUserToAdmin(): void {
  const sql = `UPDATE "User" SET role = 'ADMIN' WHERE id = (SELECT id FROM "User" ORDER BY "createdAt" DESC LIMIT 1);`;
  const user = process.env.POSTGRES_USER ?? "medagenda";
  const db = process.env.POSTGRES_DB ?? "medagenda";
  const command =
    process.env.E2E_PSQL ??
    `docker compose exec -T postgres psql -U ${user} -d ${db} -v ON_ERROR_STOP=1`;
  const [bin, ...args] = command.split(" ");
  const result = spawnSync(bin as string, args, {
    input: sql,
    encoding: "utf8",
    cwd: resolve(__dirname, "../../.."),
  });
  if (result.status !== 0 || !/UPDATE 1/.test(result.stdout)) {
    throw new Error(`Could not promote the user to ADMIN: ${result.stderr || result.stdout}`);
  }
}
