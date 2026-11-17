"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { validateForm, type FieldErrors } from "@/lib/validation";
import { toPayload, type EntityConfig, type FieldDef, type FormValues } from "@/lib/admin/entities";

export interface Option {
  value: string;
  label: string;
}

export type OptionSets = Partial<Record<NonNullable<FieldDef["options"]>, Option[]>>;

/** Create / edit form generated from an entity config. Validates with the shared Zod schema. */
export function EntityForm({
  config,
  initial,
  options,
  serverError,
  pending,
  onSubmit,
  onCancel,
}: {
  config: EntityConfig;
  initial: FormValues;
  options: OptionSets;
  serverError: string | null;
  pending: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = (name: string, value: string | string[]) =>
    setValues((v) => ({ ...v, [name]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload = toPayload(config, values);
    const result = validateForm(config.schema, payload);
    setErrors(result.errors);
    if (result.data) onSubmit(payload);
  }

  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined);

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="entity-form"
      className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      {serverError ? <Alert variant="error">{t(serverError)}</Alert> : null}
      {config.fields.map((f) => {
        const id = `field-${f.name}`;
        const label = t(`admin.fields.${f.name}`);
        const value = values[f.name] ?? "";
        if (f.type === "textarea") {
          return (
            <div key={f.name} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{label}</Label>
              <Textarea
                id={id}
                value={value as string}
                aria-invalid={errors[f.name] ? true : undefined}
                onChange={(e) => set(f.name, e.target.value)}
              />
              {err(f.name) ? (
                <p className="text-sm font-medium text-danger">{err(f.name)}</p>
              ) : null}
            </div>
          );
        }
        if (f.type === "select") {
          const list = (f.options && options[f.options]) || [];
          return (
            <div key={f.name} className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{label}</Label>
              <Select
                id={id}
                value={value as string}
                aria-invalid={errors[f.name] ? true : undefined}
                onChange={(e) => set(f.name, e.target.value)}
              >
                <option value="">{t("admin.choose")}</option>
                {list.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {err(f.name) ? (
                <p className="text-sm font-medium text-danger">{err(f.name)}</p>
              ) : null}
            </div>
          );
        }
        if (f.type === "multi") {
          const list = (f.options && options[f.options]) || [];
          const selected = value as string[];
          return (
            <fieldset key={f.name} className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{label}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${o.value}`}
                      checked={selected.includes(o.value)}
                      onCheckedChange={(c) =>
                        set(
                          f.name,
                          c === true
                            ? [...selected, o.value]
                            : selected.filter((x) => x !== o.value),
                        )
                      }
                    />
                    <Label htmlFor={`${id}-${o.value}`}>{o.label}</Label>
                  </div>
                ))}
              </div>
            </fieldset>
          );
        }
        return (
          <FormField
            key={f.name}
            id={id}
            name={f.name}
            type={f.type === "number" ? "number" : "text"}
            label={label}
            hint={f.hint ? t(`admin.hints.${f.hint}`) : undefined}
            value={value as string}
            error={err(f.name)}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );
      })}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {t("common.actions.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.actions.cancel")}
        </Button>
      </div>
    </form>
  );
}
