import { describe, expect, it } from "vitest";
import type { Clinic, Provider, Slot } from "@/lib/api/endpoints";
import { clinicsInCity, providersMatching, slotsInCity, uniqueCities } from "@/lib/booking/filters";
import { groupSlotsByDay } from "@/lib/booking/group";
import { MAX_WEEK_OFFSET, clampWeekOffset, weekWindow } from "@/lib/booking/week";
import { collectAll } from "@/lib/api/pagination";

const clinic = (id: string, city: string, timezone = "America/Sao_Paulo") =>
  ({ id, name: `Clinica ${id}`, city, timezone }) as const;

function slot(
  id: string,
  startsAt: string,
  providerName: string,
  c = clinic("c1", "São Paulo"),
): Slot {
  return {
    id,
    providerId: `p-${providerName}`,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
    serviceType: "CONSULTATION",
    specialtyId: "spec-1",
    examTypeId: null,
    status: "OPEN",
    provider: { id: `p-${providerName}`, name: providerName, kind: "DOCTOR" },
    clinic: c,
  };
}

describe("groupSlotsByDay", () => {
  it("groups by calendar day in the clinic timezone and sorts by time", () => {
    const days = groupSlotsByDay(
      [
        slot("b", "2026-11-17T13:30:00Z", "Dr. B"),
        slot("a", "2026-11-17T12:00:00Z", "Dr. A"),
        // 02:30Z on the 18th is 23:30 on the 17th in São Paulo (UTC-3).
        slot("c", "2026-11-18T02:30:00Z", "Dr. C"),
        // 03:30Z on the 18th is 00:30 on the 18th in São Paulo.
        slot("d", "2026-11-18T03:30:00Z", "Dr. D"),
      ],
      "en",
    );
    expect(days.map((d) => d.key)).toEqual(["2026-11-17", "2026-11-18"]);
    expect(days[0]!.options.map((o) => o.time.replace(/\s/g, ""))).toEqual([
      "9:00AM",
      "10:30AM",
      "11:30PM",
    ]);
    expect(days[1]!.options.map((o) => o.time.replace(/\s/g, ""))).toEqual(["12:30AM"]);
    expect(days[0]!.heading).toMatch(/Tuesday/);
  });

  it("keeps one option per start time, taking the first professional by name", () => {
    const days = groupSlotsByDay(
      [
        slot("z", "2026-11-17T13:00:00Z", "Dr. Zeta"),
        slot("a", "2026-11-17T13:00:00Z", "Dr. Alfa"),
      ],
      "en",
    );
    expect(days).toHaveLength(1);
    expect(days[0]!.options).toHaveLength(1);
    expect(days[0]!.options[0]!.providerName).toBe("Dr. Alfa");
  });

  it("formats times in pt-BR with a 24-hour clock", () => {
    const [day] = groupSlotsByDay([slot("a", "2026-11-17T17:30:00Z", "Dr. A")], "pt-BR");
    expect(day!.options[0]!.time).toBe("14:30");
  });
});

describe("city and clinic filters", () => {
  const clinics: Clinic[] = [
    {
      id: "c1",
      name: "A",
      address: "",
      city: "São Paulo",
      state: "SP",
      phone: "",
      timezone: "America/Sao_Paulo",
      lat: null,
      lng: null,
    },
    {
      id: "c2",
      name: "B",
      address: "",
      city: "Belo Horizonte",
      state: "MG",
      phone: "",
      timezone: "America/Sao_Paulo",
      lat: null,
      lng: null,
    },
    {
      id: "c3",
      name: "C",
      address: "",
      city: "São Paulo",
      state: "SP",
      phone: "",
      timezone: "America/Sao_Paulo",
      lat: null,
      lng: null,
    },
  ];

  it("lists unique cities and the clinics of one city", () => {
    expect(uniqueCities(clinics)).toEqual(["Belo Horizonte", "São Paulo"]);
    expect(clinicsInCity(clinics, "São Paulo").map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(clinicsInCity(clinics, null)).toHaveLength(3);
  });

  it("filters providers by clinic first, then by city", () => {
    const provider = (id: string, clinicId: string, city: string) =>
      ({
        id,
        clinicId,
        name: id,
        clinic: { id: clinicId, name: clinicId, city, timezone: "x" },
      }) as unknown as Provider;
    const providers = [provider("p1", "c1", "São Paulo"), provider("p2", "c2", "Belo Horizonte")];
    expect(
      providersMatching(providers, { city: "São Paulo", clinicId: null }).map((p) => p.id),
    ).toEqual(["p1"]);
    expect(
      providersMatching(providers, { city: "São Paulo", clinicId: "c2" }).map((p) => p.id),
    ).toEqual(["p2"]);
    expect(providersMatching(providers, { city: null, clinicId: null })).toHaveLength(2);
  });

  it("filters slots by the clinic city", () => {
    const slots = [
      slot("a", "2026-11-17T13:00:00Z", "Dr. A"),
      slot("b", "2026-11-17T14:00:00Z", "Dr. B", clinic("c2", "Belo Horizonte")),
    ];
    expect(slotsInCity(slots, "Belo Horizonte").map((s) => s.id)).toEqual(["b"]);
    expect(slotsInCity(slots, null)).toHaveLength(2);
  });
});

describe("week windows", () => {
  const now = new Date("2026-11-16T12:00:00Z");

  it("builds 7-day windows, well inside the 31-day API limit", () => {
    const window = weekWindow(0, now);
    expect(window.from).toBe("2026-11-16T12:00:00.000Z");
    expect(window.to).toBe("2026-11-23T12:00:00.000Z");
    const next = weekWindow(1, now);
    expect(next.from).toBe("2026-11-23T12:00:00.000Z");
  });

  it("never goes past four weeks ahead or before today", () => {
    expect(MAX_WEEK_OFFSET).toBe(3);
    expect(clampWeekOffset(-2)).toBe(0);
    expect(clampWeekOffset(9)).toBe(MAX_WEEK_OFFSET);
    expect(weekWindow(99, now).from).toBe(weekWindow(MAX_WEEK_OFFSET, now).from);
  });
});

describe("collectAll", () => {
  it("follows cursors until the last page", async () => {
    const pages = [
      { items: [1, 2], nextCursor: "a" },
      { items: [3], nextCursor: "b" },
      { items: [4], nextCursor: null },
    ];
    const seen: (string | undefined)[] = [];
    const result = await collectAll(async (cursor) => {
      seen.push(cursor);
      return pages[seen.length - 1]!;
    });
    expect(result).toEqual([1, 2, 3, 4]);
    expect(seen).toEqual([undefined, "a", "b"]);
  });

  it("stops at the page cap", async () => {
    const result = await collectAll(async () => ({ items: [1], nextCursor: "more" }), 3);
    expect(result).toEqual([1, 1, 1]);
  });
});
