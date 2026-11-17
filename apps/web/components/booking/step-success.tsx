"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ServiceTypeBadge } from "@/components/appointments/badges";
import { CalendarLinks } from "@/components/appointments/calendar-links";
import { Link } from "@/i18n/navigation";
import type { Appointment } from "@/lib/api/endpoints";
import { appointmentName } from "@/lib/appointments";
import { formatDateTime } from "@/lib/datetime";

/** Step 7: confirmation with the three calendar options. Focus moves to the heading for screen readers. */
export function StepSuccess({
  appointment,
  onBookAnother,
}: {
  appointment: Appointment;
  onBookAnother: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-1 size-8 shrink-0 text-success" />
        <div className="flex flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            {t("booking.success.title")}
          </h2>
          <p className="text-muted">{t("booking.success.text")}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-3 rounded-lg border border-slate-300 bg-card p-5 text-sm">
        <dt className="font-semibold">{t("calendar.appointments.detail.service")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <ServiceTypeBadge serviceType={appointment.serviceType} />
          <span className="font-medium">{appointmentName(appointment, locale)}</span>
        </dd>
        <dt className="font-semibold">{t("calendar.appointments.detail.when")}</dt>
        <dd>
          <time dateTime={appointment.startsAt}>
            {formatDateTime(appointment.startsAt, {
              locale,
              timeZone: appointment.clinic.timezone,
            })}
          </time>
        </dd>
        <dt className="font-semibold">{t("calendar.appointments.detail.professional")}</dt>
        <dd>{appointment.provider.name}</dd>
        <dt className="font-semibold">{t("calendar.appointments.detail.clinic")}</dt>
        <dd>
          {appointment.clinic.name}, {appointment.clinic.address}
        </dd>
      </dl>

      <CalendarLinks appointment={appointment} />

      <div className="flex flex-wrap gap-3 border-t border-slate-300 pt-6">
        <Link href="/app/calendar" className={buttonVariants({ variant: "outline" })}>
          {t("booking.success.viewCalendar")}
        </Link>
        <Button variant="ghost" onClick={onBookAnother}>
          {t("booking.success.bookAnother")}
        </Button>
      </div>
    </div>
  );
}
