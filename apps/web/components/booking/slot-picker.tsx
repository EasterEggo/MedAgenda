"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import type { Slot, SlotsParams } from "@/lib/api/endpoints";
import { slotsQuery } from "@/lib/api/queries";
import { formatDate } from "@/lib/datetime";
import { slotsInCity } from "@/lib/booking/filters";
import { groupSlotsByDay } from "@/lib/booking/group";
import { MAX_WEEK_OFFSET, clampWeekOffset, weekWindow } from "@/lib/booking/week";
import { cn } from "@/lib/utils";

export type SlotFilters = Omit<SlotsParams, "from" | "to" | "cursor" | "limit">;

/**
 * Week view of open slots grouped by day. Each request covers one 7-day window,
 * well inside the API's 31-day limit. Used by the wizard and by reschedule.
 */
export function SlotPicker({
  filters,
  city,
  selectedSlotId,
  onSelect,
}: {
  filters: SlotFilters;
  city: string | null;
  selectedSlotId: string | null;
  onSelect: (slot: Slot) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [offset, setOffset] = useState(0);
  const query = useQuery(slotsQuery(filters, offset));

  const range = weekWindow(offset, new Date());
  const rangeLabel = t("booking.slot.range", {
    start: formatDate(range.from, { locale }),
    end: formatDate(new Date(new Date(range.to).getTime() - 1), { locale }),
  });
  const days = query.data ? groupSlotsByDay(slotsInCity(query.data, city), locale) : [];

  return (
    <section aria-labelledby="slot-picker-heading" className="flex flex-col gap-5">
      <h2 id="slot-picker-heading" className="text-lg font-semibold">
        {t("booking.slot.title")}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setOffset(clampWeekOffset(offset - 1))}
          disabled={offset === 0}
        >
          {t("booking.slot.previous")}
        </Button>
        <p className="text-center font-semibold" aria-live="polite">
          {rangeLabel}
        </p>
        <Button
          variant="outline"
          onClick={() => setOffset(clampWeekOffset(offset + 1))}
          disabled={offset >= MAX_WEEK_OFFSET}
        >
          {t("booking.slot.next")}
        </Button>
      </div>
      <p className="text-sm text-muted">{t("booking.slot.limit")}</p>

      {query.isPending ? (
        <p role="status" className="text-muted">
          {t("booking.slot.loading")}
        </p>
      ) : null}
      {query.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error">{t(errorMessageKey(toApiError(query.error).code))}</Alert>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("common.actions.retry")}
          </Button>
        </div>
      ) : null}
      {query.isSuccess && days.length === 0 ? (
        <p className="text-muted">{t("booking.slot.empty")}</p>
      ) : null}

      {days.map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="flex flex-col gap-2">
          <h3 id={`day-${day.key}`} className="text-base font-semibold capitalize">
            {day.heading}
          </h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {day.options.map((option) => {
              const selected = option.slot.id === selectedSlotId;
              return (
                <li key={option.key}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={t("booking.slot.option", {
                      time: option.time,
                      provider: option.providerName,
                    })}
                    onClick={() => onSelect(option.slot)}
                    className={cn(
                      "flex min-h-14 w-full flex-col items-center justify-center rounded-md border-2 bg-card px-2 py-1 text-center transition-colors hover:border-primary",
                      selected
                        ? "border-primary bg-primary-bg ring-2 ring-primary"
                        : "border-slate-300",
                    )}
                  >
                    <span className="font-semibold">{option.time}</span>
                    <span className="max-w-full truncate text-xs text-muted">
                      {option.providerName}
                    </span>
                    {selected ? (
                      <span className="sr-only">{t("booking.slot.selected")}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
