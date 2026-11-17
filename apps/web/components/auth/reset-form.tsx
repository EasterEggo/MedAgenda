"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ResetPasswordSchema } from "@medagenda/shared";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";

export function ResetForm() {
  const t = useTranslations();
  const token = useSearchParams().get("token") ?? "";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirmPassword") ?? "");
    const result = validateForm(ResetPasswordSchema, { token, password });
    const next: FieldErrors = { ...result.errors };
    if (!next.password && password !== confirm)
      next.confirmPassword = "auth.validation.passwordMismatch";
    setErrors(next);
    setServerError(null);
    if (!result.data || Object.keys(next).length > 0) return;
    setPending(true);
    try {
      await authApi.reset(result.data.token, result.data.password);
      setDone(true);
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
        <Alert variant="error">{t("auth.reset.missingToken")}</Alert>
        <Link href="/forgot" className="text-sm text-primary underline underline-offset-4">
          {t("auth.reset.requestLink")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
        <Alert variant="success">{t("auth.reset.success")}</Alert>
        <Link href="/login" className="text-sm text-primary underline underline-offset-4">
          {t("auth.reset.loginLink")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("auth.reset.title")}</h1>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      <FormField
        id="password"
        type="password"
        autoComplete="new-password"
        label={t("auth.reset.password")}
        hint={t("auth.register.passwordHint")}
        error={errors.password ? t(errors.password) : undefined}
      />
      <FormField
        id="confirmPassword"
        type="password"
        autoComplete="new-password"
        label={t("auth.reset.confirmPassword")}
        error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("common.loading") : t("auth.reset.submit")}
      </Button>
    </form>
  );
}
