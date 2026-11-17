import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPrisma } from "../src/lib/prisma.js";
import { bearerUser, makeFixtures } from "./booking-helpers.js";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

async function waitFor<T>(read: () => T | undefined, ms = 3000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("timed out waiting for the email");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("booking confirmation email", () => {
  it("is sent in the user's stored locale (pt-BR)", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(72);
    const { client, user, email } = await bearerUser(env);
    await env.prisma.user.update({ where: { id: user.id }, data: { locale: "pt-BR" } });

    const res = await client.post("/appointments", { slotId: slot.id });
    expect(res.statusCode).toBe(201);
    const mail = await waitFor(() => env.mailer.outbox.find((m) => m.to === email));
    expect(mail.subject).toBe("Seu agendamento está confirmado – MedAgenda");
    expect(mail.text).toContain("Cardiologia");
    expect(mail.text).toContain(fx.provider.name);
    expect(mail.text).toContain(`/pt-BR/app/appointments`);
    expect(mail.text).not.toContain(user.id);
  });

  it("is sent in English for an English user", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(96);
    const { client, email } = await bearerUser(env); // bearerUser stores locale "en"

    const res = await client.post("/appointments", { slotId: slot.id });
    expect(res.statusCode).toBe(201);
    const mail = await waitFor(() => env.mailer.outbox.find((m) => m.to === email));
    expect(mail.subject).toBe("Your appointment is confirmed – MedAgenda");
    expect(mail.text).toContain("Cardiology");
  });
});

describe("booking confirmation failure handling", () => {
  it("a mail failure does not fail the booking and the log holds no personal data", async () => {
    const config = loadConfig({ ...process.env });
    const prisma = createPrisma(config.DATABASE_URL);
    const lines: string[] = [];
    const app = await buildApp({
      config,
      prisma,
      mailer: { send: () => Promise.reject(new Error("smtp unreachable")) },
      logStream: { write: (line) => lines.push(line) },
    });
    await app.ready();
    const failing = { ...env, app, prisma, mailer: env.mailer } as unknown as TestEnv;
    try {
      const fx = await makeFixtures(failing);
      const slot = await fx.slot(120);
      const { client, email } = await bearerUser(failing);

      const res = await client.post("/appointments", { slotId: slot.id });
      expect(res.statusCode).toBe(201);

      await waitFor(() =>
        lines.some((l) => l.includes("failed to send booking confirmation")) ? true : undefined,
      );
      const logged = lines.join("\n");
      expect(logged).not.toContain(email);
      expect(logged).not.toContain("smtp unreachable"); // the error message is not logged either
      expect(logged).not.toContain(fx.provider.name);
    } finally {
      await app.close();
      await prisma.$disconnect();
    }
  });
});
