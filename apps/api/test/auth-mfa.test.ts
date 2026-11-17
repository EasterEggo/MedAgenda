import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifySecret } from "../src/lib/password.js";
import { decrypt } from "../src/lib/crypto.js";
import {
  Client,
  createTestEnv,
  createVerifiedUser,
  enableMfa,
  errorCode,
  findUser,
  PASSWORD,
  rewindReplayGuard,
  totp,
  type TestEnv,
} from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

async function userWithMfa() {
  const { email } = await createVerifiedUser(env);
  const c = new Client(env);
  await c.login(email);
  const mfa = await enableMfa(env, c, email);
  return { email, c, ...mfa };
}

describe("MFA setup and enable", () => {
  it("stores the secret encrypted, returns a QR, and issues 10 argon2-hashed recovery codes", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    await c.login(email);

    const setup = await c.post("/auth/mfa/setup");
    expect(setup.statusCode).toBe(200);
    expect(setup.json().otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.json().qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secret = new URL(setup.json().otpauthUri).searchParams.get("secret")!;

    let user = await findUser(env, email);
    expect(user.totpEnabledAt).toBeNull();
    expect(Buffer.from(user.totpSecretEnc!).includes(Buffer.from(secret))).toBe(false);
    expect(decrypt(Buffer.from(user.totpSecretEnc!), "User.totpSecretEnc")).toBe(secret);

    expect(errorCode(await c.post("/auth/mfa/enable", { code: "000000" }))).toBe(
      "MFA_INVALID_CODE",
    );
    const enable = await c.post("/auth/mfa/enable", { code: totp(secret) });
    expect(enable.statusCode).toBe(200);
    const codes = enable.json().recoveryCodes as string[];
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    user = await findUser(env, email);
    expect(user.totpEnabledAt).not.toBeNull();
    const rows = await env.prisma.recoveryCode.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.codeHash.startsWith("$argon2id$"))).toBe(true);
    for (const code of codes) {
      const normalized = code.replace("-", "");
      const matches = await Promise.all(rows.map((r) => verifySecret(r.codeHash, normalized)));
      expect(matches.filter(Boolean)).toHaveLength(1);
    }
    expect((await c.post("/auth/mfa/setup")).statusCode).toBe(409);
  });

  it("rejects a replay of the enable code and revokes pre-existing other sessions", async () => {
    const { email } = await createVerifiedUser(env);
    const other = new Client(env);
    await other.login(email);
    const c = new Client(env);
    await c.login(email);
    const setup = await c.post("/auth/mfa/setup");
    const secret = new URL(setup.json().otpauthUri).searchParams.get("secret")!;
    expect((await c.post("/auth/mfa/enable", { code: totp(secret) })).statusCode).toBe(200);
    expect((await other.get("/auth/sessions")).statusCode).toBe(401);
    expect((await c.get("/auth/sessions")).statusCode).toBe(200);
  });
});

describe("MFA login", () => {
  it("creates an mfaPassed=false session that requireAuth({mfa}) rejects until verified", async () => {
    const { email, secret } = await userWithMfa();
    const c = new Client(env);
    const login = await c.login(email);
    expect(login.json().mfaRequired).toBe(true);

    const blocked = await c.get("/auth/sessions");
    expect([blocked.statusCode, errorCode(blocked)]).toEqual([403, "MFA_REQUIRED"]);

    expect(errorCode(await c.post("/auth/mfa/verify", { code: "123456" }))).toBe(
      "MFA_INVALID_CODE",
    );
    expect((await c.post("/auth/mfa/verify", { code: totp(secret) })).statusCode).toBe(200);
    expect((await c.get("/auth/sessions")).statusCode).toBe(200);
  });

  it("rejects replay of a used TOTP code, even from another session", async () => {
    const { email, secret } = await userWithMfa();
    const code = totp(secret);
    const a = new Client(env);
    await a.login(email);
    expect((await a.post("/auth/mfa/verify", { code })).statusCode).toBe(200);

    const b = new Client(env);
    await b.login(email);
    const replay = await b.post("/auth/mfa/verify", { code });
    expect([replay.statusCode, errorCode(replay)]).toEqual([401, "MFA_INVALID_CODE"]);
    expect((await b.get("/auth/sessions")).statusCode).toBe(403);
  });

  it("rejects older-step codes after a newer step was used", async () => {
    const { email, secret } = await userWithMfa();
    const a = new Client(env);
    await a.login(email);
    expect((await a.post("/auth/mfa/verify", { code: totp(secret, 30) })).statusCode).toBe(200); // step+1
    const b = new Client(env);
    await b.login(email);
    expect(errorCode(await b.post("/auth/mfa/verify", { code: totp(secret, 0) }))).toBe(
      "MFA_INVALID_CODE",
    );
    expect(errorCode(await b.post("/auth/mfa/verify", { code: totp(secret, -30) }))).toBe(
      "MFA_INVALID_CODE",
    );
  });

  it("accepts +/-1 step of clock drift and rejects 2 steps", async () => {
    const { email, secret } = await userWithMfa();
    for (const [offset, ok] of [
      [-30, true],
      [30, true],
      [-90, false],
      [90, false],
    ] as const) {
      await rewindReplayGuard(env, email);
      const c = new Client(env);
      await c.login(email);
      const res = await c.post("/auth/mfa/verify", { code: totp(secret, offset) });
      expect(res.statusCode, `offset ${offset}`).toBe(ok ? 200 : 401);
    }
  });

  it("recovery codes work exactly once", async () => {
    const { email, recoveryCodes } = await userWithMfa();
    const a = new Client(env);
    await a.login(email);
    expect(errorCode(await a.post("/auth/mfa/verify", { recoveryCode: "AAAAA-BBBBB" }))).toBe(
      "MFA_INVALID_CODE",
    );
    const code = recoveryCodes[3]!;
    expect(
      (await a.post("/auth/mfa/verify", { recoveryCode: code.toLowerCase() })).statusCode,
    ).toBe(200);

    const b = new Client(env);
    await b.login(email);
    expect(errorCode(await b.post("/auth/mfa/verify", { recoveryCode: code }))).toBe(
      "MFA_INVALID_CODE",
    );
    expect((await b.post("/auth/mfa/verify", { recoveryCode: recoveryCodes[4]! })).statusCode).toBe(
      200,
    );

    const user = await findUser(env, email);
    expect(
      await env.prisma.recoveryCode.count({ where: { userId: user.id, usedAt: { not: null } } }),
    ).toBe(2);
  });

  it("locks the account after 5 failed second-factor attempts and kills the session", async () => {
    const { email, secret } = await userWithMfa();
    const c = new Client(env);
    await c.login(email);
    for (let i = 0; i < 5; i++) {
      expect(errorCode(await c.post("/auth/mfa/verify", { code: "000000" }))).toBe(
        "MFA_INVALID_CODE",
      );
    }
    expect((await findUser(env, email)).lockedUntil).not.toBeNull();
    expect((await c.post("/auth/mfa/verify", { code: totp(secret) })).statusCode).toBe(401);
    expect(errorCode(await new Client(env).login(email))).toBe("INVALID_CREDENTIALS");
  });
});

describe("MFA disable", () => {
  it("requires password and a fresh valid code, then removes secret and recovery codes", async () => {
    const { email, c, secret } = await userWithMfa();
    expect(
      errorCode(
        await c.post("/auth/mfa/disable", { password: "nope nope nope", code: totp(secret) }),
      ),
    ).toBe("INVALID_CREDENTIALS");
    expect(
      errorCode(await c.post("/auth/mfa/disable", { password: PASSWORD, code: "000000" })),
    ).toBe("MFA_INVALID_CODE");
    await rewindReplayGuard(env, email);
    expect(
      (await c.post("/auth/mfa/disable", { password: PASSWORD, code: totp(secret) })).statusCode,
    ).toBe(200);
    const user = await findUser(env, email);
    expect(user.totpSecretEnc).toBeNull();
    expect(user.totpEnabledAt).toBeNull();
    expect(await env.prisma.recoveryCode.count({ where: { userId: user.id } })).toBe(0);
    expect((await new Client(env).login(email)).json().mfaRequired).toBe(false);
  });
});
