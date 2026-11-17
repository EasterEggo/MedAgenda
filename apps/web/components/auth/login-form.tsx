"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LoginSchema } from "@medagenda/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";
import { MfaStep } from "./mfa-step";
import { ME_QUERY_KEY } from "./use-me";

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // /app redirects here with ?mfa=1 when the session still needs the second factor.
  const [step, setStep] = useState<"credentials" | "mfa">(
    searchParams.get("mfa") === "1" ? "mfa" : "credentials",
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    router.replace("/app");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = validateForm(LoginSchema, {
      email: form.get("email"),
      password: form.get("password"),
    });
    setErrors(result.errors);
    setServerError(null);
    if (!result.data) return;
    setPending(true);
    try {
      const login = await authApi.login(result.data.email, result.data.password);
      if (login.mfaRequired) setStep("mfa");
      else await finish();
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  if (step === "mfa") return <MfaStep onSuccess={finish} />;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
        <p className="text-muted">{t("auth.login.subtitle")}</p>
      </div>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      <FormField
        id="email"
        type="email"
        autoComplete="username"
        label={t("auth.login.email")}
        error={errors.email ? t(errors.email) : undefined}
      />
      <FormField
        id="password"
        type="password"
        autoComplete="current-password"
        label={t("auth.login.password")}
        error={errors.password ? t(errors.password) : undefined}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("common.loading") : t("auth.login.submit")}
      </Button>
      <div className="flex flex-col gap-1 text-sm">
        <Link href="/forgot" className="text-primary underline underline-offset-4">
          {t("auth.login.forgot")}
        </Link>
        <p>
          {t("auth.login.noAccount")}{" "}
          <Link href="/register" className="text-primary underline underline-offset-4">
            {t("auth.login.registerLink")}
          </Link>
        </p>
      </div>
    </form>
  );
}
