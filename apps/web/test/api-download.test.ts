import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, filenameFromDisposition } from "@/lib/api/client";

describe("filenameFromDisposition", () => {
  it("reads the quoted filename of an attachment", () => {
    expect(filenameFromDisposition('attachment; filename="consulta-2026-11-16.ics"')).toBe(
      "consulta-2026-11-16.ics",
    );
    expect(filenameFromDisposition("attachment; filename=plain.ics")).toBe("plain.ics");
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("inline")).toBeNull();
  });
});

describe("api client download", () => {
  it("returns the blob and filename, sending credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("BEGIN:VCALENDAR", {
        status: 200,
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": 'attachment; filename="consulta.ics"',
        },
      }),
    );
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    const result = await client.download("/appointments/a1/ics");
    expect(result.filename).toBe("consulta.ics");
    expect(await result.blob.text()).toBe("BEGIN:VCALENDAR");
    expect(fetchImpl.mock.calls[0]![0]).toBe("http://api/v1/appointments/a1/ics");
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ credentials: "include", method: "GET" });
  });

  it("maps a failed download to its API error code", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 }),
      );
    const client = createApiClient({ baseUrl: "http://api/v1", fetchImpl });
    await expect(client.download("/appointments/x/ics")).rejects.toBeInstanceOf(ApiError);
    await expect(client.download("/appointments/x/ics")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
