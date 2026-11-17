import type { Clinic, Provider, Slot } from "@/lib/api/endpoints";

/** Distinct cities of the given clinics, sorted for display. */
export function uniqueCities(clinics: Clinic[]): string[] {
  return [...new Set(clinics.map((c) => c.city))].sort((a, b) => a.localeCompare(b));
}

/** Clinics in a city; with no city selected, all clinics. */
export function clinicsInCity(clinics: Clinic[], city: string | null): Clinic[] {
  return city ? clinics.filter((c) => c.city === city) : clinics;
}

/**
 * Providers that match the clinic or city filter. A clinic filter wins over the city filter,
 * because a clinic already belongs to one city.
 */
export function providersMatching(
  providers: Provider[],
  filter: { city: string | null; clinicId: string | null },
): Provider[] {
  return providers.filter((p) => {
    if (filter.clinicId) return p.clinicId === filter.clinicId;
    if (filter.city) return p.clinic.city === filter.city;
    return true;
  });
}

/** Slots in a city. The slots endpoint filters by clinic but not by city, so this runs in the client. */
export function slotsInCity(slots: Slot[], city: string | null): Slot[] {
  return city ? slots.filter((s) => s.clinic.city === city) : slots;
}
