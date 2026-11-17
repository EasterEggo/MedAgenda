"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SlotPicker } from "@/components/booking/slot-picker";
import { appointmentsApi, type Appointment, type Slot } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { appointmentName, appointmentPreparation, canChangeAppointment } from "@/lib/appointments";
import { formatDateTime } from "@/lib/datetime";
import { ServiceTypeBadge, StatusBadge } from "./badges";
import { CalendarLinks } from "./calendar-links";

type Mode = "details" | "cancel" | "reschedule";
type Notice = { variant: "error" | "success"; text: string };

/**
 * Appointment details with cancel and reschedule. Mounted with a key per appointment,
 * so each opening starts in the details view.
 */
export function AppointmentSheet({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string;
  onClose: () => void;
  /** Called after a successful cancel or reschedule, e.g. to refresh a calendar. */
  onChanged?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("details");
  const [notice, setNotice] = useState<Notice | null>(null);

  const detail = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
  });
  const appointment = detail.data;

  function changed(text: string) {
    setNotice({ variant: "success", text });
    setMode("details");
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
    onChanged?.();
  }

  const title = appointment ? appointmentName(appointment, locale) : "";

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("calendar.drawer.title")}
      closeLabel={t("common.actions.close")}
    >
      {detail.isPending ? (
        <p role="status" className="text-muted">
          {t("common.loading")}
        </p>
      ) : null}
      {detail.isError ? (
        <Alert variant="error">{t(errorMessageKey(toApiError(detail.error).code))}</Alert>
      ) : null}
      {notice ? <Alert variant={notice.variant}>{notice.text}</Alert> : null}
      {appointment ? (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ServiceTypeBadge serviceType={appointment.serviceType} />
              <StatusBadge status={appointment.status} />
            </div>
            <h3 className="text-lg font-semibold break-words">{title}</h3>
          </div>
          {mode === "details" ? (
            <DetailsView
              appointment={appointment}
              onCancel={() => {
                setNotice(null);
                setMode("cancel");
              }}
              onReschedule={() => {
                setNotice(null);
                setMode("reschedule");
              }}
            />
          ) : null}
          {mode === "cancel" ? (
            <CancelView
              appointment={appointment}
              onDone={() => changed(t("calendar.actions.cancelled"))}
              onKeep={() => setMode("details")}
            />
          ) : null}
          {mode === "reschedule" ? (
            <RescheduleView
              appointment={appointment}
              onDone={() => changed(t("calendar.actions.rescheduled"))}
              onBack={() => setMode("details")}
            />
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function DetailsView({
  appointment,
  onCancel,
  onReschedule,
}: {
  appointment: Appointment;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const preparation = appointmentPreparation(appointment, locale);
  const canChange = canChangeAppointment(appointment, new Date());
  const durationMin = Math.round(
    (new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()) / 60_000,
  );
  const tz = appointment.clinic.timezone;

  return (
    <>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="font-semibold">{t("appointments.detail.when")}</dt>
        <dd>
          <time dateTime={appointment.startsAt}>
            {formatDateTime(appointment.startsAt, { locale, timeZone: tz })}
          </time>
        </dd>
        <dt className="font-semibold">{t("appointments.detail.duration")}</dt>
        <dd>{t("booking.catalog.duration", { minutes: durationMin })}</dd>
        <dt className="font-semibold">{t("appointments.detail.professional")}</dt>
        <dd>{appointment.provider.name}</dd>
        <dt className="font-semibold">{t("appointments.detail.clinic")}</dt>
        <dd>{appointment.clinic.name}</dd>
        <dt className="font-semibold">{t("appointments.detail.address")}</dt>
        <dd>{appointment.clinic.address}</dd>
        <dt className="font-semibold">{t("appointments.detail.phone")}</dt>
        <dd>{appointment.clinic.phone}</dd>
      </dl>

      {appointment.serviceType === "EXAM" ? (
        <section aria-labelledby="prep-heading" className="flex flex-col gap-1">
          <h4 id="prep-heading" className="font-semibold">
            {t("appointments.detail.preparation")}
          </h4>
          <p className="text-sm">{preparation ?? t("appointments.detail.noPreparation")}</p>
        </section>
      ) : null}

      <section aria-labelledby="notes-heading" className="flex flex-col gap-1">
        <h4 id="notes-heading" className="font-semibold">
          {t("appointments.detail.notes")}
        </h4>
        <p className="text-sm">{appointment.notes || t("appointments.detail.noNotes")}</p>
      </section>

      {appointment.status === "SCHEDULED" ? (
        <div className="flex flex-col gap-3">
          {canChange ? (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={onReschedule}>
                {t("calendar.actions.reschedule")}
              </Button>
              <Button variant="danger" onClick={onCancel}>
                {t("calendar.actions.cancel")}
              </Button>
            </div>
          ) : null}
          <p className="text-sm text-muted">{t("calendar.actions.windowNote")}</p>
        </div>
      ) : null}

      {appointment.status !== "CANCELLED" ? <CalendarLinks appointment={appointment} /> : null}
    </>
  );
}

function CancelView({
  appointment,
  onDone,
  onKeep,
}: {
  appointment: Appointment;
  onDone: () => void;
  onKeep: () => void;
}) {
  const t = useTranslations();
  const cancel = useMutation({
    mutationFn: () => appointmentsApi.cancel(appointment.id),
    onSuccess: onDone,
  });
  return (
    <section aria-labelledby="cancel-heading" className="flex flex-col gap-4">
      <h4 id="cancel-heading" className="text-lg font-semibold">
        {t("calendar.actions.cancelTitle")}
      </h4>
      <p>{t("calendar.actions.cancelText")}</p>
      {cancel.isError ? (
        <Alert variant="error">{t(errorMessageKey(toApiError(cancel.error).code))}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          {cancel.isPending
            ? t("calendar.actions.cancelling")
            : t("calendar.actions.confirmCancel")}
        </Button>
        <Button variant="outline" onClick={onKeep} disabled={cancel.isPending}>
          {t("calendar.actions.keep")}
        </Button>
      </div>
    </section>
  );
}

function RescheduleView({
  appointment,
  onDone,
  onBack,
}: {
  appointment: Appointment;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useTranslations();
  const [sameProvider, setSameProvider] = useState(true);
  const [chosen, setChosen] = useState<Slot | null>(null);

  const reschedule = useMutation({
    mutationFn: (slot: Slot) => appointmentsApi.reschedule(appointment.id, slot.id),
    onSuccess: onDone,
  });

  const filters = {
    serviceType: appointment.serviceType,
    specialtyId: appointment.specialty?.id,
    examTypeId: appointment.examType?.id,
    providerId: sameProvider ? appointment.provider.id : undefined,
  };

  return (
    <section aria-labelledby="reschedule-heading" className="flex flex-col gap-4">
      <h4 id="reschedule-heading" className="text-lg font-semibold">
        {t("calendar.actions.rescheduleTitle")}
      </h4>
      <div
        role="group"
        aria-label={t("calendar.actions.rescheduleTitle")}
        className="flex flex-wrap gap-2"
      >
        <Button
          variant="outline"
          aria-pressed={sameProvider}
          onClick={() => {
            setSameProvider(true);
            setChosen(null);
          }}
        >
          {t("calendar.actions.rescheduleSame")}
        </Button>
        <Button
          variant="outline"
          aria-pressed={!sameProvider}
          onClick={() => {
            setSameProvider(false);
            setChosen(null);
          }}
        >
          {t("calendar.actions.rescheduleAny")}
        </Button>
      </div>
      <SlotPicker
        filters={filters}
        city={null}
        selectedSlotId={chosen?.id ?? null}
        onSelect={setChosen}
      />
      {reschedule.isError ? (
        <Alert variant="error">{t(errorMessageKey(toApiError(reschedule.error).code))}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={!chosen || reschedule.isPending}
          onClick={() => chosen && reschedule.mutate(chosen)}
        >
          {reschedule.isPending
            ? t("calendar.actions.rescheduling")
            : t("calendar.actions.rescheduleSubmit")}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={reschedule.isPending}>
          {t("calendar.actions.back")}
        </Button>
      </div>
    </section>
  );
}
