"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { googleSubscribeUrl } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { appointmentsApi, calendarApi, type Appointment } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { saveBlob } from "@/lib/download";
import { appointmentName, googleAddUrl } from "@/lib/appointments";

/**
 * The three calendar options: download a single .ics, add this event to Google Calendar,
 * or subscribe to the whole feed. The .ics request is authenticated, so it goes through the API client.
 */
export function CalendarLinks({ appointment }: { appointment: Appointment }) {
  const t = useTranslations();
  const locale = useLocale();
  const [busy, setBusy] = useState<"download" | "subscribe" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const title = t("calendar.eventTitle", {
    type: t(`common.serviceType.${appointment.serviceType}`),
    name: appointmentName(appointment, locale),
    provider: appointment.provider.name,
  });

  async function download() {
    setBusy("download");
    setError(null);
    try {
      const { blob, filename } = await appointmentsApi.downloadIcs(appointment.id);
      saveBlob(blob, filename ?? "consulta.ics");
    } catch (e) {
      setError(errorMessageKey(toApiError(e).code));
    } finally {
      setBusy(null);
    }
  }

  async function subscribe() {
    setBusy("subscribe");
    setError(null);
    try {
      const { url } = await calendarApi.createFeed();
      setFeedUrl(url);
      setCopied(false);
    } catch (e) {
      setError(errorMessageKey(toApiError(e).code));
    } finally {
      setBusy(null);
    }
  }

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section aria-label={t("calendar.links.heading")} className="flex flex-col gap-4">
      {error ? <Alert variant="error">{t(error)}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={download} disabled={busy !== null}>
          {busy === "download" ? t("calendar.links.downloading") : t("calendar.links.download")}
        </Button>
        <a
          href={googleAddUrl(appointment, title, locale)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          {t("calendar.links.addEvent")}
          <span className="sr-only"> {t("calendar.links.newTab")}</span>
        </a>
        {feedUrl ? null : (
          <Button variant="outline" onClick={subscribe} disabled={busy !== null}>
            {busy === "subscribe" ? t("calendar.links.subscribing") : t("calendar.links.subscribe")}
          </Button>
        )}
      </div>
      {feedUrl ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <a
            href={googleSubscribeUrl(feedUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit font-semibold text-primary underline underline-offset-4"
          >
            {t("calendar.links.openSubscription")} {t("calendar.links.newTab")}
          </a>
          <label htmlFor="calendar-feed-url" className="text-sm font-medium">
            {t("calendar.links.feedLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="calendar-feed-url"
              readOnly
              value={feedUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm"
            />
            <Button variant="outline" onClick={copyFeed}>
              {t("calendar.links.copy")}
            </Button>
          </div>
          <p role="status" className="text-sm text-muted">
            {copied ? t("calendar.links.copied") : null}
          </p>
          <p className="text-sm text-muted">{t("calendar.links.instructions")}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("calendar.links.subscribeHelp")}</p>
      )}
    </section>
  );
}
