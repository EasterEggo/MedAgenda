"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import type { EventClickArg, EventInput, EventMountArg } from "@fullcalendar/core";
import { Alert } from "@/components/ui/alert";
import { AppointmentSheet } from "@/components/appointments/appointment-sheet";
import { appointmentsApi, type Appointment } from "@/lib/api/endpoints";
import { collectAll } from "@/lib/api/pagination";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { appointmentName } from "@/lib/appointments";
import { toWallClockIso } from "@/lib/datetime";

const DAY_MS = 24 * 60 * 60 * 1000;
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin];
const HEADER_TOOLBAR = {
  left: "prev,next today",
  center: "title",
  right: "dayGridMonth,timeGridWeek,listWeek",
};
const NARROW_QUERY = "(max-width: 639px)";

/**
 * Appointments on a FullCalendar month, week or list view.
 * Events show the clinic's wall-clock time. Clicking (or pressing Enter on) an event opens the drawer.
 */
export function CalendarView() {
  const t = useTranslations();
  const locale = useLocale();
  const calendarRef = useRef<FullCalendar | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Phones get the list view: a month grid is unreadable at 375 px.
  useEffect(() => {
    if (window.matchMedia(NARROW_QUERY).matches)
      calendarRef.current?.getApi().changeView("listWeek");
  }, []);

  const loadEvents = useCallback(
    async (range: { start: Date; end: Date }) => {
      // Pad the range by a day: the API takes UTC instants and the browser may be in another zone.
      const from = new Date(range.start.getTime() - DAY_MS).toISOString();
      const to = new Date(range.end.getTime() + DAY_MS).toISOString();
      const rows = await collectAll((cursor) =>
        appointmentsApi.list({ from, to, cursor, limit: 200 }),
      );
      return rows.map((a) => toEvent(a, locale, (key, values) => t(key, values)));
    },
    [locale, t],
  );

  // Stable identity: FullCalendar refetches whenever this prop changes, so an inline arrow would loop.
  const fetchEvents = useCallback(
    (
      range: { start: Date; end: Date },
      success: (events: EventInput[]) => void,
      failure: (error: Error) => void,
    ) => {
      setLoadError(null);
      loadEvents(range).then(success, (error: unknown) => {
        setLoadError(errorMessageKey(toApiError(error).code));
        failure(error instanceof Error ? error : new Error("load failed"));
      });
    },
    [loadEvents],
  );

  function onEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault();
    setSelectedId(String(arg.event.extendedProps.appointmentId));
  }

  function onEventMount(arg: EventMountArg) {
    const el = arg.el;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.dataset.appointmentId = String(arg.event.extendedProps.appointmentId);
    el.setAttribute("aria-label", arg.event.title);
  }

  // Keyboard: Enter or Space on a focused event opens its details.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-appointment-id]");
    if (!target?.dataset.appointmentId) return;
    event.preventDefault();
    setSelectedId(target.dataset.appointmentId);
  }

  function refresh() {
    calendarRef.current?.getApi().refetchEvents();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("calendar.title")}</h1>

      <ul
        aria-label={t("calendar.legend.title")}
        className="flex flex-wrap gap-x-6 gap-y-2 text-sm"
      >
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="evt-swatch evt-consultation" />
          {t("common.serviceType.CONSULTATION")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="evt-swatch evt-exam" />
          {t("common.serviceType.EXAM")}
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="evt-swatch evt-cancelled" />
          {t("calendar.appointments.status.CANCELLED")}
          <span className="text-muted">{t("calendar.legend.cancelled")}</span>
        </li>
      </ul>

      {loadError ? <Alert variant="error">{t(loadError)}</Alert> : null}
      {loading ? (
        <p role="status" className="text-sm text-muted">
          {t("calendar.loading")}
        </p>
      ) : null}

      <div className="rounded-lg border border-slate-300 bg-card p-3 sm:p-5" onKeyDown={onKeyDown}>
        <FullCalendar
          ref={calendarRef}
          plugins={PLUGINS}
          locale={locale === "pt-BR" ? "pt-br" : "en"}
          locales={[ptBrLocale]}
          initialView="dayGridMonth"
          headerToolbar={HEADER_TOOLBAR}
          events={fetchEvents}
          loading={setLoading}
          eventClick={onEventClick}
          eventDidMount={onEventMount}
          noEventsContent={t("calendar.empty")}
          height="auto"
          nowIndicator
        />
      </div>

      {selectedId ? (
        <AppointmentSheet
          key={selectedId}
          appointmentId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  );
}

function toEvent(
  a: Appointment,
  locale: string,
  translate: (key: string, values?: Record<string, string>) => string,
): EventInput {
  const type = translate(`common.serviceType.${a.serviceType}`);
  const label = translate("calendar.eventTitle", {
    type,
    name: appointmentName(a, locale),
    provider: a.provider.name,
  });
  const cancelled = a.status === "CANCELLED";
  const title = cancelled
    ? `${translate(`calendar.appointments.status.${a.status}`)}: ${label}`
    : label;
  const tz = a.clinic.timezone;
  return {
    id: a.id,
    title,
    start: toWallClockIso(a.startsAt, tz),
    end: toWallClockIso(a.endsAt, tz),
    classNames: [
      a.serviceType === "EXAM" ? "evt-exam" : "evt-consultation",
      ...(cancelled ? ["evt-cancelled"] : []),
    ],
    extendedProps: { appointmentId: a.id },
  };
}
