"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/datetime";
import type { Appointment } from "@/lib/api/endpoints";
import { appointmentName } from "@/lib/appointments";
import { Button } from "@/components/ui/button";
import { ServiceTypeBadge, StatusBadge } from "./badges";

/** One appointment row: type, name, status, when and where. Pass onOpen to make it open the detail drawer. */
export function AppointmentItem({
  appointment,
  onOpen,
}: {
  appointment: Appointment;
  onOpen?: (id: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const when = formatDateTime(appointment.startsAt, {
    locale,
    timeZone: appointment.clinic.timezone,
  });
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ServiceTypeBadge serviceType={appointment.serviceType} />
          <StatusBadge status={appointment.status} />
        </div>
        <h3 className="text-lg font-semibold break-words">
          {appointmentName(appointment, locale)}
        </h3>
        <p className="text-sm text-muted">
          <time dateTime={appointment.startsAt}>{when}</time>
          {" · "}
          {appointment.provider.name}
          {" · "}
          {appointment.clinic.name}
        </p>
      </div>
      {onOpen ? (
        <Button variant="outline" onClick={() => onOpen(appointment.id)} className="shrink-0">
          {t("appointments.open")}
          <span className="sr-only"> {appointmentName(appointment, locale)}</span>
        </Button>
      ) : null}
    </article>
  );
}
