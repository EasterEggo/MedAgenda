import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { blindIndex } from "../src/lib/crypto.js";
import {
  Client,
  createTestEnv,
  errorCode,
  enableMfa,
  findUser,
  PASSWORD,
  registerBody,
  uniqueEmail,
  lastToken,
  type TestEnv,
} from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

async function seedAppointment(userId: string, offsetMs: number) {
  const clinic = await env.prisma.clinic.create({
    data: { name: "C", address: "A", city: "SP", state: "SP", phone: "1" },
  });
  const provider = await env.prisma.provider.create({
    data: { clinicId: clinic.id, name: "Dr X", kind: "DOCTOR" },
  });
  const startsAt = new Date(Date.now() + offsetMs);
  const slot = await env.prisma.slot.create({
    data: {
      providerId: provider.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 1800_000),
      serviceType: "CONSULTATION",
      status: "BOOKED",
    },
  });
  const { encrypt } = await import("../src/lib/crypto.js");
  const appt = await env.prisma.appointment.create({
    data: { userId, slotId: slot.id, notesEnc: encrypt("private note", "Appointment.notesEnc") },
  });
  return { slot, appt };
}

describe("LGPD export and delete", () => {
  it("exports decrypted data and audits the profile read", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    await c.post(
      "/auth/register",
      registerBody(email, { cpf: "52998224725", fullName: "Maria Souza" }),
    );
    await c.post("/auth/verify-email", { token: lastToken(env, email) });
    await c.login(email);
    const user = await findUser(env, email);
    await seedAppointment(user.id, 86400_000);

    const res = await c.get("/me/export");
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.account.email).toBe(email);
    expect(data.profile).toMatchObject({
      fullName: "Maria Souza",
      cpf: "52998224725",
      birthDate: "1990-05-01",
    });
    expect(data.appointments[0].notes).toBe("private note");
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|tokenHash|totpSecret/);
    const actions = (await env.prisma.auditLog.findMany({ where: { userId: user.id } })).map(
      (r) => r.action,
    );
    expect(actions).toEqual(expect.arrayContaining(["PROFILE_READ", "DATA_EXPORT"]));

    expect((await new Client(env).get("/me/export")).statusCode).toBe(401);
  });

  it("DELETE /me requires the password, wipes data, revokes sessions and frees future slots", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    await c.post("/auth/register", registerBody(email, { cpf: "11144477735" }));
    await c.post("/auth/verify-email", { token: lastToken(env, email) });
    await c.login(email);
    const other = new Client(env);
    await other.login(email);
    const user = await findUser(env, email);
    const future = await seedAppointment(user.id, 2 * 86400_000);
    const past = await seedAppointment(user.id, -2 * 86400_000);

    expect(errorCode(await c.delete("/me", { password: "wrong password!!" }))).toBe(
      "INVALID_CREDENTIALS",
    );
    expect((await c.delete("/me", { password: PASSWORD })).statusCode).toBe(200);

    const row = await env.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.emailHash).not.toBe(blindIndex(email, "email"));
    expect(row.passwordHash).toBe("!");
    expect(await env.prisma.patientProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await env.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);

    const fa = await env.prisma.appointment.findUniqueOrThrow({ where: { id: future.appt.id } });
    expect(fa.status).toBe("CANCELLED");
    expect(fa.sequence).toBe(1);
    expect(fa.notesEnc).toBeNull();
    expect(
      (await env.prisma.slot.findUniqueOrThrow({ where: { id: future.slot.id } })).status,
    ).toBe("OPEN");
    expect(
      (await env.prisma.appointment.findUniqueOrThrow({ where: { id: past.appt.id } })).status,
    ).toBe("SCHEDULED");

    expect((await other.get("/auth/sessions")).statusCode).toBe(401);
    expect(errorCode(await new Client(env).login(email))).toBe("INVALID_CREDENTIALS");
    // The email and CPF can be registered again.
    expect(
      (await new Client(env).post("/auth/register", registerBody(email, { cpf: "11144477735" })))
        .statusCode,
    ).toBe(202);
    expect(await env.prisma.user.count({ where: { emailHash: blindIndex(email, "email") } })).toBe(
      1,
    );
  });
});

describe("hardening", () => {
  it("sets security headers and a strict CSP", async () => {
    const res = await env.app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("only echoes allow-listed CORS origins", async () => {
    const ok = await env.app.inject({
      method: "OPTIONS",
      url: "/api/v1/auth/login",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await env.app.inject({
      method: "OPTIONS",
      url: "/api/v1/auth/login",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects bodies over 100 KB with a coded error", async () => {
    const res = await new Client(env).post("/auth/register", { pad: "x".repeat(101 * 1024) });
    expect([res.statusCode, errorCode(res)]).toEqual([413, "PAYLOAD_TOO_LARGE"]);
  });

  it("never returns prose: unexpected failures expose only a code", async () => {
    const res = await env.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: "{bad json",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: "BAD_REQUEST" } });
  });

  it("does not log passwords, tokens, cookies, TOTP secrets or recovery codes", async () => {
    const lines: string[] = [];
    const logged = await createTestEnv({}, undefined, { write: (l) => void lines.push(l) });
    try {
      const email = uniqueEmail();
      const c = new Client(logged);
      await c.post("/auth/register", registerBody(email));
      const verifyToken = lastToken(logged, email);
      await c.post("/auth/verify-email", { token: verifyToken });
      const login = await c.login(email);
      const sid = login.cookies.find((x) => x.name === "sid")!.value;
      const { secret, recoveryCodes } = await enableMfa(logged, c, email);
      await c.post("/auth/forgot", { email });
      const resetToken = lastToken(logged, email);
      await c.post("/auth/reset", { token: resetToken, password: "never logged passphrase" });
      const all = lines.join("\n");
      expect(all.length).toBeGreaterThan(0);
      for (const secretValue of [
        PASSWORD,
        "never logged passphrase",
        verifyToken,
        resetToken,
        sid,
        c.csrf!,
        secret,
        ...recoveryCodes,
        email,
      ]) {
        expect(all).not.toContain(secretValue);
      }
    } finally {
      await logged.close();
    }
  });

  it("fails fast at startup when key material is missing or malformed", () => {
    const base = { ...process.env };
    expect(() => loadConfig({ ...base, DATA_KEYS: undefined })).toThrow(/DATA_KEYS/);
    expect(() => loadConfig({ ...base, BLIND_INDEX_KEY: undefined })).toThrow(/BLIND_INDEX_KEY/);
    expect(() => loadConfig({ ...base, BLIND_INDEX_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
    expect(() => loadConfig({ ...base, COOKIE_SECRET: "short" })).toThrow();
  });
});
