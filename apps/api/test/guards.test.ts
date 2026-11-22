import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireAuth, requireRole } from "../src/modules/auth/guards.js";
import {
  Client,
  createTestEnv,
  createVerifiedUser,
  errorCode,
  findUser,
  type TestEnv,
} from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({}, (app) => {
    app.get("/api/v1/_test/protected", { preHandler: requireAuth() }, async () => ({
      ok: true,
    }));
    app.get(
      "/api/v1/_test/admin",
      { preHandler: [requireAuth(), requireRole("ADMIN")] },
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

  it("lets an ADMIN account through requireRole without any second factor", async () => {
    const { email } = await createVerifiedUser(env);
    const user = await findUser(env, email);
    await env.prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    const c = new Client(env);
    await c.login(email);
    expect((await c.get("/_test/admin")).statusCode).toBe(200);
  });
});
