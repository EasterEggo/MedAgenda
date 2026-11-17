"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ResendVerificationSchema } from "@medagenda/shared";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";

type Status = "idle" | "checking" | "success" | "error";

export function VerifyEmail() {
  const t = useTranslations();
  const token = useSearchParams().get("token");
  const [status, setStatus] = useState<Status>(token ? "checking" : "idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // tokens are single use: never verify twice (StrictMode)
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((error: unknown) => {
        setServerError(errorMessageKey(toApiError(error).code));
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("auth.verify.title")}</h1>
      {status === "checking" ? <p role="status">{t("auth.verify.checking")}</p> : null}
      {status === "success" ? <Alert variant="success">{t("auth.verify.success")}</Alert> : null}
      {status === "error" && serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      {status === "idle" ? <Alert variant="info">{t("auth.verify.checkInbox")}</Alert> : null}
      {status === "success" ? (
        <Link href="/login" className="text-sm text-primary underline underline-offset-4">
          {t("auth.verify.loginLink")}
        </Link>
      ) : null}
      {status === "idle" || status === "error" ? <ResendForm /> : null}
    </div>
  );
}

function ResendForm() {
  const t = useTranslations();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateForm(ResendVerificationSchema, {
      email: new FormData(event.currentTarget).get("email"),
    });
    setErrors(result.errors);
    setServerError(null);
    if (!result.data) return;
    setPending(true);
    try {
      await authApi.resendVerification(result.data.email);
      setSent(true);
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t("auth.verify.resendTitle")}</h2>
      {sent ? <Alert variant="success">{t("auth.verify.resent")}</Alert> : null}
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      <FormField
        id="email"
        type="email"
        autoComplete="email"
        label={t("auth.verify.email")}
        error={errors.email ? t(errors.email) : undefined}
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? t("common.loading") : t("auth.verify.resend")}
      </Button>
    </form>
  );
}
