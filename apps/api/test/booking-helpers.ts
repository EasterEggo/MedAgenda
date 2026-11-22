import { randomBytes } from "node:crypto";
import { createSession } from "../src/modules/auth/sessions.js";
import { toDbUser } from "../src/modules/auth/mappers.js";
import { Client, uniqueEmail, type TestEnv } from "./helpers.js";

/** Creates a user + session straight in the DB (fast) and returns a Bearer client. */
export async function bearerUser(env: TestEnv, role: "PATIENT" | "ADMIN" = "PATIENT") {
  const email = uniqueEmail();
  const user = await env.prisma.user.create({
    data: {
      ...toDbUser({ email, passwordHash: "!", locale: "en" }),
      role,
      emailVerifiedAt: new Date(),
    },
  });
  const { token } = await createSession(env.prisma, { userId: user.id });
  const client = new Client(env);
  client.bearer = token;
  return { client, user, email };
}

export async function makeFixtures(env: TestEnv) {
  const tag = randomBytes(4).toString("hex");
  const specialty = await env.prisma.specialty.create({
    data: { slug: `spec-${tag}`, namePt: "Cardiologia", nameEn: "Cardiology" },
  });
  const clinic = await env.prisma.clinic.create({
    data: {
      name: `Clinic ${tag}`,
      address: "Rua A, 1",
      city: `City${tag}`,
      state: "SP",
      phone: "11 5555",
    },
  });
  const provider = await env.prisma.provider.create({
    data: {
      clinicId: clinic.id,
      name: `Dr ${tag}`,
      kind: "DOCTOR",
      specialties: { create: { specialtyId: specialty.id } },
    },
  });
  let n = 0;
  async function slot(hoursFromNow: number, durationMin = 30, status: "OPEN" | "BLOCKED" = "OPEN") {
    const startsAt = new Date(
      Math.ceil((Date.now() + hoursFromNow * 3600_000) / 60_000) * 60_000 + n++ * 1000,
    );
    return env.prisma.slot.create({
      data: {
        providerId: provider.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
        serviceType: "CONSULTATION",
        specialtyId: specialty.id,
        status,
      },
    });
  }
  return { specialty, clinic, provider, slot };
}
