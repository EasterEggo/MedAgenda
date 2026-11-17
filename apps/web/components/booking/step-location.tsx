"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { catalogQueries } from "@/lib/api/queries";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { clinicsInCity, uniqueCities } from "@/lib/booking/filters";

/** Step 3 (optional): city, then clinic inside that city. "All" leaves the filter open. */
export function StepLocation({
  city,
  clinicId,
  onCity,
  onClinic,
}: {
  city: string | null;
  clinicId: string | null;
  onCity: (city: string | null) => void;
  onClinic: (clinicId: string | null) => void;
}) {
  const t = useTranslations();
  const cityId = useId();
  const clinicSelectId = useId();
  const clinics = useQuery(catalogQueries.clinics());

  if (clinics.isPending) {
    return (
      <p role="status" className="text-muted">
        {t("common.loading")}
      </p>
    );
  }
  if (clinics.isError) {
    return <Alert variant="error">{t(errorMessageKey(toApiError(clinics.error).code))}</Alert>;
  }

  const all = clinics.data;
  const cities = uniqueCities(all);
  const options = clinicsInCity(all, city);

  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="text-lg font-semibold">{t("booking.location.title")}</legend>
      <p className="text-sm text-muted">{t("booking.location.hint")}</p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={cityId}>{t("booking.location.city")}</Label>
          <Select id={cityId} value={city ?? ""} onChange={(e) => onCity(e.target.value || null)}>
            <option value="">{t("booking.location.allCities")}</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={clinicSelectId}>{t("booking.location.clinic")}</Label>
          <Select
            id={clinicSelectId}
            value={clinicId ?? ""}
            onChange={(e) => onClinic(e.target.value || null)}
          >
            <option value="">{t("booking.location.allClinics")}</option>
            {options.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
