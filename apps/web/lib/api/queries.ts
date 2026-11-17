import { catalogApi, type SlotsParams } from "./endpoints";
import { collectAll } from "./pagination";
import { weekWindow } from "@/lib/booking/week";

/** TanStack Query option factories shared by wizard, calendar and lists. */
export const catalogQueries = {
  specialties: () => ({
    queryKey: ["catalog", "specialties"] as const,
    queryFn: () => collectAll((cursor) => catalogApi.specialties(cursor)),
  }),
  exams: () => ({
    queryKey: ["catalog", "exams"] as const,
    queryFn: () => collectAll((cursor) => catalogApi.exams(cursor)),
  }),
  clinics: () => ({
    queryKey: ["catalog", "clinics"] as const,
    queryFn: () => collectAll((cursor) => catalogApi.clinics(cursor)),
  }),
  providers: (params: { specialtyId?: string; examTypeId?: string; clinicId?: string }) => ({
    queryKey: ["catalog", "providers", params] as const,
    queryFn: () => collectAll((cursor) => catalogApi.providers({ ...params, cursor })),
  }),
};

/** Open slots of one 7-day window. `offset` weeks from now; dates are computed at fetch time. */
export function slotsQuery(
  filters: Omit<SlotsParams, "from" | "to" | "cursor" | "limit">,
  offset: number,
) {
  return {
    queryKey: ["slots", filters, offset] as const,
    queryFn: () => {
      const window = weekWindow(offset, new Date());
      return collectAll((cursor) =>
        catalogApi.slots({ ...filters, ...window, cursor, limit: 200 }),
      );
    },
  };
}
