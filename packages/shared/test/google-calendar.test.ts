import { describe, expect, it } from "vitest";
import { googleAddEventUrl, googleSubscribeUrl, toGoogleDate, toWebcalUrl } from "../src/index.js";

describe("google calendar helpers", () => {
  it("converts to webcal", () => {
    expect(toWebcalUrl("https://api.example.com/f/abc.ics")).toBe(
      "webcal://api.example.com/f/abc.ics",
    );
    expect(toWebcalUrl("http://localhost:3001/f.ics")).toBe("webcal://localhost:3001/f.ics");
  });

  it("builds the subscribe url with an encoded webcal cid", () => {
    const url = googleSubscribeUrl("https://api.example.com/api/v1/calendar/feed/tok_-1.ics");
    expect(url).toBe(
      "https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fapi.example.com%2Fapi%2Fv1%2Fcalendar%2Ffeed%2Ftok_-1.ics",
    );
  });

  it("formats google dates in UTC without millis", () => {
    expect(toGoogleDate(new Date("2026-11-16T14:30:00.000Z"))).toBe("20261116T143000Z");
  });

  it("builds the TEMPLATE url", () => {
    const url = googleAddEventUrl({
      title: "Consulta – Cardiologia (Dr. A & B)",
      startsAt: new Date("2026-11-16T14:30:00Z"),
      endsAt: new Date("2026-11-16T15:00:00Z"),
      location: "Clínica X, Rua 1",
      details: "Telefone: 11 5555",
    });
    const [base, query] = url.split("?") as [string, string];
    expect(base).toBe("https://calendar.google.com/calendar/render");
    const p = Object.fromEntries(
      query.split("&").map((kv) => {
        const [k, v] = kv.split("=") as [string, string];
        return [k, decodeURIComponent(v)];
      }),
    );
    expect(p).toEqual({
      action: "TEMPLATE",
      text: "Consulta – Cardiologia (Dr. A & B)",
      dates: "20261116T143000Z/20261116T150000Z",
      location: "Clínica X, Rua 1",
      details: "Telefone: 11 5555",
    });
    expect(query).not.toContain("&B");
  });

  it("omits optional params", () => {
    const url = googleAddEventUrl({ title: "t", startsAt: new Date(0), endsAt: new Date(1000) });
    expect(url).not.toContain("location");
    expect(url).not.toContain("details");
  });
});
