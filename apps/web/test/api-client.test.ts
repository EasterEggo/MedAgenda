import { describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "@medagenda/shared";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import en from "@medagenda/shared/i18n/en.json";
import {
  ApiError,
  codeFromBody,
  createApiClient,
  errorMessageKey,
  toApiError,
} from "@/lib/api/client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("error code mapping", () => {
  it("has an errors.<CODE> message in both catalogs for every API error code", () => {
    for (const code of [...ErrorCodes, "NETWORK_ERROR", "UNKNOWN"]) {
      expect((ptBR.errors as Record<string, string>)[code], `pt-BR ${code}`).toBeTruthy();
      expect((en.errors as Record<string, string>)[code], `en ${code}`).toBeTruthy();
    }
  });

  it("maps known codes to errors.<CODE> and unknown ones to errors.UNKNOWN", () => {
    expect(errorMessageKey("SLOT_ALREADY_BOOKED")).toBe("errors.SLOT_ALREADY_BOOKED");
    expect(errorMessageKey("NETWORK_ERROR")).toBe("errors.NETWORK_ERROR");
    expect(errorMessageKey("SOMETHING_NEW")).toBe("errors.UNKNOWN");
  });

  it("extracts codes from the standard body and the rate-limit body", () => {
    expect(codeFromBody({ error: { code: "INVALID_CREDENTIALS" } }, 401)).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(codeFromBody({ statusCode: 429, error: "RATE_LIMITED" }, 429)).toBe("RATE_LIMITED");
    expect(codeFromBody(null, 429)).toBe("RATE_LIMITED");
    expect(codeFromBody({ error: { code: "NOPE" } }, 500)).toBe("UNKNOWN");
    expect(toApiError(new Error("x")).code).toBe("UNKNOWN");
  });
});

describe("api client", () => {
  it("sends credentials and throws ApiError with the API code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: { code: "UNAUTHENTICATED" } }, 401));
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    const error = await client.get("/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: "include", method: "GET" });
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    const client = createApiClient({
      baseUrl: "http://api/v1",
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("fail")),
    });
    await expect(client.get("/me")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("fetches a CSRF token once and sends it on mutations", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/auth/csrf") ? json({ csrfToken: "tok-1" }) : json({ ok: true }),
      );
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    await client.post("/auth/forgot", { email: "a@b.co" });
    await client.post("/auth/forgot", { email: "a@b.co" });
    const csrfCalls = fetchImpl.mock.calls.filter(([u]) => String(u).endsWith("/auth/csrf"));
    expect(csrfCalls).toHaveLength(1);
    const post = fetchImpl.mock.calls.find(([u]) => String(u).endsWith("/auth/forgot"))!;
    expect(post[1].headers["x-csrf-token"]).toBe("tok-1");
    expect(post[1].body).toBe(JSON.stringify({ email: "a@b.co" }));
  });

  it("refreshes the CSRF token and retries once on CSRF_INVALID", async () => {
    let n = 0;
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/csrf")) return json({ csrfToken: `tok-${++n}` });
      const header = (init.headers as Record<string, string>)["x-csrf-token"];
      return header === "tok-2"
        ? json({ ok: true })
        : json({ error: { code: "CSRF_INVALID" } }, 403);
    });
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    await expect(client.post("/auth/logout")).resolves.toEqual({ ok: true });
  });

  it("does not loop forever when CSRF stays invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith("/auth/csrf")
          ? json({ csrfToken: "t" })
          : json({ error: { code: "CSRF_INVALID" } }, 403),
      );
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    await expect(client.post("/x")).rejects.toMatchObject({ code: "CSRF_INVALID" });
  });
});
