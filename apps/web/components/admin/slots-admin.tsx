"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { adminApi, type AdminSlot, type Provider } from "@/lib/api/endpoints";
import { catalogQueries } from "@/lib/api/queries";
import { collectAll } from "@/lib/api/pagination";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/datetime";
import { EMPTY_SLOT_FORM, validateSlotForm, type SlotFormValues } from "@/lib/admin/slot-form";
import type { FieldErrors } from "@/lib/validation";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Slot generator plus a block / unblock list for one provider. */
export function SlotsAdmin() {
  const t = useTranslations();
  const locale = useLocale();
  const providers = useQuery(catalogQueries.providers({}));
  const specialties = useQuery(catalogQueries.specialties());
  const exams = useQuery(catalogQueries.exams());
  const pick = (pt: string, en: string) => (locale === "pt-BR" ? pt : en);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{t("admin.sections.slots")}</h1>
      <Generator
        providers={providers.data ?? []}
        specialties={(specialties.data ?? []).map((s) => ({
          value: s.id,
          label: pick(s.namePt, s.nameEn),
        }))}
        exams={(exams.data ?? []).map((e) => ({ value: e.id, label: pick(e.namePt, e.nameEn) }))}
      />
      <SlotList providers={providers.data ?? []} />
    </div>
  );
}

interface Opt {
  value: string;
  label: string;
}

function ProviderSelect({
  id,
  providers,
  value,
  onChange,
  error,
}: {
  id: string;
  providers: Provider[];
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
}) {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("fields.providerId")}</Label>
      <Select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("choose")}</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.clinic.name})
          </option>
        ))}
      </Select>
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </div>
  );
}

function Generator({
  providers,
  specialties,
  exams,
}: {
  providers: Provider[];
  specialties: Opt[];
  exams: Opt[];
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SlotFormValues>(() => ({
    ...EMPTY_SLOT_FORM,
    from: today(),
    to: addDays(today(), 13),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const mutation = useMutation({
    mutationFn: adminApi.generateSlots,
    onSuccess: async (r) => {
      setResult(r);
      await queryClient.invalidateQueries({ queryKey: ["admin-slots"] });
    },
    onError: (e) => setServerError(errorMessageKey(toApiError(e).code)),
  });

  const set = <K extends keyof SlotFormValues>(key: K, value: SlotFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined);
  // A provider can only get slots for what it offers: narrow the choices once one is picked.
  const chosen = providers.find((p) => p.id === values.providerId);
  const specialtyChoices = chosen
    ? specialties.filter((o) => chosen.specialtyIds.includes(o.value))
    : specialties;
  const examChoices = chosen ? exams.filter((o) => chosen.examTypeIds.includes(o.value)) : exams;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setServerError(null);
    const { data, errors: found } = validateSlotForm(values);
    setErrors(found);
    if (data) mutation.mutate(data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid="slot-generator"
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-xl font-bold">{t("admin.slots.generateTitle")}</h2>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      {errors._form ? <Alert variant="error">{t(errors._form)}</Alert> : null}
      {result ? (
        <Alert variant="success">
          {t("admin.slots.generated", { created: result.created, skipped: result.skipped })}
        </Alert>
      ) : null}
      <ProviderSelect
        id="gen-provider"
        providers={providers}
        value={values.providerId}
        onChange={(v) =>
          setValues((prev) => ({ ...prev, providerId: v, specialtyId: "", examTypeId: "" }))
        }
        error={err("providerId")}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("admin.fields.weekdays")}</legend>
        <div className="flex flex-wrap gap-4">
          {WEEKDAYS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <Checkbox
                id={`weekday-${d}`}
                checked={values.weekdays.includes(d)}
                onCheckedChange={(c) =>
                  set(
                    "weekdays",
                    c === true ? [...values.weekdays, d] : values.weekdays.filter((x) => x !== d),
                  )
                }
              />
              <Label htmlFor={`weekday-${d}`}>{t(`admin.weekdays.${d}`)}</Label>
            </div>
          ))}
        </div>
        {err("weekdays") ? (
          <p className="text-sm font-medium text-danger">{err("weekdays")}</p>
        ) : null}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id="gen-start"
          type="time"
          label={t("admin.fields.startTime")}
          value={values.startTime}
          error={err("startTime")}
          onChange={(e) => set("startTime", e.target.value)}
        />
        <FormField
          id="gen-end"
          type="time"
          label={t("admin.fields.endTime")}
          value={values.endTime}
          error={err("endTime")}
          onChange={(e) => set("endTime", e.target.value)}
        />
        <FormField
          id="gen-duration"
          type="number"
          label={t("admin.fields.durationMin")}
          value={values.durationMin}
          error={err("durationMin")}
          onChange={(e) => set("durationMin", e.target.value)}
        />
        <FormField
          id="gen-from"
          type="date"
          label={t("admin.fields.from")}
          value={values.from}
          error={err("from")}
          onChange={(e) => set("from", e.target.value)}
        />
        <FormField
          id="gen-to"
          type="date"
          label={t("admin.fields.to")}
          value={values.to}
          error={err("to")}
          onChange={(e) => set("to", e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-service">{t("admin.fields.serviceType")}</Label>
          <Select
            id="gen-service"
            value={values.serviceType}
            onChange={(e) => set("serviceType", e.target.value as SlotFormValues["serviceType"])}
          >
            <option value="CONSULTATION">{t("common.serviceType.CONSULTATION")}</option>
            <option value="EXAM">{t("common.serviceType.EXAM")}</option>
          </Select>
        </div>
      </div>
      {values.serviceType === "CONSULTATION" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-specialty">{t("admin.fields.specialtyId")}</Label>
          <Select
            id="gen-specialty"
            value={values.specialtyId}
            aria-invalid={errors.specialtyId ? true : undefined}
            onChange={(e) => set("specialtyId", e.target.value)}
          >
            <option value="">{t("admin.choose")}</option>
            {specialtyChoices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gen-exam">{t("admin.fields.examTypeId")}</Label>
          <Select
            id="gen-exam"
            value={values.examTypeId}
            aria-invalid={errors.examTypeId ? true : undefined}
            onChange={(e) => set("examTypeId", e.target.value)}
          >
            <option value="">{t("admin.choose")}</option>
            {examChoices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Button type="submit" disabled={mutation.isPending} className="self-start">
        {t("admin.slots.generate")}
      </Button>
    </form>
  );
}

function SlotList({ providers }: { providers: Provider[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => addDays(today(), 6));

  const params = { providerId, from, to };
  const slots = useQuery({
    queryKey: ["admin-slots", params],
    enabled: providerId !== "" && from !== "" && to !== "",
    queryFn: () => collectAll((cursor) => adminApi.slots({ ...params, cursor })),
  });
  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "OPEN" | "BLOCKED" }) =>
      adminApi.setSlotStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-slots"] }),
  });
  const errorCode = slots.error
    ? toApiError(slots.error).code
    : toggle.error
      ? toApiError(toggle.error).code
      : null;

  const timeZone = providers.find((p) => p.id === providerId)?.clinic.timezone;

  return (
    <section
      aria-labelledby="slot-list-title"
      data-testid="slot-list"
      className="flex flex-col gap-4"
    >
      <h2 id="slot-list-title" className="text-xl font-bold">
        {t("admin.slots.listTitle")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <ProviderSelect
          id="list-provider"
          providers={providers}
          value={providerId}
          onChange={setProviderId}
        />
        <FormField
          id="list-from"
          type="date"
          label={t("admin.fields.from")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <FormField
          id="list-to"
          type="date"
          label={t("admin.fields.to")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {errorCode ? <Alert variant="error">{t(errorMessageKey(errorCode))}</Alert> : null}
      {providerId === "" ? <p className="text-muted">{t("admin.slots.pickProvider")}</p> : null}
      {slots.data && slots.data.length === 0 ? (
        <p className="text-muted">{t("admin.slots.empty")}</p>
      ) : null}
      {slots.data && slots.data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <caption className="sr-only">{t("admin.slots.listTitle")}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2">
                  {t("admin.slots.when")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("admin.slots.status")}
                </th>
                <th scope="col" className="px-3 py-2">
                  {t("admin.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.data.map((s: AdminSlot) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    {formatDateTime(s.startsAt, { locale, ...(timeZone ? { timeZone } : {}) })}
                  </td>
                  <td className="px-3 py-2">{t(`admin.slots.statuses.${s.status}`)}</td>
                  <td className="px-3 py-2">
                    {s.status === "BOOKED" ? null : (
                      <Button
                        variant="outline"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({
                            id: s.id,
                            status: s.status === "OPEN" ? "BLOCKED" : "OPEN",
                          })
                        }
                      >
                        {s.status === "OPEN" ? t("admin.slots.block") : t("admin.slots.unblock")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
