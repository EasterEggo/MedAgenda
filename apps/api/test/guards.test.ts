import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireAuth, requireRole } from "../src/modules/auth/guards.js";
import {
  Client,
  createTestEnv,
  createVerifiedUser,
  enableMfa,
  errorCode,
  findUser,
  totp,
  type TestEnv,
} from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({}, (app) => {
    app.get("/api/v1/_test/protected", { preHandler: requireAuth({ mfa: true }) }, async () => ({
      ok: true,
    }));
    app.get(
      "/api/v1/_test/admin",
      { preHandler: [requireAuth({ mfa: true }), requireRole("ADMIN")] },
      async () => ({
        ok: true,
      }),
    );
  });
});
afterAll(async () => {
  await env.close();
});

describe("guards", () => {
  it("requireAuth rejects anonymous requests and requireRole rejects patients", async () => {
    expect((await new Client(env).get("/_test/protected")).statusCode).toBe(401);
    const { email } = await createVerifiedUser(env);
    const c = new Client(env);
    await c.login(email);
    expect((await c.get("/_test/protected")).statusCode).toBe(200);
    const res = await c.get("/_test/admin");
    expect([res.statusCode, errorCode(res)]).toEqual([403, "FORBIDDEN"]);
  });

  it("requires ADMIN accounts to have passed MFA", async () => {
    const { email } = await createVerifiedUser(env);
    const user = await findUser(env, email);
    await env.prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });

    const c = new Client(env);
    await c.login(email);
    expect(errorCode(await c.get("/_test/admin"))).toBe("MFA_REQUIRED"); // no TOTP enrolled
    const { secret } = await enableMfa(env, c, email);

    const d = new Client(env);
    await d.login(email);
    expect(errorCode(await d.get("/_test/admin"))).toBe("MFA_REQUIRED"); // enrolled, not yet verified
    await d.post("/auth/mfa/verify", { code: totp(secret) });
    expect((await d.get("/_test/admin")).statusCode).toBe(200);
  });
});
