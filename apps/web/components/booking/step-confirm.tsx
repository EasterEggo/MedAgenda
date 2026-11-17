"use client";

import { useId, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServiceTypeBadge } from "@/components/appointments/badges";
import { catalogQueries } from "@/lib/api/queries";
import { localizedName, localizedPreparation } from "@/lib/catalog";
import { buildBookingInput, type BookingInput } from "@/lib/booking/input";
import type { BookingState } from "@/lib/booking/state";
import { formatDateTime } from "@/lib/datetime";
import type { FieldErrors } from "@/lib/validation";

/** Step 6: summary, exam preparation in the active locale, optional notes. */
export function StepConfirm({
  state,
  pending,
  onSubmit,
  onChangeTime,
}: {
  state: BookingState;
  pending: boolean;
  onSubmit: (input: BookingInput) => void;
  onChangeTime: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const notesId = useId();
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const specialties = useQuery({
    ...catalogQueries.specialties(),
    enabled: state.serviceType === "CONSULTATION",
  });
  const exams = useQuery({ ...catalogQueries.exams(), enabled: state.serviceType === "EXAM" });

  const slot = state.slot;
  if (!slot || !state.serviceType) return null;

  const exam = exams.data?.find((e) => e.id === state.catalogId);
  const specialty = specialties.data?.find((s) => s.id === state.catalogId);
  const name = exam
    ? localizedName(exam, locale)
    : specialty
      ? localizedName(specialty, locale)
      : "";
  const preparation = exam ? localizedPreparation(exam, locale) : null;
  const durationMin = Math.round(
    (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000,
  );
  const when = formatDateTime(slot.startsAt, { locale, timeZone: slot.clinic.timezone });

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = buildBookingInput(slot.id, notes);
    setErrors(result.errors);
    if (result.input) onSubmit(result.input);
  };

  return (
    <form onSubmit={onFormSubmit} noValidate className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{t("booking.confirm.title")}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-4 rounded-lg border border-slate-300 bg-card p-5 text-sm">
        <dt className="font-semibold">{t("appointments.detail.service")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <ServiceTypeBadge serviceType={state.serviceType} />
          <span className="font-medium">{name}</span>
        </dd>
        <dt className="font-semibold">{t("appointments.detail.when")}</dt>
        <dd>
          <time dateTime={slot.startsAt}>{when}</time>
        </dd>
        <dt className="font-semibold">{t("appointments.detail.duration")}</dt>
        <dd>{t("booking.catalog.duration", { minutes: durationMin })}</dd>
        <dt className="font-semibold">{t("appointments.detail.professional")}</dt>
        <dd>{slot.provider.name}</dd>
        <dt className="font-semibold">{t("appointments.detail.clinic")}</dt>
        <dd>
          {slot.clinic.name} · {slot.clinic.city}
        </dd>
      </dl>

      {state.serviceType === "EXAM" ? (
        <section aria-labelledby="prep-heading" className="flex flex-col gap-2">
          <h3 id="prep-heading" className="text-base font-semibold">
            {t("appointments.detail.preparation")}
          </h3>
          <p className="rounded-lg border border-slate-300 bg-background p-4 text-sm">
            {preparation || t("appointments.detail.noPreparation")}
          </p>
        </section>
      ) : null}

      <div>
        <Button type="button" variant="link" onClick={onChangeTime}>
          {t("booking.confirm.changeTime")}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId}>{t("booking.confirm.notes")}</Label>
        <Textarea
          id={notesId}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={`${notesId}-hint${errors.notes ? ` ${notesId}-error` : ""}`}
        />
        <p id={`${notesId}-hint`} className="text-sm text-muted">
          {t("booking.confirm.notesHint")}
        </p>
        {errors.notes ? (
          <p id={`${notesId}-error`} className="text-sm font-medium text-danger">
            {t(errors.notes)}
          </p>
        ) : null}
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("booking.confirm.submitting") : t("booking.confirm.submit")}
        </Button>
      </div>
    </form>
  );
}
