import { z } from "zod";
import { IdSchema, PaginationSchema } from "./catalog.js";

export const CANCEL_MIN_NOTICE_MS = 2 * 60 * 60 * 1000;

export const NotesSchema = z.string().trim().min(1).max(1000);

export const BookAppointmentSchema = z.object({
  slotId: IdSchema,
  notes: NotesSchema.optional(),
});

export const RescheduleSchema = z.object({ newSlotId: IdSchema });

export const AppointmentStatusSchema = z.enum(["SCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

const IsoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const AppointmentsQuerySchema = PaginationSchema.extend({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  status: AppointmentStatusSchema.optional(),
});
