import { describe, expect, it } from "vitest";
import {
  dayKey,
  formatDate,
  formatDateTime,
  formatDayHeading,
  formatTime,
  toWallClockIso,
} from "@/lib/datetime";

// 17:30Z is 14:30 in America/Sao_Paulo (UTC-3, no DST in 2026).
const instant = "2026-11-16T17:30:00Z";

describe("datetime helpers", () => {
  it("formats pt-BR as 16/11/2026 14:30 in the clinic timezone", () => {
    expect(formatDateTime(instant, { locale: "pt-BR" })).toBe("16/11/2026 14:30");
  });
  it("formats en with the locale conventions", () => {
    expect(formatDate(instant, { locale: "en" })).toBe("11/16/2026");
    expect(formatTime(instant, { locale: "en" })).toMatch(/^2:30\s?PM$/);
  });
  it("respects a different clinic timezone", () => {
    expect(formatDateTime(instant, { locale: "pt-BR", timeZone: "America/Manaus" })).toBe(
      "16/11/2026 13:30",
    );
  });
});

describe("clinic wall-clock helpers", () => {
  it("returns the clinic wall clock without an offset", () => {
    expect(toWallClockIso(instant, "America/Sao_Paulo")).toBe("2026-11-16T14:30:00");
    expect(toWallClockIso(instant, "America/Manaus")).toBe("2026-11-16T13:30:00");
  });
  it("derives the clinic calendar day, even near midnight", () => {
    // 02:30Z on the 17th is still the 16th in São Paulo.
    expect(dayKey("2026-11-17T02:30:00Z", "America/Sao_Paulo")).toBe("2026-11-16");
  });
  it("formats day headings with the weekday", () => {
    expect(formatDayHeading(instant, { locale: "en" })).toBe("Monday, 11/16");
    expect(formatDayHeading(instant, { locale: "pt-BR" })).toMatch(/^segunda-feira, 16\/11$/);
  });
});
