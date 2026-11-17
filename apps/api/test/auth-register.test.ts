import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isCommonPassword } from "../src/lib/common-passwords.js";
import { blindIndex } from "../src/lib/crypto.js";
import {
  Client,
  createTestEnv,
  createVerifiedUser,
  errorCode,
  findUser,
  lastToken,
  PASSWORD,
  registerBody,
  uniqueEmail,
  type TestEnv,
} from "./helpers.js";
import { sha256Hex } from "../src/lib/password.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("register", () => {
  it("returns a generic 202 and stores PII encrypted", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    const res = await c.post("/auth/register", registerBody(email, { cpf: "529.982.247-25" }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ ok: true });

    const user = await findUser(env, email);
    expect(Buffer.from(user.emailEnc).includes(Buffer.from(email))).toBe(false);
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    const profile = await env.prisma.patientProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(Buffer.from(profile.cpfEnc as Uint8Array).includes(Buffer.from("52998224725"))).toBe(
      false,
    );
    expect(profile.cpfHash).toBe(blindIndex("52998224725", "cpf"));
    expect(lastToken(env, email)).toBeTruthy();
  });

  it("is enumeration-safe: existing email gets the identical response and a notice mail", async () => {
    const { email } = await createVerifiedUser(env);
    const fresh = await new Client(env).post("/auth/register", registerBody(uniqueEmail()));
    const dup = await new Client(env).post("/auth/register", registerBody(email));
    expect(dup.statusCode).toBe(fresh.statusCode);
    expect(dup.body).toBe(fresh.body);
    const mails = env.mailer.outbox.filter((m) => m.to === email);
    expect(mails.at(-1)?.subject).toMatch(/already have an account/i);
    expect(await env.prisma.user.count({ where: { emailHash: blindIndex(email, "email") } })).toBe(
      1,
    );
  });

  it("silently ignores a CPF that is already registered", async () => {
    const cpf = "111.444.777-35";
    await new Client(env).post("/auth/register", registerBody(uniqueEmail(), { cpf }));
    const second = uniqueEmail();
    const res = await new Client(env).post("/auth/register", registerBody(second, { cpf }));
    expect(res.statusCode).toBe(202);
    expect(await env.prisma.user.count({ where: { emailHash: blindIndex(second, "email") } })).toBe(
      0,
    );
  });

  it("enforces the password policy, CPF check digits and consent with coded errors", async () => {
    const c = new Client(env);
    expect(isCommonPassword("qwertyuiop")).toBe(true);
    const short = await c.post(
      "/auth/register",
      registerBody(uniqueEmail(), { password: "short1" }),
    );
    expect([short.statusCode, errorCode(short)]).toEqual([400, "WEAK_PASSWORD"]);
    const common = await c.post(
      "/auth/register",
      registerBody(uniqueEmail(), { password: "qwertyuiop" }),
    );
    expect([common.statusCode, errorCode(common)]).toEqual([400, "WEAK_PASSWORD"]);
    const cpf = await c.post(
      "/auth/register",
      registerBody(uniqueEmail(), { cpf: "123.456.789-00" }),
    );
    expect(errorCode(cpf)).toBe("INVALID_CPF");
    const consent = await c.post(
      "/auth/register",
      registerBody(uniqueEmail(), { consentLgpd: false }),
    );
    expect(errorCode(consent)).toBe("CONSENT_REQUIRED");
    const bad = await c.post("/auth/register", registerBody("nope"));
    expect(errorCode(bad)).toBe("VALIDATION_ERROR");
    expect(Object.keys(bad.json())).toEqual(["error"]);
    expect(Object.keys(bad.json().error)).toEqual(["code"]);
  });
});

describe("email verification", () => {
  it("blocks login until verified; token is single use and expires", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    await c.post("/auth/register", registerBody(email));
    expect(errorCode(await c.login(email))).toBe("EMAIL_NOT_VERIFIED");

    const token = lastToken(env, email);
    expect(errorCode(await c.post("/auth/verify-email", { token: "x".repeat(43) }))).toBe(
      "INVALID_TOKEN",
    );
    expect((await c.post("/auth/verify-email", { token })).statusCode).toBe(200);
    expect(errorCode(await c.post("/auth/verify-email", { token }))).toBe("INVALID_TOKEN");
    expect((await c.login(email)).statusCode).toBe(200);

    // The raw token is never stored.
    expect(await env.prisma.emailToken.count({ where: { tokenHash: token } })).toBe(0);
    expect(await env.prisma.emailToken.count({ where: { tokenHash: sha256Hex(token) } })).toBe(1);
  });

  it("rejects an expired token", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    await c.post("/auth/register", registerBody(email));
    const token = lastToken(env, email);
    await env.prisma.emailToken.updateMany({
      where: { tokenHash: sha256Hex(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(errorCode(await c.post("/auth/verify-email", { token }))).toBe("INVALID_TOKEN");
  });

  it("resend is generic and issues a fresh token that invalidates the old one", async () => {
    const email = uniqueEmail();
    const c = new Client(env);
    await c.post("/auth/register", registerBody(email));
    const first = lastToken(env, email);
    const unknown = await c.post("/auth/resend-verification", { email: uniqueEmail() });
    const known = await c.post("/auth/resend-verification", { email });
    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.body).toBe(unknown.body);
    const second = lastToken(env, email);
    expect(second).not.toBe(first);
    expect(errorCode(await c.post("/auth/verify-email", { token: first }))).toBe("INVALID_TOKEN");
    expect((await c.post("/auth/verify-email", { token: second })).statusCode).toBe(200);
  });
});

describe("login", () => {
  it("sets an HttpOnly/Secure/SameSite=Lax sid cookie and stores only the token hash", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    const res = await c.login(email);
    expect(res.statusCode).toBe(200);
    expect(res.json().mfaRequired).toBe(false);
    expect(res.json().token).toBeUndefined();
    const sid = res.cookies.find((x) => x.name === "sid");
    expect(sid).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    const stored = await env.prisma.session.findUniqueOrThrow({
      where: { tokenHash: sha256Hex(sid!.value) },
    });
    expect(stored.tokenHash).not.toBe(sid!.value);
    expect(stored.mfaPassed).toBe(true);
  });

  it("answers unknown email and wrong password identically", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    const wrong = await c.login(email, "wrong password entirely");
    const unknown = await c.login(uniqueEmail(), "wrong password entirely");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
    expect(errorCode(wrong)).toBe("INVALID_CREDENTIALS");
  });

  it("locks the account for 15 minutes after 5 failures, without revealing the lock", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    for (let i = 0; i < 5; i++)
      expect((await c.login(email, "wrong password entirely")).statusCode).toBe(401);
    const user = await findUser(env, email);
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(user.lockedUntil!.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

    const locked = await c.login(email, PASSWORD);
    expect([locked.statusCode, errorCode(locked)]).toEqual([401, "INVALID_CREDENTIALS"]);

    await env.prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    expect((await c.login(email, PASSWORD)).statusCode).toBe(200);
    expect((await findUser(env, email)).failedLoginCount).toBe(0);
  });

  it("writes audit rows without PII or secrets", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    await c.login(email, "wrong password entirely");
    await c.login(email);
    const user = await findUser(env, email);
    const rows = await env.prisma.auditLog.findMany({ where: { userId: user.id } });
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(["REGISTER", "EMAIL_VERIFIED", "LOGIN_FAIL", "LOGIN_OK"]),
    );
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(email);
    expect(dump).not.toContain(c.ip);
    expect(rows.every((r) => r.ipHash === null || /^[0-9a-f]{64}$/.test(r.ipHash))).toBe(true);
  });

  it("mobile clients get the token in the body and use Bearer without CSRF", async () => {
    const { email } = await createVerifiedUser(env);
    const m = new Client(env);
    const res = await m.post("/auth/login", { email, password: PASSWORD, client: "mobile" });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.find((x) => x.name === "sid")).toBeUndefined();
    m.bearer = res.json().token;
    expect((await m.get("/auth/sessions")).statusCode).toBe(200);
    expect((await m.post("/auth/logout")).statusCode).toBe(200);
    expect((await m.get("/auth/sessions")).statusCode).toBe(401);
  });
});

describe("per-IP rate limit", () => {
  it("returns 429 RATE_LIMITED after the configured number of auth requests", async () => {
    const limited = await createTestEnv({ AUTH_RATE_LIMIT_MAX: "3" });
    try {
      const c = new Client(limited, "203.0.113.9");
      for (let i = 0; i < 3; i++) expect((await c.login(uniqueEmail())).statusCode).toBe(401);
      const res = await c.login(uniqueEmail());
      expect([res.statusCode, errorCode(res)]).toEqual([429, "RATE_LIMITED"]);
      // A different IP is unaffected.
      expect((await new Client(limited, "203.0.113.10").login(uniqueEmail())).statusCode).toBe(401);
    } finally {
      await limited.close();
    }
  });
});
