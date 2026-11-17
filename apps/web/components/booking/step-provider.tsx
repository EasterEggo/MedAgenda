"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { ServiceType } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { catalogQueries } from "@/lib/api/queries";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { providersMatching } from "@/lib/booking/filters";
import { ANY_PROVIDER } from "@/lib/booking/state";

/** Step 4: a specific professional, or "any available" (the first open time). */
export function StepProvider({
  serviceType,
  catalogId,
  city,
  clinicId,
  selectedId,
  onSelect,
}: {
  serviceType: ServiceType;
  catalogId: string;
  city: string | null;
  clinicId: string | null;
  selectedId: string | null;
  onSelect: (providerId: string) => void;
}) {
  const t = useTranslations();
  const providers = useQuery(
    catalogQueries.providers(
      serviceType === "EXAM"
        ? { examTypeId: catalogId, clinicId: clinicId ?? undefined }
        : { specialtyId: catalogId, clinicId: clinicId ?? undefined },
    ),
  );

  if (providers.isPending) {
    return (
      <p role="status" className="text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (providers.isError) {
    return <Alert variant="error">{t(errorMessageKey(toApiError(providers.error).code))}</Alert>;
  }

  const list = providersMatching(providers.data, { city, clinicId });

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-lg font-semibold">{t("booking.provider.title")}</legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-300 bg-card p-4 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary">
        <input
          type="radio"
          name="provider"
          value={ANY_PROVIDER}
          checked={selectedId === ANY_PROVIDER}
          onChange={() => onSelect(ANY_PROVIDER)}
          className="mt-1 size-5 accent-primary"
        />
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{t("booking.provider.any")}</span>
          <span className="text-sm text-muted">{t("booking.provider.anyText")}</span>
        </span>
      </label>
      {list.length === 0 ? <p className="text-muted">{t("booking.provider.empty")}</p> : null}
      {list.map((provider) => {
        const kindLabel =
          provider.kind === "EXAM_RESOURCE"
            ? t("booking.provider.resource")
            : t("booking.provider.doctor");
        const clinicName = provider.clinic.name;
        return (
          <label
            key={provider.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-300 bg-card p-4 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary"
          >
            <input
              type="radio"
              name="provider"
              value={provider.id}
              checked={selectedId === provider.id}
              onChange={() => onSelect(provider.id)}
              className="mt-1 size-5 accent-primary"
            />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{provider.name}</span>
              <span className="text-sm text-muted">
                {kindLabel}
                {provider.crm ? ` · ${t("booking.provider.crm", { crm: provider.crm })}` : ""}
              </span>
              <span className="text-sm text-muted">
                {clinicName} · {provider.clinic.city}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
