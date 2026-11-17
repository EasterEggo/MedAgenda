import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/endpoints";
import { localizedName, matchesQuery, normalizeText } from "@/lib/catalog";
import {
  appointmentListParams,
  appointmentName,
  appointmentPreparation,
  appointmentsForFilter,
  canChangeAppointment,
  googleAddUrl,
  googleEventFor,
} from "@/lib/appointments";

const base: Appointment = {
  id: "a1",
  status: "SCHEDULED",
  slotId: "s1",
  startsAt: "2026-11-20T13:00:00.000Z",
  endsAt: "2026-11-20T13:30:00.000Z",
  serviceType: "EXAM",
  specialty: null,
  examType: {
    id: "e1",
    namePt: "Hemograma",
    nameEn: "Complete blood count",
    preparationPt: "Jejum de 8 horas.",
    preparationEn: "Fast for 8 hours.",
  },
  provider: { id: "p1", name: "Lab Central", kind: "EXAM_RESOURCE" },
  clinic: {
    id: "c1",
    name: "Clínica Centro",
    address: "Rua A, 10",
    city: "São Paulo",
    phone: "+55 11 0000-0000",
    timezone: "America/Sao_Paulo",
  },
  notes: "minha observação privada",
  sequence: 0,
  createdAt: "2026-11-16T00:00:00.000Z",
  cancelledAt: null,
};

describe("catalog names", () => {
  it("renders namePt or nameEn by locale", () => {
    const item = { namePt: "Cardiologia", nameEn: "Cardiology" };
    expect(localizedName(item, "pt-BR")).toBe("Cardiologia");
    expect(localizedName(item, "en")).toBe("Cardiology");
    expect(appointmentName(base, "en")).toBe("Complete blood count");
    expect(appointmentName(base, "pt-BR")).toBe("Hemograma");
  });

  it("matches search text without accents or case", () => {
    expect(normalizeText("Otorrinolaringologia  ")).toBe("otorrinolaringologia");
    expect(matchesQuery("Clínico Geral", "clinico")).toBe(true);
    expect(matchesQuery("Cardiologia", "CARDIO")).toBe(true);
    expect(matchesQuery("Raio-X", "raio x")).toBe(true);
    expect(matchesQuery("Raio-X", "tomografia")).toBe(false);
    expect(matchesQuery("Hemograma", "")).toBe(true);
  });
});

describe("appointment helpers", () => {
  it("gives exam preparation in the active locale and none for consultations", () => {
    expect(appointmentPreparation(base, "en")).toBe("Fast for 8 hours.");
    expect(appointmentPreparation(base, "pt-BR")).toBe("Jejum de 8 horas.");
    expect(appointmentPreparation({ ...base, examType: null }, "en")).toBeNull();
  });

  it("allows cancel and reschedule only more than 2 hours before the start", () => {
    const start = new Date(base.startsAt).getTime();
    expect(canChangeAppointment(base, new Date(start - 3 * 3600_000))).toBe(true);
    expect(canChangeAppointment(base, new Date(start - 1 * 3600_000))).toBe(false);
    expect(
      canChangeAppointment({ ...base, status: "CANCELLED" }, new Date(start - 9 * 3600_000)),
    ).toBe(false);
  });

  it("builds the Google event without notes and with the preparation text", () => {
    const event = googleEventFor(base, "Exame – Hemograma (Lab Central)", "en");
    expect(event.location).toBe("Clínica Centro, Rua A, 10");
    expect(event.details).toBe("Fast for 8 hours.");
    expect(JSON.stringify(event)).not.toContain("privada");
    const url = new URL(googleAddUrl(base, "Exame", "en"));
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261120T130000Z/20261120T133000Z");
    expect(url.searchParams.get("details")).toBe("Fast for 8 hours.");
    expect(url.search).not.toContain("privada");
  });

  it("maps each list filter to the API query", () => {
    const now = new Date("2026-11-16T12:00:00.000Z");
    expect(appointmentListParams("upcoming", now)).toEqual({
      from: "2026-11-16T12:00:00.000Z",
      status: "SCHEDULED",
    });
    expect(appointmentListParams("past", now)).toEqual({ to: "2026-11-16T12:00:00.000Z" });
    expect(appointmentListParams("cancelled", now)).toEqual({ status: "CANCELLED" });
  });

  it("hides cancelled rows from the past filter only", () => {
    const cancelled = { ...base, id: "x", status: "CANCELLED" as const };
    expect(appointmentsForFilter([base, cancelled], "past").map((a) => a.id)).toEqual(["a1"]);
    expect(appointmentsForFilter([base, cancelled], "cancelled")).toHaveLength(2);
  });
});
