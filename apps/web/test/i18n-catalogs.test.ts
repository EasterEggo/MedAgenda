import { describe, expect, it } from "vitest";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import en from "@medagenda/shared/i18n/en.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  const entries = Object.entries(obj);
  if (entries.length === 0) return [];
  return entries.flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("catalogs", () => {
  it("have identical key sets", () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });
  it("contain every namespace", () => {
    for (const ns of [
      "common",
      "auth",
      "booking",
      "calendar",
      "settings",
      "errors",
      "admin",
      "ics",
    ]) {
      expect(ptBR).toHaveProperty(ns);
      expect(en).toHaveProperty(ns);
    }
  });
});
