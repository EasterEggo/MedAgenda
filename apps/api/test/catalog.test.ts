import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeFixtures } from "./booking-helpers.js";
import { Client, createTestEnv, errorCode, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("catalog", () => {
  it("serves public lists with filters and cursor pagination", async () => {
    const fx = await makeFixtures(env);
    const c = new Client(env);
    const specs = (await c.get("/catalog/specialties?limit=1")).json();
    expect(specs.items).toHaveLength(1);
    expect(specs.nextCursor).toBeTruthy();
    expect((await c.get("/catalog/exams")).statusCode).toBe(200);
    const clinics = (await c.get(`/catalog/clinics?city=${fx.clinic.city.toLowerCase()}`)).json();
    expect(clinics.items.map((x: { id: string }) => x.id)).toEqual([fx.clinic.id]);
    const provs = (await c.get(`/catalog/providers?specialtyId=${fx.specialty.id}`)).json();
    expect(provs.items).toHaveLength(1);
    expect(provs.items[0].specialtyIds).toEqual([fx.specialty.id]);
    expect((await c.get("/catalog/specialties?limit=0")).statusCode).toBe(400);
  });

  it("slots: only OPEN future slots, filtered, with 31-day range limit", async () => {
    const fx = await makeFixtures(env);
    const open = await fx.slot(24);
    await fx.slot(25, 30, "BLOCKED");
    await fx.slot(-3);
    const booked = await fx.slot(26);
    await env.prisma.slot.update({ where: { id: booked.id }, data: { status: "BOOKED" } });
    const c = new Client(env);
    const res = await c.get(`/slots?providerId=${fx.provider.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((s: { id: string }) => s.id)).toEqual([open.id]);
    expect(res.json().items[0].clinic.id).toBe(fx.clinic.id);

    const now = new Date();
    const iso = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
    const ok = await c.get(
      `/slots?providerId=${fx.provider.id}&from=${encodeURIComponent(iso(0))}&to=${encodeURIComponent(iso(31))}`,
    );
    expect(ok.statusCode).toBe(200);
    const big = await c.get(
      `/slots?from=${encodeURIComponent(iso(0))}&to=${encodeURIComponent(iso(32))}`,
    );
    expect([big.statusCode, errorCode(big)]).toEqual([400, "DATE_RANGE_TOO_LARGE"]);
    const farTo = await c.get(`/slots?to=${encodeURIComponent(iso(40))}`);
    expect(errorCode(farTo)).toBe("DATE_RANGE_TOO_LARGE");
    expect((await c.get("/slots?from=garbage")).statusCode).toBe(400);
    const outside = await c.get(
      `/slots?providerId=${fx.provider.id}&from=${encodeURIComponent(iso(5))}&to=${encodeURIComponent(iso(6))}`,
    );
    expect(outside.json().items).toHaveLength(0);
  });
});
