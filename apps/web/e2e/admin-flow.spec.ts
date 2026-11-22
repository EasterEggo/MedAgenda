import { expect, test, type Page } from "@playwright/test";
import {
  LOCALE,
  login,
  newUser,
  promoteLatestUserToAdmin,
  register,
  t,
  verifyEmail,
} from "./support";

test.describe.configure({ mode: "serial" });

const user = newUser();
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await page.context().close();
});

test("a patient sees the translated forbidden state on /admin", async () => {
  await register(page, user);
  await verifyEmail(page, user);
  await login(page, user);
  await page.goto(`/${LOCALE}/admin/specialties`);
  const forbidden = page.getByTestId("admin-forbidden");
  await expect(forbidden.getByText(t("admin.forbidden.adminOnly"))).toBeVisible();
});

test("a promoted admin can open the admin area", async () => {
  promoteLatestUserToAdmin();
  await page.goto(`/${LOCALE}/admin/specialties`);
  await expect(page.getByTestId("admin-forbidden")).toHaveCount(0);
});

test("an admin manages specialties", async () => {
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.goto(`/${LOCALE}/admin/specialties`);
  await page.getByRole("button", { name: t("admin.new"), exact: true }).click();
  const form = page.getByTestId("entity-form");

  // Shared-schema validation shows translated messages before anything is sent.
  await form.getByRole("button", { name: t("common.actions.save") }).click();
  await expect(form.getByText(t("auth.validation.required")).first()).toBeVisible();

  await form.getByLabel(t("admin.fields.slug")).fill(slug);
  await form.getByLabel(t("admin.fields.namePt")).fill("Especialidade E2E");
  await form.getByLabel(t("admin.fields.nameEn")).fill("E2E specialty");
  await form.getByRole("button", { name: t("common.actions.save") }).click();
  const row = page.getByTestId("admin-row").filter({ hasText: slug });
  await expect(row).toBeVisible();

  // A duplicate slug maps to the translated CONFLICT message.
  await page.getByRole("button", { name: t("admin.new"), exact: true }).click();
  const dup = page.getByTestId("entity-form");
  await dup.getByLabel(t("admin.fields.slug")).fill(slug);
  await dup.getByLabel(t("admin.fields.namePt")).fill("Outra");
  await dup.getByLabel(t("admin.fields.nameEn")).fill("Other");
  await dup.getByRole("button", { name: t("common.actions.save") }).click();
  await expect(dup.getByText(t("errors.CONFLICT"))).toBeVisible();
  await dup.getByRole("button", { name: t("common.actions.cancel") }).click();

  await row.getByRole("button", { name: t("admin.edit") }).click();
  await page.getByTestId("entity-form").getByLabel(t("admin.fields.nameEn")).fill("E2E renamed");
  await page
    .getByTestId("entity-form")
    .getByRole("button", { name: t("common.actions.save") })
    .click();
  await expect(page.getByTestId("admin-row").filter({ hasText: "E2E renamed" })).toBeVisible();

  await row.getByRole("button", { name: t("admin.delete") }).click();
  await row.getByRole("button", { name: t("admin.confirmDelete") }).click();
  await expect(page.getByTestId("admin-row").filter({ hasText: slug })).toHaveCount(0);
});

test("an admin generates slots and blocks and unblocks one", async () => {
  const api = `http://localhost:${process.env.E2E_API_PORT ?? 3101}/api/v1`;
  const body = (await (await page.request.get(`${api}/catalog/providers?limit=200`)).json()) as {
    items: { id: string; kind: string; specialtyIds: string[] }[];
  };
  const doctor = body.items.find((p) => p.kind === "DOCTOR" && p.specialtyIds.length > 0)!;

  await page.goto(`/${LOCALE}/admin/slots`);
  const generator = page.getByTestId("slot-generator");
  await generator.getByLabel(t("admin.fields.providerId")).selectOption(doctor.id);
  await generator.getByLabel(t("admin.fields.specialtyId")).selectOption(doctor.specialtyIds[0]!);
  await generator.getByRole("button", { name: t("admin.slots.generate"), exact: true }).click();
  await expect(generator.getByRole("status")).toBeVisible();

  const list = page.getByTestId("slot-list");
  await list.getByLabel(t("admin.fields.providerId")).selectOption(doctor.id);
  const first = list.locator("tbody tr").first();
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: t("admin.slots.block"), exact: true }).click();
  await expect(first.getByText(t("admin.slots.statuses.BLOCKED"))).toBeVisible();
  await first.getByRole("button", { name: t("admin.slots.unblock") }).click();
  await expect(first.getByText(t("admin.slots.statuses.OPEN"))).toBeVisible();
});
