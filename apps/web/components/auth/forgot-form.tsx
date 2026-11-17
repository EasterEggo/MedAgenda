"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ForgotPasswordSchema } from "@medagenda/shared";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";

export function ForgotForm() {
  const t = useTranslations();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateForm(ForgotPasswordSchema, {
      email: new FormData(event.currentTarget).get("email"),
    });
    setErrors(result.errors);
    setServerError(null);
    if (!result.data) return;
    setPending(true);
    try {
      await authApi.forgot(result.data.email);
      setSent(true);
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.forgot.title")}</h1>
        <p className="text-muted">{t("auth.forgot.subtitle")}</p>
      </div>
      {sent ? <Alert variant="success">{t("auth.forgot.sent")}</Alert> : null}
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      <FormField
        id="email"
        type="email"
        autoComplete="email"
        label={t("auth.forgot.email")}
        error={errors.email ? t(errors.email) : undefined}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("common.loading") : t("auth.forgot.submit")}
      </Button>
      <Link href="/login" className="text-sm text-primary underline underline-offset-4">
        {t("auth.forgot.backToLogin")}
      </Link>
    </form>
  );
}
