import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";

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
