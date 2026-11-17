"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { catalogQueries } from "@/lib/api/queries";
import { adminApi, type AdminEntity } from "@/lib/api/endpoints";
import { errorMessageKey, toApiError } from "@/lib/api/client";
import { ENTITIES, emptyValues, toFormValues } from "@/lib/admin/entities";
import { EntityForm, type OptionSets } from "./entity-form";

type Row = Record<string, unknown> & { id: string };

function useRows(entity: AdminEntity) {
  const specialties = useQuery(catalogQueries.specialties());
  const exams = useQuery(catalogQueries.exams());
  const clinics = useQuery(catalogQueries.clinics());
  const providers = useQuery(catalogQueries.providers({}));
  const map = { specialties, exams, clinics, providers };
  return { rows: map[entity], specialties, exams, clinics };
}

/** CRUD table for one catalog entity: list, create, edit, delete (with inline confirmation). */
export function EntityAdmin({ entity }: { entity: AdminEntity }) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const config = ENTITIES[entity];
  const { rows, specialties, exams, clinics } = useRows(entity);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const pick = (pt: string, en: string) => (locale === "pt-BR" ? pt : en);
  const options: OptionSets = {
    clinics: (clinics.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    specialties: (specialties.data ?? []).map((s) => ({
      value: s.id,
      label: pick(s.namePt, s.nameEn),
    })),
    exams: (exams.data ?? []).map((e) => ({ value: e.id, label: pick(e.namePt, e.nameEn) })),
    providerKinds: (["DOCTOR", "EXAM_RESOURCE"] as const).map((k) => ({
      value: k,
      label: t(`admin.kinds.${k}`),
    })),
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["catalog"] });

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing && editing !== "new"
        ? adminApi.update(entity, editing.id, payload)
        : adminApi.create(entity, payload),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError: (e) => setServerError(errorMessageKey(toApiError(e).code)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.remove(entity, id),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
    onError: (e) => {
      setDeleting(null);
      setServerError(errorMessageKey(toApiError(e).code));
    },
  });

  const cell = (row: Row, column: string): string => {
    const v = row[column];
    if (column === "clinicId")
      return (options.clinics ?? []).find((o) => o.value === v)?.label ?? "";
    if (column === "kind") return t(`admin.kinds.${String(v)}`);
    return v === null || v === undefined ? "" : String(v);
  };

  const data = (rows.data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t(`admin.sections.${entity}`)}</h1>
        <Button
          onClick={() => {
            setServerError(null);
            setEditing("new");
          }}
        >
          {t("admin.new")}
        </Button>
      </div>
      {serverError && !editing ? <Alert variant="error">{t(serverError)}</Alert> : null}
      {editing ? (
        <EntityForm
          key={editing === "new" ? "new" : editing.id}
          config={config}
          initial={editing === "new" ? emptyValues(config) : toFormValues(config, editing)}
          options={options}
          serverError={serverError}
          pending={save.isPending}
          onSubmit={(payload) => {
            setServerError(null);
            save.mutate(payload);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {rows.isPending ? <p role="status">{t("common.loading")}</p> : null}
      {rows.error ? (
        <Alert variant="error">{t(errorMessageKey(toApiError(rows.error).code))}</Alert>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <caption className="sr-only">{t(`admin.sections.${entity}`)}</caption>
          <thead>
            <tr className="border-b border-border">
              {config.columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-semibold">
                  {t(`admin.fields.${c}`)}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-semibold">
                {t("admin.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b border-border" data-testid="admin-row">
                {config.columns.map((c) => (
                  <td key={c} className="px-3 py-2">
                    {cell(row, c)}
                  </td>
                ))}
                <td className="flex flex-wrap gap-2 px-3 py-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setServerError(null);
                      setEditing(row);
                    }}
                  >
                    {t("admin.edit")}
                    <span className="sr-only"> {String(row.name ?? row.namePt ?? row.slug)}</span>
                  </Button>
                  {deleting === row.id ? (
                    <>
                      <Button
                        variant="danger"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(row.id)}
                      >
                        {t("admin.confirmDelete")}
                      </Button>
                      <Button variant="outline" onClick={() => setDeleting(null)}>
                        {t("common.actions.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setServerError(null);
                        setDeleting(row.id);
                      }}
                    >
                      {t("admin.delete")}
                      <span className="sr-only"> {String(row.name ?? row.namePt ?? row.slug)}</span>
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
