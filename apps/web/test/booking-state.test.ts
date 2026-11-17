import { describe, expect, it } from "vitest";
import {
  ANY_PROVIDER,
  BOOKING_STEPS,
  EMPTY_BOOKING,
  canContinue,
  catalogFilter,
  chooseCatalog,
  chooseCity,
  chooseProvider,
  chooseServiceType,
  initialBooking,
  nextStep,
  prevStep,
  serviceTypeFromParam,
  slotFilters,
  type BookingState,
} from "@/lib/booking/state";
import { buildBookingInput } from "@/lib/booking/input";
import type { Slot } from "@/lib/api/endpoints";

const slot = {
  id: "s1",
  providerId: "p1",
  startsAt: "2026-11-17T13:00:00.000Z",
  endsAt: "2026-11-17T13:30:00.000Z",
  serviceType: "CONSULTATION",
  specialtyId: "spec-1",
  examTypeId: null,
  status: "OPEN",
  provider: { id: "p1", name: "Dr. Ana", kind: "DOCTOR" },
  clinic: { id: "c1", name: "Clinica", city: "São Paulo", timezone: "America/Sao_Paulo" },
} as Slot;

describe("wizard steps", () => {
  it("has the seven steps of section 7, success included", () => {
    expect(BOOKING_STEPS).toEqual([
      "type",
      "catalog",
      "location",
      "provider",
      "slot",
      "confirm",
      "done",
    ]);
  });

  it("moves forward and back, staying inside the bounds", () => {
    expect(nextStep("type")).toBe("catalog");
    expect(nextStep("done")).toBe("done");
    expect(prevStep("catalog")).toBe("type");
    expect(prevStep("type")).toBe("type");
    expect(prevStep("done")).toBe("done");
  });

  it("only allows continuing once the step's choice is made", () => {
    expect(canContinue("type", EMPTY_BOOKING)).toBe(false);
    expect(canContinue("type", { ...EMPTY_BOOKING, serviceType: "EXAM" })).toBe(true);
    expect(canContinue("catalog", { ...EMPTY_BOOKING, serviceType: "EXAM" })).toBe(false);
    // Location is optional: "all cities" is a valid choice.
    expect(canContinue("location", EMPTY_BOOKING)).toBe(true);
    expect(canContinue("provider", EMPTY_BOOKING)).toBe(false);
    expect(canContinue("provider", { ...EMPTY_BOOKING, providerId: ANY_PROVIDER })).toBe(true);
    expect(canContinue("slot", EMPTY_BOOKING)).toBe(false);
    expect(canContinue("slot", { ...EMPTY_BOOKING, slot })).toBe(true);
    expect(canContinue("confirm", { ...EMPTY_BOOKING, slot })).toBe(false);
  });

  it("clears later choices when an earlier one changes", () => {
    const filled: BookingState = {
      serviceType: "CONSULTATION",
      catalogId: "spec-1",
      city: "São Paulo",
      clinicId: "c1",
      providerId: "p1",
      slot,
    };
    expect(chooseServiceType(filled, "EXAM")).toEqual({ ...EMPTY_BOOKING, serviceType: "EXAM" });
    expect(chooseServiceType(filled, "CONSULTATION")).toBe(filled);
    expect(chooseCatalog(filled, "spec-2")).toMatchObject({
      catalogId: "spec-2",
      providerId: null,
      slot: null,
      city: "São Paulo",
    });
    expect(chooseCity(filled, "Rio")).toMatchObject({ city: "Rio", clinicId: null, slot: null });
    expect(chooseProvider(filled, "p1")).toBe(filled);
    expect(chooseProvider(filled, "p2")).toMatchObject({ providerId: "p2", slot: null });
  });
});

describe("query filters", () => {
  it("filters consultations by specialty and exams by exam type", () => {
    expect(catalogFilter({ serviceType: "CONSULTATION", catalogId: "spec-1" })).toEqual({
      serviceType: "CONSULTATION",
      specialtyId: "spec-1",
    });
    expect(catalogFilter({ serviceType: "EXAM", catalogId: "exam-1" })).toEqual({
      serviceType: "EXAM",
      examTypeId: "exam-1",
    });
  });

  it("omits the provider filter when any professional is acceptable", () => {
    const base = { ...EMPTY_BOOKING, serviceType: "CONSULTATION" as const, catalogId: "spec-1" };
    expect(slotFilters({ ...base, providerId: ANY_PROVIDER }).providerId).toBeUndefined();
    expect(slotFilters({ ...base, providerId: "p9", clinicId: "c1" })).toMatchObject({
      providerId: "p9",
      clinicId: "c1",
    });
  });

  it("starts from the type parameter when it is valid", () => {
    expect(serviceTypeFromParam("EXAM")).toBe("EXAM");
    expect(serviceTypeFromParam("exam")).toBeNull();
    expect(initialBooking(null)).toEqual({ state: EMPTY_BOOKING, step: "type" });
    expect(initialBooking("CONSULTATION")).toEqual({
      state: { ...EMPTY_BOOKING, serviceType: "CONSULTATION" },
      step: "catalog",
    });
  });
});

describe("booking input", () => {
  it("drops blank notes and keeps trimmed notes", () => {
    expect(buildBookingInput("s1", "   ")).toEqual({ input: { slotId: "s1" }, errors: {} });
    expect(buildBookingInput("s1", "  jejum de 8 horas  ")).toEqual({
      input: { slotId: "s1", notes: "jejum de 8 horas" },
      errors: {},
    });
  });

  it("reports notes longer than the API limit", () => {
    const result = buildBookingInput("s1", "x".repeat(1001));
    expect(result.input).toBeUndefined();
    expect(result.errors.notes).toBeTruthy();
  });
});
