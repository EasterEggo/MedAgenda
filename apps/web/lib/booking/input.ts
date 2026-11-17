import { BookAppointmentSchema } from "@medagenda/shared";
import type { FieldErrors } from "@/lib/validation";
import { validateForm } from "@/lib/validation";

export type BookingInput = { slotId: string; notes?: string };

/**
 * Builds the POST /appointments body. Blank notes are dropped (notes are optional);
 * otherwise the shared schema validates them.
 */
export function buildBookingInput(
  slotId: string,
  rawNotes: string,
): { input?: BookingInput; errors: FieldErrors } {
  const notes = rawNotes.trim();
  if (notes === "") return { input: { slotId }, errors: {} };
  const result = validateForm(BookAppointmentSchema, { slotId, notes });
  return { input: result.data, errors: result.errors };
}
