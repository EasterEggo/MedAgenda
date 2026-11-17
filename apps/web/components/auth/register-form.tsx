"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@medagenda/shared";
import { Link, useRouter } from "@/i18n/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import {
  buildRegisterInput,
  EMPTY_REGISTER_VALUES,
  REGISTER_STEPS,
  validateRegisterStep,
  type RegisterValues,
} from "@/lib/register-steps";
import type { FieldErrors } from "@/lib/validation";

export function RegisterForm() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const step = REGISTER_STEPS[stepIndex]!;
  const isLast = stepIndex === REGISTER_STEPS.length - 1;

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const bind = (field: keyof RegisterValues) => ({
    value: values[field] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value })),
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const stepErrors = validateRegisterStep(step, values);
    setErrors(stepErrors);
    setServerError(null);
    if (Object.keys(stepErrors).length > 0) return;
    if (!isLast) {
      setStepIndex(stepIndex + 1);
      return;
    }
    setPending(true);
    try {
      await authApi.register(buildRegisterInput(values, locale));
      router.replace("/verify-email");
    } catch (error) {
      setServerError(errorMessageKey(toApiError(error).code));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.register.title")}</h1>
        <p className="text-muted" aria-live="polite">
          {t("auth.register.progress", {
            current: stepIndex + 1,
            total: REGISTER_STEPS.length,
            name: t(`auth.register.steps.${step}`),
          })}
        </p>
      </div>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}

      {step === "account" ? (
        <>
          <FormField
            id="email"
            type="email"
            autoComplete="email"
            label={t("auth.register.email")}
            error={err("email")}
            {...bind("email")}
          />
          <FormField
            id="password"
            type="password"
            autoComplete="new-password"
            label={t("auth.register.password")}
            hint={t("auth.register.passwordHint")}
            error={err("password")}
            {...bind("password")}
          />
          <FormField
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            label={t("auth.register.confirmPassword")}
            error={err("confirmPassword")}
            {...bind("confirmPassword")}
          />
        </>
      ) : null}

      {step === "personal" ? (
        <>
          <FormField
            id="fullName"
            autoComplete="name"
            label={t("auth.register.fullName")}
            error={err("fullName")}
            {...bind("fullName")}
          />
          <FormField
            id="cpf"
            inputMode="numeric"
            autoComplete="off"
            label={t("auth.register.cpf")}
            hint={t("auth.register.cpfHint")}
            error={err("cpf")}
            {...bind("cpf")}
          />
          <FormField
            id="birthDate"
            type="date"
            autoComplete="bday"
            label={t("auth.register.birthDate")}
            error={err("birthDate")}
            {...bind("birthDate")}
          />
          <FormField
            id="phone"
            type="tel"
            autoComplete="tel"
            label={t("auth.register.phone")}
            error={err("phone")}
            {...bind("phone")}
          />
        </>
      ) : null}

      {step === "consent" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-lg font-semibold">{t("auth.register.consentTitle")}</legend>
          <p className="text-muted">{t("auth.register.consentText")}</p>
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent"
              checked={values.consent}
              onCheckedChange={(checked) => setValues((v) => ({ ...v, consent: checked === true }))}
              aria-invalid={errors.consentLgpd ? true : undefined}
              aria-describedby={errors.consentLgpd ? "consent-error" : undefined}
            />
            <Label htmlFor="consent" className="text-base">
              {t("auth.register.consentLabel")}
            </Label>
          </div>
          {errors.consentLgpd ? (
            <p id="consent-error" className="text-sm font-medium text-danger">
              {t(errors.consentLgpd)}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex gap-3">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStepIndex(stepIndex - 1)}>
            {t("auth.register.back")}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending} className="flex-1">
          {pending
            ? t("common.loading")
            : isLast
              ? t("auth.register.submit")
              : t("auth.register.next")}
        </Button>
      </div>
      <p className="text-sm">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </form>
  );
}
