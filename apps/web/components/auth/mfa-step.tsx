"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { MfaEnableSchema, MfaVerifySchema } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm } from "@/lib/validation";

/** Second login step: a TOTP code or a single-use recovery code. */
export function MfaStep({ onSuccess }: { onSuccess: () => Promise<void> | void }) {
  const t = useTranslations();
  const [useRecovery, setUseRecovery] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("mfa") ?? "");
    setServerError(null);
    const result = useRecovery
      ? validateForm(MfaVerifySchema, { recoveryCode: value })
      : validateForm(MfaEnableSchema, { code: value });
    if (!result.data) {
      setFieldError(useRecovery ? "auth.validation.required" : "auth.validation.codeFormat");
      return;
    }
    setFieldError(null);
    setPending(true);
    try {
      await authApi.verifyMfa(
        useRecovery ? { recoveryCode: value.trim() } : { code: value.trim() },
      );
      await onSuccess();
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.mfa.title")}</h1>
        <p className="text-muted">
          {useRecovery ? t("auth.mfa.recoveryDescription") : t("auth.mfa.description")}
        </p>
      </div>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      <FormField
        // Remount when switching mode so the field starts empty.
        key={useRecovery ? "recovery" : "totp"}
        id="mfa"
        autoFocus
        autoComplete="one-time-code"
        inputMode={useRecovery ? "text" : "numeric"}
        maxLength={useRecovery ? 32 : 6}
        label={useRecovery ? t("auth.mfa.recoveryCode") : t("auth.mfa.code")}
        error={fieldError ? t(fieldError) : undefined}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t("common.loading") : t("auth.mfa.submit")}
      </Button>
      <Button
        type="button"
        variant="link"
        className="self-start"
        onClick={() => {
          setUseRecovery((v) => !v);
          setFieldError(null);
          setServerError(null);
        }}
      >
        {useRecovery ? t("auth.mfa.useTotp") : t("auth.mfa.useRecovery")}
      </Button>
    </form>
  );
}
