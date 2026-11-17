"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UpdateProfileSchema } from "@medagenda/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ME_QUERY_KEY } from "@/components/auth/use-me";
import { meApi, type MeResponse } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { validateForm, type FieldErrors } from "@/lib/validation";
import { Section } from "./section";

/** Editable profile fields (name, birth date, phone, health insurance). Email and CPF are read-only. */
export function ProfileSection({ me }: { me: MeResponse }) {
  const t = useTranslations("settings.profile");
  const tAll = useTranslations();
  const queryClient = useQueryClient();
  const profile = me.profile;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: meApi.update,
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      setSaved(true);
    },
    onError: (e) => setServerError(errorMessageKey(toApiError(e).code)),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setServerError(null);
    const form = new FormData(event.currentTarget);
    const insurance = String(form.get("healthInsurance") ?? "").trim();
    const { data, errors: found } = validateForm(UpdateProfileSchema, {
      fullName: String(form.get("fullName") ?? ""),
      birthDate: String(form.get("birthDate") ?? ""),
      phone: String(form.get("phone") ?? ""),
      healthInsurance: insurance === "" ? null : insurance,
    });
    setErrors(found);
    if (data) mutation.mutate(data);
  }

  const err = (field: string) => (errors[field] ? tAll(errors[field]) : undefined);

  return (
    <Section id="profile" title={t("title")} description={t("description")}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {serverError ? <Alert variant="error">{tAll(serverError)}</Alert> : null}
        {saved ? <Alert variant="success">{t("saved")}</Alert> : null}
        <FormField id="email" label={t("email")} value={me.email} readOnly disabled />
        <FormField
          id="fullName"
          label={t("fullName")}
          defaultValue={profile?.fullName ?? ""}
          autoComplete="name"
          error={err("fullName")}
        />
        <FormField
          id="birthDate"
          type="date"
          label={t("birthDate")}
          defaultValue={profile?.birthDate ?? ""}
          autoComplete="bday"
          error={err("birthDate")}
        />
        <FormField
          id="phone"
          type="tel"
          label={t("phone")}
          defaultValue={profile?.phone ?? ""}
          autoComplete="tel"
          error={err("phone")}
        />
        <FormField
          id="healthInsurance"
          label={t("healthInsurance")}
          defaultValue={profile?.healthInsurance ?? ""}
          error={err("healthInsurance")}
        />
        <Button type="submit" disabled={mutation.isPending} className="self-start">
          {mutation.isPending ? tAll("common.loading") : tAll("common.actions.save")}
        </Button>
      </form>
    </Section>
  );
}
