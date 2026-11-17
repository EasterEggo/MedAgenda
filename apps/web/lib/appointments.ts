import { CANCEL_MIN_NOTICE_MS, googleAddEventUrl, type GoogleEventInput } from "@medagenda/shared";
import type { Appointment } from "@/lib/api/endpoints";
import { localizedName, localizedPreparation } from "@/lib/catalog";

/** Specialty or exam name of an appointment, in the active locale. */
export function appointmentName(appointment: Appointment, locale: string): string {
  if (appointment.specialty) return localizedName(appointment.specialty, locale);
  if (appointment.examType) return localizedName(appointment.examType, locale);
  return "";
}

/** Exam preparation text, or null for consultations and exams without instructions. */
export function appointmentPreparation(appointment: Appointment, locale: string): string | null {
  if (!appointment.examType) return null;
  return localizedPreparation(appointment.examType, locale) || null;
}

export function appointmentLocation(appointment: Appointment): string {
  return `${appointment.clinic.name}, ${appointment.clinic.address}`;
}

/**
 * Cancel and reschedule are allowed until CANCEL_MIN_NOTICE_MS (2 h) before the start.
 * The API enforces the same rule; the UI uses this only to hide actions that would fail.
 */
export function canChangeAppointment(appointment: Appointment, now: Date): boolean {
  if (appointment.status !== "SCHEDULED") return false;
  return new Date(appointment.startsAt).getTime() - now.getTime() >= CANCEL_MIN_NOTICE_MS;
}

/** Event payload for "Add this event" links. Notes are never included. */
export function googleEventFor(
  appointment: Appointment,
  title: string,
  locale: string,
): GoogleEventInput {
  const details = appointmentPreparation(appointment, locale) ?? undefined;
  return {
    title,
    startsAt: new Date(appointment.startsAt),
    endsAt: new Date(appointment.endsAt),
    location: appointmentLocation(appointment),
    details,
  };
}

export function googleAddUrl(appointment: Appointment, title: string, locale: string): string {
  return googleAddEventUrl(googleEventFor(appointment, title, locale));
}

export type AppointmentFilter = "upcoming" | "past" | "cancelled";

/**
 * Query for one list filter. The API only sorts ascending and filters one status at a time,
 * so "past" excludes cancelled rows on the client (see `appointmentsForFilter`).
 */
export function appointmentListParams(
  filter: AppointmentFilter,
  now: Date,
): { from?: string; to?: string; status?: "SCHEDULED" | "CANCELLED" } {
  switch (filter) {
    case "upcoming":
      return { from: now.toISOString(), status: "SCHEDULED" };
    case "past":
      return { to: now.toISOString() };
    case "cancelled":
      return { status: "CANCELLED" };
  }
}

export function appointmentsForFilter(
  items: Appointment[],
  filter: AppointmentFilter,
): Appointment[] {
  return filter === "past" ? items.filter((a) => a.status !== "CANCELLED") : items;
}
