"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteAccountSchema } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useRouter } from "@/i18n/navigation";
import { meApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { saveBlob } from "@/lib/download";
import { validateForm } from "@/lib/validation";
import { Section } from "./section";

/** LGPD: export everything we hold, or delete the account (password confirmation). */
export function DataSection() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await meApi.exportData();
      saveBlob(blob, filename ?? "medagenda-export.json");
    } catch (e) {
      setError(errorMessageKey(toApiError(e).code));
    } finally {
      setExporting(false);
    }
  }

  async function onDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { data } = validateForm(DeleteAccountSchema, { password });
    setFieldError(data ? null : "auth.validation.required");
    if (!data) return;
    setDeleting(true);
    setError(null);
    try {
      await meApi.deleteAccount(data.password);
      queryClient.clear();
      router.replace("/");
    } catch (e) {
      setError(errorMessageKey(toApiError(e).code));
      setDeleting(false);
    }
  }

  return (
    <Section
      id="data"
      title={t("settings.data.title")}
      description={t("settings.data.description")}
    >
      {error ? <Alert variant="error">{t(error)}</Alert> : null}
      <Button variant="outline" className="self-start" onClick={exportData} disabled={exporting}>
        {exporting ? t("settings.data.exporting") : t("settings.data.export")}
      </Button>
      <hr className="border-border" />
      <h3 className="font-semibold text-danger">{t("settings.data.deleteTitle")}</h3>
      <p className="text-sm text-muted">{t("settings.data.deleteWarning")}</p>
      {confirming ? (
        <form onSubmit={onDelete} noValidate className="flex flex-col gap-4">
          <FormField
            id="delete-password"
            name="password"
            type="password"
            autoComplete="current-password"
            label={t("settings.data.deletePassword")}
            error={fieldError ? t(fieldError) : undefined}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" disabled={deleting}>
              {t("settings.data.deleteConfirm")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="danger" className="self-start" onClick={() => setConfirming(true)}>
          {t("settings.data.delete")}
        </Button>
      )}
    </Section>
  );
}
