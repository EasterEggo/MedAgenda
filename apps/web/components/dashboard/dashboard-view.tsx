"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Stethoscope } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppointmentItem } from "@/components/appointments/appointment-item";
import { Link } from "@/i18n/navigation";
import { appointmentsApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";

/** Dashboard: the next few scheduled appointments and quick links to book. */
export function DashboardView() {
  const t = useTranslations();
  const upcoming = useQuery({
    queryKey: ["appointments", "upcoming", "dashboard"],
    queryFn: () =>
      appointmentsApi.list({
        from: new Date().toISOString(),
        status: "SCHEDULED",
        limit: 5,
      }),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t("common.dashboard.title")}</h1>
        <p className="text-muted">{t("common.dashboard.welcome")}</p>
      </div>

      <section aria-labelledby="quick-book-heading" className="flex flex-col gap-3">
        <h2 id="quick-book-heading" className="text-lg font-semibold">
          {t("common.dashboard.quickBook")}
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href={{ pathname: "/app/book", query: { type: "CONSULTATION" } }}
            className={buttonVariants()}
          >
            <Stethoscope aria-hidden="true" className="size-5" />
            {t("common.dashboard.bookConsultation")}
          </Link>
          <Link
            href={{ pathname: "/app/book", query: { type: "EXAM" } }}
            className={buttonVariants({ variant: "outline" })}
          >
            <FlaskConical aria-hidden="true" className="size-5" />
            {t("common.dashboard.bookExam")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="upcoming-heading" className="text-lg font-semibold">
            {t("common.dashboard.upcoming")}
          </h2>
          <Link
            href="/app/appointments"
            className="font-semibold text-primary underline underline-offset-4"
          >
            {t("common.dashboard.viewAll")}
          </Link>
        </div>
        {upcoming.isPending ? (
          <p role="status" className="text-muted">
            {t("common.loading")}
          </p>
        ) : null}
        {upcoming.isError ? (
          <Alert variant="error">{t(errorMessageKey(toApiError(upcoming.error).code))}</Alert>
        ) : null}
        {upcoming.isSuccess && upcoming.data.items.length === 0 ? (
          <Card>
            <p className="text-muted">{t("common.dashboard.empty")}</p>
          </Card>
        ) : null}
        <ul className="flex flex-col gap-3">
          {upcoming.data?.items.map((appointment) => (
            <li key={appointment.id}>
              <AppointmentItem appointment={appointment} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
