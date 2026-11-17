import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearerUser, makeFixtures } from "./booking-helpers.js";
import { Client, createTestEnv, errorCode, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("admin", () => {
  it("requires auth, the ADMIN role and MFA", async () => {
    const body = { slug: "x", namePt: "X", nameEn: "X" };
    expect((await new Client(env).post("/admin/specialties", body)).statusCode).toBe(401);
    const patient = await bearerUser(env);
    const res = await patient.client.post("/admin/specialties", body);
    expect([res.statusCode, errorCode(res)]).toEqual([403, "FORBIDDEN"]);
    expect((await patient.client.post("/admin/slots/generate", {})).statusCode).toBe(403);
    // ADMIN session without MFA passed
    const admin = await bearerUser(env, "ADMIN");
    await env.prisma.session.updateMany({
      where: { userId: admin.user.id },
      data: { mfaPassed: false },
    });
    expect(errorCode(await admin.client.post("/admin/specialties", body))).toBe("MFA_REQUIRED");
  });

  it("CRUDs catalog entities, keeping unspecified fields on patch", async () => {
    const { client } = await bearerUser(env, "ADMIN");
    const tag = Math.random().toString(36).slice(2, 8);
    const spec = await client.post("/admin/specialties", {
      slug: `neuro-${tag}`,
      namePt: "Neurologia",
      nameEn: "Neurology",
    });
    expect(spec.statusCode).toBe(201);
    const dup = await client.post("/admin/specialties", {
      slug: `neuro-${tag}`,
      namePt: "N",
      nameEn: "N",
    });
    expect([dup.statusCode, errorCode(dup)]).toEqual([409, "CONFLICT"]);
    expect((await client.post("/admin/specialties", { slug: "Bad Slug" })).statusCode).toBe(400);

    const exam = await client.post("/admin/exams", {
      slug: `exam-${tag}`,
      namePt: "Exame",
      nameEn: "Exam",
      preparationPt: "Jejum",
      preparationEn: "Fasting",
      durationMin: 20,
    });
    expect(exam.statusCode).toBe(201);

    const clinic = await client.post("/admin/clinics", {
      name: "Clinica",
      address: "Rua 1",
      city: "Recife",
      state: "PE",
      phone: "81 1234 5678",
      timezone: "America/Recife",
    });
    expect(clinic.statusCode).toBe(201);
    const patched = await client.request("PATCH", `/admin/clinics/${clinic.json().id}`, {
      name: "Clinica 2",
    });
    expect(patched.json()).toMatchObject({ name: "Clinica 2", timezone: "America/Recife" });

    const prov = await client.post("/admin/providers", {
      clinicId: clinic.json().id,
      name: "Dra. Teste",
      kind: "DOCTOR",
      specialtyIds: [spec.json().id],
    });
    expect(prov.statusCode).toBe(201);
    const badRef = await client.post("/admin/providers", {
      clinicId: "missing",
      name: "X",
      kind: "DOCTOR",
    });
    expect(badRef.statusCode).toBe(400);
    expect(
      (await new Client(env).get(`/catalog/providers?specialtyId=${spec.json().id}`)).json().items,
    ).toHaveLength(1);

    // referenced rows cannot be deleted
    const inUse = await client.delete(`/admin/clinics/${clinic.json().id}`);
    expect([inUse.statusCode, errorCode(inUse)]).toEqual([409, "IN_USE"]);
    expect((await client.delete(`/admin/providers/${prov.json().id}`)).statusCode).toBe(204);
    expect((await client.delete(`/admin/clinics/${clinic.json().id}`)).statusCode).toBe(204);
    expect((await client.delete(`/admin/specialties/${spec.json().id}`)).statusCode).toBe(204);
    expect((await client.delete(`/admin/exams/${exam.json().id}`)).statusCode).toBe(204);
    expect((await client.delete(`/admin/exams/${exam.json().id}`)).statusCode).toBe(404);
  });

  it("generates slots in clinic time, skipping existing ones", async () => {
    const { client } = await bearerUser(env, "ADMIN");
    const fx = await makeFixtures(env);
    const base = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
    const body = {
      providerId: fx.provider.id,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: "08:00",
      endTime: "10:00",
      durationMin: 30,
      from: base,
      to: end,
      serviceType: "CONSULTATION",
      specialtyId: fx.specialty.id,
    };
    const first = await client.post("/admin/slots/generate", body);
    expect([first.statusCode, first.json()]).toEqual([
      201,
      { requested: 8, created: 8, skipped: 0 },
    ]);
    const first8 = await env.prisma.slot.findFirstOrThrow({
      where: { providerId: fx.provider.id },
      orderBy: { startsAt: "asc" },
    });
    // 08:00 America/Sao_Paulo (UTC-3) is 11:00 UTC
    expect(first8.startsAt.getUTCHours()).toBe(11);
    const again = await client.post("/admin/slots/generate", { ...body, endTime: "11:00" });
    expect(again.json()).toEqual({ requested: 12, created: 4, skipped: 8 });
    // validation: specialty required for consultations, range cap
    expect(
      (await client.post("/admin/slots/generate", { ...body, specialtyId: undefined })).statusCode,
    ).toBe(400);
    const wide = await client.post("/admin/slots/generate", { ...body, to: "2099-01-01" });
    expect(errorCode(wide)).toBe("DATE_RANGE_TOO_LARGE");
    // admin listing returns every status, in the requested range only
    const listed = await client.get(
      `/admin/slots?providerId=${fx.provider.id}&from=${base}&to=${base}`,
    );
    expect(listed.statusCode).toBe(200);
    const items = listed.json().items as { id: string; status: string }[];
    expect(items).toHaveLength(6);
    await client.request("PATCH", `/admin/slots/${items[0]!.id}`, { status: "BLOCKED" });
    const blocked = await client.get(
      `/admin/slots?providerId=${fx.provider.id}&from=${base}&to=${end}&status=BLOCKED`,
    );
    expect(blocked.json().items).toHaveLength(1);
    expect(
      (await client.get(`/admin/slots?providerId=${fx.provider.id}&from=${base}&to=2099-01-01`))
        .statusCode,
    ).toBe(400);
    // provider does not offer this specialty
    const other = await env.prisma.specialty.create({
      data: { slug: `o-${Math.random()}`, namePt: "O", nameEn: "O" },
    });
    expect(
      (await client.post("/admin/slots/generate", { ...body, specialtyId: other.id })).statusCode,
    ).toBe(400);
  });

  it("blocks and unblocks slots but never a booked one", async () => {
    const { client } = await bearerUser(env, "ADMIN");
    const fx = await makeFixtures(env);
    const slot = await fx.slot(30);
    const blocked = await client.request("PATCH", `/admin/slots/${slot.id}`, { status: "BLOCKED" });
    expect(blocked.json().status).toBe("BLOCKED");
    const patient = await bearerUser(env);
    expect((await patient.client.post("/appointments", { slotId: slot.id })).statusCode).toBe(409);
    expect(
      (await client.request("PATCH", `/admin/slots/${slot.id}`, { status: "OPEN" })).json().status,
    ).toBe("OPEN");
    expect((await patient.client.post("/appointments", { slotId: slot.id })).statusCode).toBe(201);
    const res = await client.request("PATCH", `/admin/slots/${slot.id}`, { status: "BLOCKED" });
    expect([res.statusCode, errorCode(res)]).toEqual([409, "SLOT_ALREADY_BOOKED"]);
    expect(
      (await client.request("PATCH", `/admin/slots/nope`, { status: "BLOCKED" })).statusCode,
    ).toBe(404);
  });
});
