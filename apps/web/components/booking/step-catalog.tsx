"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import type { ServiceType } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogQueries } from "@/lib/api/queries";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { localizedName, matchesQuery } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { CatalogIcon } from "./catalog-icon";

interface CatalogOption {
  id: string;
  slug: string;
  namePt: string;
  nameEn: string;
  durationMin?: number;
}

/** Step 2: searchable grid of specialties (consultation) or exam types (exam). */
export function StepCatalog({
  serviceType,
  selectedId,
  onSelect,
}: {
  serviceType: ServiceType;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const searchId = useId();
  const [query, setQuery] = useState("");

  const specialties = useQuery({
    ...catalogQueries.specialties(),
    enabled: serviceType === "CONSULTATION",
  });
  const exams = useQuery({ ...catalogQueries.exams(), enabled: serviceType === "EXAM" });
  const active = serviceType === "EXAM" ? exams : specialties;

  const options: CatalogOption[] =
    serviceType === "EXAM"
      ? (exams.data ?? []).map((e) => ({
          id: e.id,
          slug: e.slug,
          namePt: e.namePt,
          nameEn: e.nameEn,
          durationMin: e.durationMin,
        }))
      : (specialties.data ?? []).map((s) => ({
          id: s.id,
          slug: s.slug,
          namePt: s.namePt,
          nameEn: s.nameEn,
        }));
  const visible = options.filter((o) => matchesQuery(localizedName(o, locale), query));

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">
        {serviceType === "EXAM"
          ? t("booking.catalog.examTitle")
          : t("booking.catalog.specialtyTitle")}
      </h2>
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor={searchId}>{t("booking.catalog.search")}</Label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      {active.isPending ? (
        <p role="status" className="text-muted">
          {t("common.loading")}
        </p>
      ) : null}
      {active.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error">{t(errorMessageKey(toApiError(active.error).code))}</Alert>
          <Button variant="outline" onClick={() => void active.refetch()}>
            {t("common.actions.retry")}
          </Button>
        </div>
      ) : null}
      {active.isSuccess && visible.length === 0 ? (
        <p className="text-muted">{t("booking.catalog.empty")}</p>
      ) : null}
      <div
        role="group"
        aria-label={t("booking.steps.catalog")}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visible.map((option) => {
          const selected = option.id === selectedId;
          const name = localizedName(option, locale);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(option.id)}
              className={cn(
                "flex min-h-28 flex-col items-start gap-2 rounded-lg border-2 bg-card p-4 text-left transition-colors hover:border-primary",
                selected ? "border-primary ring-2 ring-primary" : "border-slate-300",
              )}
            >
              <span className="flex w-full items-center justify-between">
                <CatalogIcon slug={option.slug} serviceType={serviceType} />
                {selected ? (
                  <CircleCheck aria-hidden="true" className="size-6 text-primary" />
                ) : null}
              </span>
              <span className="font-semibold">{name}</span>
              {option.durationMin ? (
                <span className="text-sm text-muted">
                  {t("booking.catalog.duration", { minutes: option.durationMin })}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
