import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blindIndex } from "../src/lib/crypto.js";
import { verifySecret } from "../src/lib/password.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";
import { fromDbUser } from "../src/modules/auth/mappers.js";
import { ADMIN_EMAIL, DEMO_EMAIL, seed } from "../prisma/seed.js";
import { TEST_DATABASE_URL } from "./test-db.js";

const ADMIN_PASSWORD = "seed-test-admin-password";
const OPTS = { adminPassword: ADMIN_PASSWORD, days: 7 };

let prisma: PrismaClient;

/** Empties the seeded tables (the test schema is shared by all integration files). */
async function wipe(p: PrismaClient): Promise<void> {
  await p.$transaction([
    p.appointment.deleteMany(),
    p.auditLog.deleteMany(),
    p.slot.deleteMany(),
    p.providerExam.deleteMany(),
    p.providerSpecialty.deleteMany(),
    p.provider.deleteMany(),
    p.clinic.deleteMany(),
    p.examType.deleteMany(),
    p.specialty.deleteMany(),
    p.user.deleteMany(),
  ]);
}

beforeAll(async () => {
  prisma = createPrisma(TEST_DATABASE_URL);
  await wipe(prisma);
});
afterAll(async () => {
  await wipe(prisma);
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates the catalog, providers, slots and accounts, and is idempotent on rerun", async () => {
    const now = new Date();
    const first = await seed(prisma, { ...OPTS, now });
    expect(first).toMatchObject({
      specialties: 12,
      examTypes: 10,
      clinics: 4,
      providers: 20,
      providerLinks: 25,
      users: 2,
    });
    expect(first.slotsCreated).toBeGreaterThan(0);

    const specialtyIds = (await prisma.specialty.findMany({ select: { id: true } })).map(
      (r) => r.id,
    );
    const slotCount = await prisma.slot.count();

    const second = await seed(prisma, { ...OPTS, now });
    expect(second.slotsCreated).toBe(0);
    expect(second.slotsExisting).toBe(first.slotsCreated);
    expect(second).toMatchObject({
      specialties: 12,
      examTypes: 10,
      clinics: 4,
      providers: 20,
      providerLinks: 25,
      users: 2,
    });
    expect(await prisma.slot.count()).toBe(slotCount);
    expect(
      (await prisma.specialty.findMany({ select: { id: true } })).map((r) => r.id).sort(),
    ).toEqual(specialtyIds.sort());
    expect(await prisma.providerExam.count()).toBe(10);
    expect(await prisma.providerSpecialty.count()).toBe(15);
  });

  it("creates a verified admin and a verified demo patient with a profile", async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { emailHash: blindIndex(ADMIN_EMAIL, "email") },
    });
    expect(admin.role).toBe("ADMIN");
    expect(admin.emailVerifiedAt).not.toBeNull();
    expect(fromDbUser(admin).email).toBe(ADMIN_EMAIL);
    expect(await verifySecret(admin.passwordHash, ADMIN_PASSWORD)).toBe(true);

    const patient = await prisma.user.findUniqueOrThrow({
      where: { emailHash: blindIndex(DEMO_EMAIL, "email") },
      include: { profile: true },
    });
    expect(patient.role).toBe("PATIENT");
    expect(patient.emailVerifiedAt).not.toBeNull();
    expect(patient.profile).not.toBeNull();
  });

  it("generates Mon-Fri 08:00-18:00 slots in clinic time with the right durations", async () => {
    const slots = await prisma.slot.findMany({
      include: { provider: { include: { clinic: true } }, examType: true },
    });
    expect(slots.length).toBeGreaterThan(0);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (const s of slots) {
      const start = Object.fromEntries(fmt.formatToParts(s.startsAt).map((p) => [p.type, p.value]));
      const end = Object.fromEntries(fmt.formatToParts(s.endsAt).map((p) => [p.type, p.value]));
      expect(["Sat", "Sun"]).not.toContain(start.weekday);
      expect(Number(start.hour) * 60 + Number(start.minute)).toBeGreaterThanOrEqual(8 * 60);
      expect(Number(end.hour) * 60 + Number(end.minute)).toBeLessThanOrEqual(18 * 60);
      const minutes = (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000;
      expect(minutes).toBe(s.serviceType === "CONSULTATION" ? 30 : s.examType?.durationMin);
    }
  });
});
