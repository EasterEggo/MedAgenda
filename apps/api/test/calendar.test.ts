import ical from "node-ical";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildIcs, type IcsAppointment } from "../src/modules/calendar/ics.js";
import { bearerUser, makeFixtures } from "./booking-helpers.js";
import { createTestEnv, errorCode, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({ PUBLIC_API_URL: "https://api.example.test/" });
});
afterAll(async () => {
  await env.close();
});

const sample: IcsAppointment = {
  icsUid: "11111111-2222-3333-4444-555555555555",
  sequence: 0,
  status: "SCHEDULED",
  startsAt: new Date("2030-03-04T17:30:00Z"),
  endsAt: new Date("2030-03-04T18:00:00Z"),
  serviceType: "EXAM",
  specialty: null,
  examType: {
    namePt: "Hemograma",
    nameEn: "Blood count",
    preparationPt: "Jejum de 8 horas.",
    preparationEn: "Fast for 8 hours.",
  },
  providerName: "Lab Central",
  clinic: {
    name: "Clínica Vida",
    address: "Rua A, 100, São Paulo",
    phone: "11 5555-0000",
    timezone: "America/Sao_Paulo",
  },
};

const stripStamp = (s: string) => s.replace(/DTSTAMP:\S+/g, "DTSTAMP:<now>");

describe("ics builder", () => {
  it("matches the snapshot (pt-BR and en)", () => {
    expect(stripStamp(buildIcs([sample], "pt-BR"))).toMatchSnapshot("pt-BR");
    expect(stripStamp(buildIcs([sample], "en"))).toMatchSnapshot("en");
  });

  it("parses with node-ical and carries the expected fields", () => {
    const parsed = ical.sync.parseICS(buildIcs([sample], "en"));
    const ev = Object.values(parsed).find((e) => e?.type === "VEVENT");
    if (!ev || ev.type !== "VEVENT") throw new Error("no event");
    expect(ev.uid).toBe("11111111-2222-3333-4444-555555555555@medagenda");
    expect(ev.start.toISOString()).toBe("2030-03-04T17:30:00.000Z");
    expect(ev.end!.toISOString()).toBe("2030-03-04T18:00:00.000Z");
    expect(ev.summary).toBe("Exam – Blood count (Lab Central)");
    expect(ev.location).toBe("Clínica Vida, Rua A, 100, São Paulo");
    expect(ev.description).toContain("Fast for 8 hours.");
    expect(ev.description).toContain("11 5555-0000");
  });

  it("has VALARMs at 24h and 2h and UTC times", () => {
    const out = buildIcs([sample], "en");
    expect(out).toContain("DTSTART:20300304T173000Z");
    expect(out).toContain("TRIGGER:-PT24H");
    expect(out).toContain("TRIGGER:-PT2H");
    expect(out.match(/BEGIN:VALARM/g)).toHaveLength(2);
  });

  it("emits STATUS:CANCELLED with the sequence", () => {
    const out = buildIcs([{ ...sample, status: "CANCELLED", sequence: 3 }], "pt-BR");
    expect(out).toContain("STATUS:CANCELLED");
    expect(out).toContain("SEQUENCE:3");
  });
});

async function book(client: Awaited<ReturnType<typeof bearerUser>>["client"], slotId: string) {
  const res = await client.post("/appointments", { slotId, notes: "TOP-SECRET-NOTE" });
  expect(res.statusCode).toBe(201);
  return res.json().id as string;
}

describe("single ics endpoint", () => {
  it("returns the owner's ICS with headers, and no PII or notes", async () => {
    const fx = await makeFixtures(env);
    const { client } = await bearerUser(env);
    const id = await book(client, (await fx.slot(48)).id);
    const res = await client.get(`/appointments/${id}/ics`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="consulta-\d{4}-\d{2}-\d{2}\.ics"$/,
    );
    expect(res.body).toContain("@medagenda");
    expect(res.body).not.toContain("TOP-SECRET-NOTE");
    expect(res.body).not.toMatch(/cpf|insurance|convênio/i);
    expect(ical.sync.parseICS(res.body)).toBeTruthy();
  });

  it("404 for another user's appointment and for unauthenticated 401", async () => {
    const fx = await makeFixtures(env);
    const owner = await bearerUser(env);
    const other = await bearerUser(env);
    const id = await book(owner.client, (await fx.slot(48)).id);
    const res = await other.client.get(`/appointments/${id}/ics`);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe("NOT_FOUND");
    const anon = await env.app.inject({ method: "GET", url: `/api/v1/appointments/${id}/ics` });
    expect(anon.statusCode).toBe(401);
  });

  it("emits a cancelled appointment as STATUS:CANCELLED with a bumped sequence", async () => {
    const fx = await makeFixtures(env);
    const { client } = await bearerUser(env);
    const id = await book(client, (await fx.slot(48)).id);
    expect((await client.post(`/appointments/${id}/cancel`)).statusCode).toBe(200);
    const res = await client.get(`/appointments/${id}/ics`);
    expect(res.body).toContain("STATUS:CANCELLED");
    expect(res.body).toContain("SEQUENCE:1");
  });
});

describe("calendar feed", () => {
  const feedPath = (url: string) => new URL(url).pathname;

  it("creates a feed, serves it publicly, rotates and revokes", async () => {
    const fx = await makeFixtures(env);
    const { client, user } = await bearerUser(env);
    await book(client, (await fx.slot(48)).id);
    const cancelled = await book(client, (await fx.slot(72)).id);
    await client.post(`/appointments/${cancelled}/cancel`);
    // Outside the window: far future.
    await book(client, (await fx.slot(24 * 400)).id);

    const created = await client.post("/calendar/feed");
    expect(created.statusCode).toBe(201);
    const url: string = created.json().url;
    expect(url).toMatch(/^https:\/\/api\.example\.test\/api\/v1\/calendar\/feed\/[\w-]+\.ics$/);

    // Only the hash is stored.
    const token = url
      .split("/")
      .pop()!
      .replace(/\.ics$/, "");
    const row = await env.prisma.calendarFeed.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);

    // Public: no auth.
    const feed = await env.app.inject({ method: "GET", url: feedPath(url) });
    expect(feed.statusCode).toBe(200);
    expect(feed.headers["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(feed.headers["cache-control"]).toBe("private, max-age=900");
    expect(feed.body.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(feed.body).toContain("STATUS:CANCELLED");
    expect(feed.body).toContain("STATUS:CONFIRMED");
    expect(feed.body).not.toContain("TOP-SECRET-NOTE");
    expect(feed.body).not.toMatch(/cpf|insurance/i);
    const events = Object.values(ical.sync.parseICS(feed.body)).filter((e) => e?.type === "VEVENT");
    expect(events).toHaveLength(2);

    // Rotate: old URL dies, new one works.
    const rotated = await client.post("/calendar/feed");
    const url2: string = rotated.json().url;
    expect(url2).not.toBe(url);
    expect((await env.app.inject({ method: "GET", url: feedPath(url) })).statusCode).toBe(404);
    expect((await env.app.inject({ method: "GET", url: feedPath(url2) })).statusCode).toBe(200);

    // Revoke.
    expect((await client.delete("/calendar/feed")).statusCode).toBe(204);
    expect((await env.app.inject({ method: "GET", url: feedPath(url2) })).statusCode).toBe(404);

    const actions = (
      await env.prisma.auditLog.findMany({ where: { userId: user.id }, select: { action: true } })
    ).map((a) => a.action);
    expect(actions.filter((a) => a === "CALENDAR_FEED_CREATED")).toHaveLength(2);
    expect(actions).toContain("CALENDAR_FEED_REVOKED");
  });

  it("returns 404 for invalid or malformed tokens", async () => {
    for (const p of [
      "/api/v1/calendar/feed/nonexistent-token-nonexistent-token.ics",
      "/api/v1/calendar/feed/short.ics",
      "/api/v1/calendar/feed/nonexistent-token-nonexistent-token",
    ]) {
      const res = await env.app.inject({ method: "GET", url: p });
      expect(res.statusCode).toBe(404);
    }
  });

  it("requires auth to create or revoke", async () => {
    expect(
      (await env.app.inject({ method: "POST", url: "/api/v1/calendar/feed" })).statusCode,
    ).toBe(401);
    expect(
      (await env.app.inject({ method: "DELETE", url: "/api/v1/calendar/feed" })).statusCode,
    ).toBe(401);
  });

  it("never logs the feed token", async () => {
    const lines: string[] = [];
    const logEnv = await createTestEnv({}, undefined, { write: (l) => lines.push(l) });
    try {
      const { client } = await bearerUser(logEnv);
      const url: string = (await client.post("/calendar/feed")).json().url;
      const token = url
        .split("/")
        .pop()!
        .replace(/\.ics$/, "");
      await logEnv.app.inject({ method: "GET", url: new URL(url).pathname });
      expect(lines.join("")).not.toContain(token);
    } finally {
      await logEnv.close();
    }
  });
});
