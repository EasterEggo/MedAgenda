import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "../src/lib/password.js";
import {
  Client,
  createTestEnv,
  createVerifiedUser,
  errorCode,
  findUser,
  lastToken,
  PASSWORD,
  uniqueEmail,
  type TestEnv,
} from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => {
  await env.close();
});

describe("CSRF (double submit)", () => {
  it("rejects cookie-authenticated state changes without a valid token; Bearer is exempt", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    await c.login(email);

    const missing = await c.post("/auth/resend-verification", { email }, { csrf: false });
    expect([missing.statusCode, errorCode(missing)]).toEqual([403, "CSRF_INVALID"]);

    const forged = await c.post(
      "/auth/resend-verification",
      { email },
      { csrf: false, headers: { "x-csrf-token": "forged-token" } },
    );
    expect(errorCode(forged)).toBe("CSRF_INVALID");

    // A token minted for another browser (different secret cookie) does not validate.
    const other = new Client(env);
    await other.login(email);
    const crossed = await c.post(
      "/auth/resend-verification",
      { email },
      { csrf: false, headers: { "x-csrf-token": other.csrf! } },
    );
    expect(errorCode(crossed)).toBe("CSRF_INVALID");

    expect((await c.post("/auth/resend-verification", { email })).statusCode).toBe(202);

    const mobile = new Client(env);
    const login = await mobile.post("/auth/login", { email, password: PASSWORD, client: "mobile" });
    mobile.bearer = login.json().token;
    // Sending a stale sid cookie alongside Bearer must not trigger CSRF either.
    mobile.cookies.set("sid", "stale");
    expect((await mobile.post("/auth/logout", {}, { csrf: false })).statusCode).toBe(200);
  });

  it("GET /auth/csrf issues a token usable for subsequent cookie requests", async () => {
    const c = new Client(env);
    const res = await c.get("/auth/csrf");
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().csrfToken).toBe("string");
    expect(c.cookies.has("_csrf")).toBe(true);
  });
});

describe("sessions", () => {
  it("lists, revokes own sessions, and treats another user's session as 404", async () => {
    const { email } = await createVerifiedUser(env);
    const a = new Client(env);
    const b = new Client(env);
    await a.login(email);
    await b.login(email);

    const list = (await a.get("/auth/sessions")).json().sessions as {
      id: string;
      current: boolean;
    }[];
    expect(list.length).toBe(2);
    expect(list.filter((s) => s.current).length).toBe(1);
    expect(JSON.stringify(list)).not.toMatch(/tokenHash|ipHash/);

    const stranger = await createVerifiedUser(env);
    const s = new Client(env);
    await s.login(stranger.email);
    const strangerSession = (
      (await s.get("/auth/sessions")).json().sessions as { id: string }[]
    )[0]!;
    const denied = await a.request("DELETE", `/auth/sessions/${strangerSession.id}`);
    expect([denied.statusCode, errorCode(denied)]).toEqual([404, "NOT_FOUND"]);
    expect((await s.get("/auth/sessions")).statusCode).toBe(200);

    const other = list.find((x) => !x.current)!;
    expect((await a.request("DELETE", `/auth/sessions/${other.id}`)).statusCode).toBe(200);
    expect((await b.get("/auth/sessions")).statusCode).toBe(401);
    expect((await a.get("/auth/sessions")).statusCode).toBe(200);
  });

  it("logout revokes the session server side", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    const res = await c.login(email);
    const sid = res.cookies.find((x) => x.name === "sid")!.value;
    expect((await c.post("/auth/logout")).statusCode).toBe(200);
    const replay = new Client(env);
    replay.cookies.set("sid", sid);
    expect((await replay.get("/auth/sessions")).statusCode).toBe(401);
  });

  it("applies the absolute expiry and the 12 h idle timeout (web only)", async () => {
    const { email } = await createVerifiedUser(env);
    const web = new Client(env);
    const sid = (await web.login(email)).cookies.find((x) => x.name === "sid")!.value;
    const hash = sha256Hex(sid);

    await env.prisma.session.update({
      where: { tokenHash: hash },
      data: { lastUsedAt: new Date(Date.now() - 13 * 3600 * 1000) },
    });
    expect((await web.get("/auth/sessions")).statusCode).toBe(401);

    const mobile = new Client(env);
    const token = (
      await mobile.post("/auth/login", { email, password: PASSWORD, client: "mobile" })
    ).json().token;
    mobile.bearer = token;
    await env.prisma.session.update({
      where: { tokenHash: sha256Hex(token) },
      data: { lastUsedAt: new Date(Date.now() - 13 * 3600 * 1000) },
    });
    expect((await mobile.get("/auth/sessions")).statusCode).toBe(200); // idle limit is web-only
    await env.prisma.session.update({
      where: { tokenHash: sha256Hex(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await mobile.get("/auth/sessions")).statusCode).toBe(401);
  });

  it("slides the 30 day expiry on use", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    const sid = (await c.login(email)).cookies.find((x) => x.name === "sid")!.value;
    const hash = sha256Hex(sid);
    const soon = new Date(Date.now() + 24 * 3600 * 1000);
    await env.prisma.session.update({
      where: { tokenHash: hash },
      data: { expiresAt: soon, lastUsedAt: new Date(Date.now() - 3600 * 1000) },
    });
    await c.get("/auth/sessions");
    const row = await env.prisma.session.findUniqueOrThrow({ where: { tokenHash: hash } });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });
});

describe("password reset", () => {
  it("is generic, single use, expires, and revokes every session", async () => {
    const { email } = await createVerifiedUser(env);
    const s1 = new Client(env);
    const s2 = new Client(env);
    await s1.login(email);
    await s2.login(email);

    const c = new Client(env);
    const known = await c.post("/auth/forgot", { email });
    const unknown = await c.post("/auth/forgot", { email: uniqueEmail() });
    expect(known.statusCode).toBe(202);
    expect([known.statusCode, known.body]).toEqual([unknown.statusCode, unknown.body]);
    const token = lastToken(env, email);

    const weak = await c.post("/auth/reset", { token, password: "qwertyuiop" });
    expect(errorCode(weak)).toBe("WEAK_PASSWORD");
    expect(
      errorCode(
        await c.post("/auth/reset", { token: "y".repeat(43), password: "brand new passphrase" }),
      ),
    ).toBe("INVALID_TOKEN");

    // Lock the account first: reset must also clear the lock.
    const user = await findUser(env, email);
    await env.prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: new Date(Date.now() + 600000) },
    });

    const NEW = "brand new passphrase 42";
    expect((await c.post("/auth/reset", { token, password: NEW })).statusCode).toBe(200);
    expect(errorCode(await c.post("/auth/reset", { token, password: NEW }))).toBe("INVALID_TOKEN");

    expect((await s1.get("/auth/sessions")).statusCode).toBe(401);
    expect((await s2.get("/auth/sessions")).statusCode).toBe(401);
    expect(errorCode(await c.login(email, PASSWORD))).toBe("INVALID_CREDENTIALS");
    expect((await c.login(email, NEW)).statusCode).toBe(200);
  });

  it("rejects an expired token and invalidates older tokens when a new one is requested", async () => {
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    await c.post("/auth/forgot", { email });
    const old = lastToken(env, email);
    await c.post("/auth/forgot", { email });
    const fresh = lastToken(env, email);
    expect(
      errorCode(await c.post("/auth/reset", { token: old, password: "another passphrase 1" })),
    ).toBe("INVALID_TOKEN");
    await env.prisma.emailToken.updateMany({
      where: { tokenHash: sha256Hex(fresh) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      errorCode(await c.post("/auth/reset", { token: fresh, password: "another passphrase 1" })),
    ).toBe("INVALID_TOKEN");
  });
});
