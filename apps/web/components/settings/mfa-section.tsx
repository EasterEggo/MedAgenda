"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { MfaDisableSchema, MfaEnableSchema } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { ME_QUERY_KEY } from "@/components/auth/use-me";
import { mfaApi, type MeResponse } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";
import { Section } from "./section";

interface Setup {
  otpauthUri: string;
  qrDataUrl: string;
}

/** Manual-entry secret from an otpauth:// URI. */
export function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

/** Two-factor lifecycle: set up (QR + code), recovery codes shown once, disable. */
export function MfaSection({ me }: { me: MeResponse }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });

  async function run(action: () => Promise<void>) {
    setServerError(null);
    setPending(true);
    try {
      await action();
    } catch (e) {
      setServerError(errorMessageKey(toApiError(e).code));
    } finally {
      setPending(false);
    }
  }

  const startSetup = () => run(async () => setSetup(await mfaApi.setup()));

  function onEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    const { data, errors: found } = validateForm(MfaEnableSchema, { code });
    setErrors(found.code ? { code: "auth.validation.codeFormat" } : {});
    if (!data) return;
    void run(async () => {
      const { recoveryCodes: codes } = await mfaApi.enable(data.code);
      setRecoveryCodes(codes);
      setSaved(false);
      setSetup(null);
      await refreshMe();
    });
  }

  function onDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { data, errors: found } = validateForm(MfaDisableSchema, {
      password: String(form.get("password") ?? ""),
      code: String(form.get("code") ?? ""),
    });
    setErrors(found.code ? { ...found, code: "auth.validation.codeFormat" } : found);
    if (!data) return;
    void run(async () => {
      await mfaApi.disable(data);
      await refreshMe();
    });
  }

  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const title = t("settings.mfa.title");

  // Recovery codes are shown once. They stay on screen until the user confirms they saved them.
  if (recoveryCodes) {
    return (
      <Section id="mfa" title={title} description={t("settings.mfa.enabledDescription")}>
        <Alert variant="success">{t("settings.mfa.enabledSuccess")}</Alert>
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <h3 className="font-semibold">{t("settings.mfa.recoveryTitle")}</h3>
          <p className="text-sm text-muted">{t("settings.mfa.recoveryWarning")}</p>
          <ul data-testid="recovery-codes" className="grid gap-2 font-mono sm:grid-cols-2">
            {recoveryCodes.map((c) => (
              <li key={c} className="rounded bg-slate-100 px-3 py-1.5">
                {c}
              </li>
            ))}
          </ul>
          <div className="flex items-start gap-3">
            <Checkbox
              id="recovery-saved"
              checked={saved}
              onCheckedChange={(v) => setSaved(v === true)}
            />
            <Label htmlFor="recovery-saved" className="text-base">
              {t("settings.mfa.recoverySaved")}
            </Label>
          </div>
          <Button
            className="self-start"
            disabled={!saved}
            onClick={() => {
              setRecoveryCodes(null);
              setSaved(false);
            }}
          >
            {t("settings.mfa.recoveryDone")}
          </Button>
        </div>
      </Section>
    );
  }

  if (me.totpEnabled) {
    return (
      <Section id="mfa" title={title} description={t("settings.mfa.enabledDescription")}>
        {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
        <form onSubmit={onDisable} noValidate className="flex flex-col gap-4">
          <h3 className="font-semibold">{t("settings.mfa.disableTitle")}</h3>
          <p className="text-sm text-muted">{t("settings.mfa.disableHelp")}</p>
          <FormField
            id="mfa-disable-password"
            name="password"
            type="password"
            autoComplete="current-password"
            label={t("settings.mfa.password")}
            error={err("password")}
          />
          <FormField
            id="mfa-disable-code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            label={t("settings.mfa.code")}
            error={err("code")}
          />
          <Button type="submit" variant="danger" disabled={pending} className="self-start">
            {t("settings.mfa.disable")}
          </Button>
        </form>
      </Section>
    );
  }

  return (
    <Section id="mfa" title={title} description={t("settings.mfa.description")}>
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      {setup ? (
        <form onSubmit={onEnable} noValidate className="flex flex-col gap-4">
          <p>{t("settings.mfa.scanInstructions")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, nothing to optimise */}
          <img
            src={setup.qrDataUrl}
            alt={t("settings.mfa.qrAlt")}
            width={200}
            height={200}
            className="rounded border border-border bg-white"
          />
          <FormField
            id="mfa-secret"
            label={t("settings.mfa.manualSecret")}
            hint={t("settings.mfa.manualHint")}
            value={secretFromUri(setup.otpauthUri)}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <FormField
            id="mfa-uri"
            label={t("settings.mfa.otpauthUri")}
            value={setup.otpauthUri}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <FormField
            id="mfa-code"
            name="code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            label={t("settings.mfa.code")}
            error={err("code")}
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>
              {t("settings.mfa.enable")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSetup(null)}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button className="self-start" onClick={startSetup} disabled={pending}>
          {t("settings.mfa.start")}
        </Button>
      )}
    </Section>
  );
}
