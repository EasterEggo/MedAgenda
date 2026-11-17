"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { appointmentsApi, type Appointment } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import {
  appointmentListParams,
  appointmentsForFilter,
  type AppointmentFilter,
} from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { AppointmentItem } from "./appointment-item";
import { AppointmentSheet } from "./appointment-sheet";

const FILTERS: AppointmentFilter[] = ["upcoming", "past", "cancelled"];
const PAGE_SIZE = 20;

/** Appointment list with upcoming / past / cancelled filters and cursor pagination ("Load more"). */
export function AppointmentsList() {
  const t = useTranslations();
  const [filter, setFilter] = useState<AppointmentFilter>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["appointments", "list", filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      appointmentsApi.list({
        ...appointmentListParams(filter, new Date()),
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items: Appointment[] = appointmentsForFilter(
    query.data?.pages.flatMap((p) => p.items) ?? [],
    filter,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("appointments.title")}</h1>

      <div role="group" aria-label={t("appointments.filterLabel")} className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <Button
            key={value}
            variant="outline"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(filter === value && "border-primary bg-primary-bg text-primary")}
          >
            {t(`appointments.filters.${value}`)}
          </Button>
        ))}
      </div>

      {query.isPending ? (
        <p role="status" className="text-muted">
          {t("common.loading")}
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
      {query.isSuccess && items.length === 0 && !query.hasNextPage ? (
        <p className="text-muted">{t(`appointments.empty.${filter}`)}</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {items.map((appointment) => (
          <li key={appointment.id}>
            <AppointmentItem appointment={appointment} onOpen={setSelectedId} />
          </li>
        ))}
      </ul>

      {query.hasNextPage ? (
        <div>
          <Button
            variant="outline"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? t("common.loading") : t("common.actions.loadMore")}
          </Button>
        </div>
      ) : null}

      {selectedId ? (
        <AppointmentSheet
          key={selectedId}
          appointmentId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
