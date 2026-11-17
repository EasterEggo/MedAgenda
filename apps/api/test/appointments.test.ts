import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearerUser, makeFixtures } from "./booking-helpers.js";
import { createTestEnv, errorCode, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("booking", () => {
  it("20 parallel requests for one slot: exactly 1 success, 19 x 409", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(48);
    const users = await Promise.all(Array.from({ length: 20 }, () => bearerUser(env)));
    const results = await Promise.all(
      users.map((u) => u.client.post("/appointments", { slotId: slot.id })),
    );
    const ok = results.filter((r) => r.statusCode === 201);
    const conflicts = results.filter((r) => r.statusCode === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    expect(conflicts.every((r) => errorCode(r) === "SLOT_ALREADY_BOOKED")).toBe(true);
    expect(await env.prisma.appointment.count({ where: { slotId: slot.id } })).toBe(1);
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe(
      "BOOKED",
    );
  });

  it("20 parallel requests from the same user also yield one booking", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(50);
    const { client } = await bearerUser(env);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => client.post("/appointments", { slotId: slot.id })),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(19);
  });

  it("encrypts notes at rest, returns them to the owner and audits the booking", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(60);
    const { client, user } = await bearerUser(env);
    const res = await client.post("/appointments", { slotId: slot.id, notes: "secret note" });
    expect(res.statusCode).toBe(201);
    expect(res.json().notes).toBe("secret note");
    const row = await env.prisma.appointment.findUniqueOrThrow({ where: { id: res.json().id } });
    expect(Buffer.from(row.notesEnc!).includes("secret note")).toBe(false);
    expect((await client.get(`/appointments/${row.id}`)).json().notes).toBe("secret note");
    const logs = await env.prisma.auditLog.findMany({
      where: { userId: user.id, action: "APPT_BOOKED" },
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0]!.meta)).not.toContain("secret");
  });

  it("rejects past, blocked and unknown slots and requires auth", async () => {
    const fx = await makeFixtures(env);
    const past = await fx.slot(-5);
    const blocked = await fx.slot(70, 30, "BLOCKED");
    const { client } = await bearerUser(env);
    expect(errorCode(await client.post("/appointments", { slotId: past.id }))).toBe(
      "SLOT_ALREADY_BOOKED",
    );
    expect((await client.post("/appointments", { slotId: blocked.id })).statusCode).toBe(409);
    expect((await client.post("/appointments", { slotId: "nope" })).statusCode).toBe(404);
    expect((await client.post("/appointments", {})).statusCode).toBe(400);
    const { Client } = await import("./helpers.js");
    expect((await new Client(env).post("/appointments", { slotId: past.id })).statusCode).toBe(401);
  });

  it("blocks overlapping appointments of the same user (USER_TIME_CONFLICT)", async () => {
    const fx = await makeFixtures(env);
    const a = await fx.slot(80);
    const fx2 = await makeFixtures(env);
    const b = await env.prisma.slot.create({
      data: {
        providerId: fx2.provider.id,
        startsAt: new Date(a.startsAt.getTime() + 10 * 60_000),
        endsAt: new Date(a.endsAt.getTime() + 10 * 60_000),
        serviceType: "CONSULTATION",
        specialtyId: fx2.specialty.id,
      },
    });
    const { client } = await bearerUser(env);
    expect((await client.post("/appointments", { slotId: a.id })).statusCode).toBe(201);
    const res = await client.post("/appointments", { slotId: b.id });
    expect([res.statusCode, errorCode(res)]).toEqual([409, "USER_TIME_CONFLICT"]);
    // The failed attempt rolled back: the slot is still open.
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("OPEN");
  });
});

describe("cancel", () => {
  it("frees the slot, bumps sequence, lets someone else book it", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(30);
    const a = await bearerUser(env);
    const b = await bearerUser(env);
    const appt = (await a.client.post("/appointments", { slotId: slot.id })).json();
    const res = await a.client.post(`/appointments/${appt.id}/cancel`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "CANCELLED", sequence: appt.sequence + 1 });
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe(
      "OPEN",
    );
    expect((await b.client.post("/appointments", { slotId: slot.id })).statusCode).toBe(201);
    expect(errorCode(await a.client.post(`/appointments/${appt.id}/cancel`))).toBe(
      "APPOINTMENT_NOT_SCHEDULED",
    );
  });

  it("is refused within 2 hours of the start", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(1);
    const { client } = await bearerUser(env);
    const appt = (await client.post("/appointments", { slotId: slot.id })).json();
    const res = await client.post(`/appointments/${appt.id}/cancel`);
    expect([res.statusCode, errorCode(res)]).toEqual([409, "CANCELLATION_WINDOW_CLOSED"]);
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe(
      "BOOKED",
    );
  });
});

describe("reschedule", () => {
  it("moves atomically: frees old slot, books new one, sequence++", async () => {
    const fx = await makeFixtures(env);
    const s1 = await fx.slot(30);
    const s2 = await fx.slot(40);
    const { client } = await bearerUser(env);
    const appt = (await client.post("/appointments", { slotId: s1.id })).json();
    const res = await client.request("PATCH", `/appointments/${appt.id}/reschedule`, {
      newSlotId: s2.id,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ slotId: s2.id, sequence: appt.sequence + 1 });
    const [o, n] = await Promise.all([
      env.prisma.slot.findUniqueOrThrow({ where: { id: s1.id } }),
      env.prisma.slot.findUniqueOrThrow({ where: { id: s2.id } }),
    ]);
    expect([o.status, n.status]).toEqual(["OPEN", "BOOKED"]);
  });

  it("changes nothing when the target slot is taken", async () => {
    const fx = await makeFixtures(env);
    const s1 = await fx.slot(30);
    const s2 = await fx.slot(40);
    const a = await bearerUser(env);
    const b = await bearerUser(env);
    const appt = (await a.client.post("/appointments", { slotId: s1.id })).json();
    await b.client.post("/appointments", { slotId: s2.id });
    const res = await a.client.request("PATCH", `/appointments/${appt.id}/reschedule`, {
      newSlotId: s2.id,
    });
    expect([res.statusCode, errorCode(res)]).toEqual([409, "SLOT_ALREADY_BOOKED"]);
    const after = await env.prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect([after.slotId, after.sequence]).toEqual([s1.id, appt.sequence]);
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: s1.id } })).status).toBe(
      "BOOKED",
    );
  });
});

describe("ownership and listing", () => {
  it("returns 404 for another user's appointment on every route", async () => {
    const fx = await makeFixtures(env);
    const slot = await fx.slot(30);
    const owner = await bearerUser(env);
    const other = await bearerUser(env);
    const spare = await fx.slot(35);
    const appt = (await owner.client.post("/appointments", { slotId: slot.id })).json();
    expect((await other.client.get(`/appointments/${appt.id}`)).statusCode).toBe(404);
    expect((await other.client.post(`/appointments/${appt.id}/cancel`)).statusCode).toBe(404);
    expect(
      (
        await other.client.request("PATCH", `/appointments/${appt.id}/reschedule`, {
          newSlotId: spare.id,
        })
      ).statusCode,
    ).toBe(404);
    expect((await other.client.get("/appointments")).json().items).toHaveLength(0);
    expect((await owner.client.get(`/appointments/${appt.id}`)).statusCode).toBe(200);
    expect((await env.prisma.slot.findUniqueOrThrow({ where: { id: spare.id } })).status).toBe(
      "OPEN",
    );
  });

  it("lists with status filter and cursor pagination", async () => {
    const fx = await makeFixtures(env);
    const { client } = await bearerUser(env);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await fx.slot(100 + i);
      ids.push((await client.post("/appointments", { slotId: s.id })).json().id);
    }
    await client.post(`/appointments/${ids[2]}/cancel`);
    const p1 = (await client.get("/appointments?limit=2")).json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await client.get(`/appointments?limit=2&cursor=${p1.nextCursor}`)).json();
    expect(p2.items).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    const cancelled = (await client.get("/appointments?status=CANCELLED")).json();
    expect(cancelled.items.map((a: { id: string }) => a.id)).toEqual([ids[2]]);
    expect(p1.items[0]).not.toHaveProperty("notes");
  });
});
