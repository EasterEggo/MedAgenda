"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sessionsApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/datetime";
import { Section } from "./section";

const KEY = ["sessions"] as const;

export function SessionsSection() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: sessionsApi.list });
  const revoke = useMutation({
    mutationFn: sessionsApi.revoke,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const errorCode = query.error
    ? toApiError(query.error).code
    : revoke.error
      ? toApiError(revoke.error).code
      : null;

  return (
    <Section
      id="sessions"
      title={t("settings.sessions.title")}
      description={t("settings.sessions.description")}
    >
      {errorCode ? <Alert variant="error">{t(errorMessageKey(errorCode))}</Alert> : null}
      {query.isPending ? <p role="status">{t("common.loading")}</p> : null}
      <ul className="flex flex-col gap-3">
        {query.data?.sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {s.userAgent || t("settings.sessions.unknownDevice")}
                {s.current ? (
                  <span className="ml-2 rounded bg-primary-bg px-2 py-0.5 text-xs text-primary">
                    {t("settings.sessions.current")}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-muted">
                {t("settings.sessions.lastUsed", {
                  date: formatDateTime(s.lastUsedAt, { locale }),
                })}
              </p>
            </div>
            {s.current ? null : (
              <Button
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(s.id)}
              >
                {t("settings.sessions.revoke")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
