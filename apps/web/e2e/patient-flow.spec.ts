import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { LOCALE, login, newUser, register, rx, t, verifyEmail } from "./support";

// One user walks the whole journey; the tests run in order and share state.
test.describe.configure({ mode: "serial" });

const user = newUser();
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
});
test.afterAll(async () => {
  await page.context().close();
});

test("registers and verifies the email through Mailpit", async () => {
  await register(page, user);
  await verifyEmail(page, user);
});

test("logs in", async () => {
  await login(page, user);
});

test("books an exam, sees it in the calendar, downloads the .ics and cancels", async () => {
  await page.goto(`/${LOCALE}/app/book`);
  await page
    .getByRole("button", { name: rx(t("booking.type.exam")), pressed: false })
    .first()
    .click();
  const next = page.getByRole("button", { name: t("common.actions.next"), exact: true });
  await next.click();
  await page
    .getByRole("group", { name: t("booking.steps.catalog") })
    .getByRole("button")
    .first()
    .click();
  await next.click();
  await next.click(); // optional location step
  await page.getByRole("radio", { name: rx(t("booking.provider.any")) }).check();
  await next.click();
  await page
    .locator("section[aria-labelledby='slot-picker-heading'] button[aria-pressed]")
    .first()
    .click();
  await next.click();
  await page.getByRole("button", { name: t("booking.confirm.submit"), exact: true }).click();
  await expect(page.getByRole("heading", { name: t("booking.success.title") })).toBeVisible();

  // Calendar: the appointment may fall in next month, so page forward until it shows.
  const loaded = () => page.waitForResponse((r) => /\/appointments\?/.test(r.url()));
  let pending = loaded();
  await page.goto(`/${LOCALE}/app/calendar`);
  await pending;
  const event = page.locator("[data-appointment-id]").first();
  for (let i = 0; i < 3 && (await event.count()) === 0; i++) {
    pending = loaded();
    await page.locator(".fc-next-button").click();
    await pending;
  }
  await expect(event).toBeVisible();
  await event.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await drawer.getByRole("button", { name: t("calendar.links.download") }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const path = await download.path();
  const ics = readFileSync(path, "utf8");
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toMatch(/@medagenda/);

  await drawer.getByRole("button", { name: t("calendar.actions.cancel"), exact: true }).click();
  await drawer.getByRole("button", { name: t("calendar.actions.confirmCancel") }).click();
  await expect(drawer.getByText(t("calendar.actions.cancelled"))).toBeVisible();
});

test("settings: profile, language, sessions, calendar feed and export", async () => {
  await page.goto(`/${LOCALE}/app/settings`);
  const profile = page.getByTestId("settings-profile");
  await profile.getByLabel(t("settings.profile.fullName")).fill("Ana E2E Souza");
  await profile.getByRole("button", { name: t("common.actions.save") }).click();
  await expect(profile.getByText(t("settings.profile.saved"))).toBeVisible();

  await expect(
    page.getByTestId("settings-sessions").getByText(t("settings.sessions.current")),
  ).toBeVisible();

  const feed = page.getByTestId("settings-feed");
  await feed.getByRole("button", { name: t("settings.feed.create") }).click();
  const url = await feed.getByLabel(t("settings.feed.urlLabel")).inputValue();
  expect(url).toMatch(/\/calendar\/feed\/[\w-]+\.ics$/);
  await expect(
    feed.getByRole("link", { name: rx(t("settings.feed.subscribeGoogle")) }),
  ).toHaveAttribute("href", /calendar\.google\.com\/calendar\/r\?cid=/);
  const feedResponse = await page.request.get(url);
  expect(feedResponse.status()).toBe(200);
  await feed.getByRole("button", { name: t("settings.feed.revoke") }).click();
  await expect(feed.getByText(t("settings.feed.revoked"))).toBeVisible();
  expect((await page.request.get(url)).status()).toBe(404);

  const exportPromise = page.waitForEvent("download");
  await page
    .getByTestId("settings-data")
    .getByRole("button", { name: t("settings.data.export") })
    .click();
  const exported = JSON.parse(readFileSync((await (await exportPromise).path()) as string, "utf8"));
  expect(exported.account.email).toBe(user.email);
});

test("deletes the account with password confirmation", async () => {
  await page.goto(`/${LOCALE}/app/settings`);
  const data = page.getByTestId("settings-data");
  await data.getByRole("button", { name: t("settings.data.delete"), exact: true }).click();
  await data.getByLabel(t("settings.data.deletePassword")).fill(user.password);
  await data.getByRole("button", { name: t("settings.data.deleteConfirm") }).click();
  await expect(page).toHaveURL(new RegExp(`/${LOCALE}/?$`));
  await page.goto(`/${LOCALE}/app`);
  await expect(page).toHaveURL(/\/login/);
});
