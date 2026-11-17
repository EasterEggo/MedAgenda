import type { ServiceType } from "@medagenda/shared";
import type { Slot, SlotsParams } from "@/lib/api/endpoints";

export const BOOKING_STEPS = [
  "type",
  "catalog",
  "location",
  "provider",
  "slot",
  "confirm",
  "done",
] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

/** Sentinel for "any available professional" in `providerId`. */
export const ANY_PROVIDER = "any";

export interface BookingState {
  serviceType: ServiceType | null;
  /** Specialty id for consultations, exam type id for exams. */
  catalogId: string | null;
  city: string | null;
  clinicId: string | null;
  /** A provider id, ANY_PROVIDER, or null while not chosen. */
  providerId: string | null;
  slot: Slot | null;
}

export const EMPTY_BOOKING: BookingState = {
  serviceType: null,
  catalogId: null,
  city: null,
  clinicId: null,
  providerId: null,
  slot: null,
};

export function stepIndex(step: BookingStep): number {
  return BOOKING_STEPS.indexOf(step);
}

/** Next step in the wizard. The last step stays put. */
export function nextStep(step: BookingStep): BookingStep {
  const index = Math.min(stepIndex(step) + 1, BOOKING_STEPS.length - 1);
  return BOOKING_STEPS[index]!;
}

/** Previous step. The first step and the success screen have no predecessor to go back to. */
export function prevStep(step: BookingStep): BookingStep {
  if (step === "done") return "done";
  return BOOKING_STEPS[Math.max(stepIndex(step) - 1, 0)]!;
}

/** Whether the "Continue" button of a step may be used with the current state. */
export function canContinue(step: BookingStep, state: BookingState): boolean {
  switch (step) {
    case "type":
      return state.serviceType !== null;
    case "catalog":
      return state.catalogId !== null;
    case "location":
      return true;
    case "provider":
      return state.providerId !== null;
    case "slot":
      return state.slot !== null;
    case "confirm":
    case "done":
      return false;
  }
}

/** Changing a choice clears everything chosen after it, so the summary never mixes old and new values. */
export function chooseServiceType(state: BookingState, serviceType: ServiceType): BookingState {
  if (state.serviceType === serviceType) return state;
  return { ...EMPTY_BOOKING, serviceType };
}

export function chooseCatalog(state: BookingState, catalogId: string): BookingState {
  if (state.catalogId === catalogId) return state;
  return { ...state, catalogId, providerId: null, slot: null };
}

export function chooseCity(state: BookingState, city: string | null): BookingState {
  if (state.city === city) return state;
  return { ...state, city, clinicId: null, providerId: null, slot: null };
}

export function chooseClinic(state: BookingState, clinicId: string | null): BookingState {
  if (state.clinicId === clinicId) return state;
  return { ...state, clinicId, providerId: null, slot: null };
}

export function chooseProvider(state: BookingState, providerId: string): BookingState {
  if (state.providerId === providerId) return state;
  return { ...state, providerId, slot: null };
}

export function chooseSlot(state: BookingState, slot: Slot): BookingState {
  return { ...state, slot };
}

/** The catalog field that the chosen service type filters on. */
export function catalogFilter(
  state: Pick<BookingState, "serviceType" | "catalogId">,
): Pick<SlotsParams, "serviceType" | "specialtyId" | "examTypeId"> {
  if (state.serviceType === "EXAM") {
    return { serviceType: "EXAM", examTypeId: state.catalogId ?? undefined };
  }
  return {
    serviceType: state.serviceType ?? undefined,
    specialtyId: state.catalogId ?? undefined,
  };
}

/** Slot filters for the chosen service, clinic and professional (no dates, no city). */
export function slotFilters(state: BookingState): Omit<SlotsParams, "from" | "to"> {
  const providerId =
    state.providerId && state.providerId !== ANY_PROVIDER ? state.providerId : undefined;
  return {
    ...catalogFilter(state),
    clinicId: state.clinicId ?? undefined,
    providerId,
  };
}

/** Reads `?type=` (CONSULTATION or EXAM). Anything else is ignored. */
export function serviceTypeFromParam(value: string | null): ServiceType | null {
  return value === "CONSULTATION" || value === "EXAM" ? value : null;
}

/** Starting point of the wizard. A valid `type` preselects it and skips straight to the catalog step. */
export function initialBooking(typeParam: string | null): {
  state: BookingState;
  step: BookingStep;
} {
  const serviceType = serviceTypeFromParam(typeParam);
  if (!serviceType) return { state: EMPTY_BOOKING, step: "type" };
  return { state: { ...EMPTY_BOOKING, serviceType }, step: "catalog" };
}
