"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { googleSubscribeUrl } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { calendarApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { Section } from "./section";

const STEPS = ["step1", "step2", "step3", "step4"] as const;

/** Calendar feed: the URL is only returned when created or rotated, so it is shown right then. */
export function FeedSection() {
  const t = useTranslations();
  const [url, setUrl] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessageKey(toApiError(e).code));
    } finally {
      setPending(false);
    }
  }

  const create = () =>
    run(async () => {
      setUrl((await calendarApi.createFeed()).url);
      setRevoked(false);
      setCopied(false);
    });
  const revoke = () =>
    run(async () => {
      await calendarApi.revokeFeed();
      setUrl(null);
      setRevoked(true);
    });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Section
      id="feed"
      title={t("settings.feed.title")}
      description={t("settings.feed.description")}
    >
      {error ? <Alert variant="error">{t(error)}</Alert> : null}
      {revoked ? <Alert variant="info">{t("settings.feed.revoked")}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={create} disabled={pending} variant={url ? "outline" : "default"}>
          {url ? t("settings.feed.rotate") : t("settings.feed.create")}
        </Button>
        <Button variant="outline" onClick={revoke} disabled={pending}>
          {t("settings.feed.revoke")}
        </Button>
      </div>
      {url ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <label htmlFor="settings-feed-url" className="text-sm font-medium">
            {t("settings.feed.urlLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="settings-feed-url"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm"
            />
            <Button variant="outline" onClick={copy}>
              {t("settings.feed.copy")}
            </Button>
          </div>
          <p role="status" className="text-sm text-muted">
            {copied ? t("settings.feed.copied") : null}
          </p>
          <a
            href={googleSubscribeUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "default", className: "w-fit" })}
          >
            {t("settings.feed.subscribeGoogle")}
            <span className="sr-only"> {t("settings.feed.newTab")}</span>
          </a>
          <Alert variant="info">{t("settings.feed.localWarning")}</Alert>
        </div>
      ) : null}
      <div>
        <h3 className="font-semibold">{t("settings.feed.howTitle")}</h3>
        <ol className="list-decimal pl-6 text-sm">
          {STEPS.map((s) => (
            <li key={s}>{t(`settings.feed.${s}`)}</li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
