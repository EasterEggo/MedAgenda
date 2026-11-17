import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bearerUser } from "./booking-helpers.js";
import { Client, createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("profile", () => {
  it("GET/PATCH /me and PATCH /me/locale", async () => {
    expect((await new Client(env).get("/me")).statusCode).toBe(401);
    const { client, user, email } = await bearerUser(env);
    await env.prisma.patientProfile.create({
      data: {
        user: { connect: { id: user.id } },
        ...(await import("../src/modules/auth/mappers.js")).toDbProfile(
          { fullName: "Ana", birthDate: "1990-01-01", phone: "+55 11 99999-0000" },
          new Date(),
        ),
      },
    });
    const me = (await client.get("/me")).json();
    expect(me).toMatchObject({ email, role: "PATIENT", profile: { fullName: "Ana" } });
    const upd = await client.request("PATCH", "/me", {
      fullName: "Ana Maria",
      healthInsurance: "Plano X",
    });
    expect(upd.json().profile).toMatchObject({
      fullName: "Ana Maria",
      phone: "+55 11 99999-0000",
      healthInsurance: "Plano X",
    });
    expect((await client.request("PATCH", "/me", {})).statusCode).toBe(400);
    expect((await client.request("PATCH", "/me/locale", { locale: "fr" })).statusCode).toBe(400);
    expect((await client.request("PATCH", "/me/locale", { locale: "pt-BR" })).json()).toEqual({
      locale: "pt-BR",
    });
    expect((await client.get("/me")).json().locale).toBe("pt-BR");
    expect(
      await env.prisma.auditLog.count({ where: { userId: user.id, action: "PROFILE_READ" } }),
    ).toBeGreaterThanOrEqual(2);
  });
});
