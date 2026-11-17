"use client";

import { useLocale, useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { routing, type AppLocale } from "@/i18n/routing";
import { useChangeLocale } from "@/components/layout/use-change-locale";
import { Section } from "./section";

export function LanguageSection() {
  const t = useTranslations();
  const locale = useLocale();
  const changeLocale = useChangeLocale();
  return (
    <Section id="language" title={t("settings.language.title")}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-language">{t("settings.language.label")}</Label>
        <Select
          id="settings-language"
          value={locale}
          onChange={(e) => changeLocale(e.target.value as AppLocale)}
        >
          {routing.locales.map((l) => (
            <option key={l} value={l}>
              {t(`common.languages.${l}`)}
            </option>
          ))}
        </Select>
      </div>
    </Section>
  );
}
