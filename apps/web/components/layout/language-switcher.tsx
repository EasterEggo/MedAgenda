"use client";

import { useLocale, useTranslations } from "next-intl";
import { routing, type AppLocale } from "@/i18n/routing";
import { useChangeLocale } from "./use-change-locale";

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const onChange = useChangeLocale();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-switcher" className="text-sm font-medium">
        {t("language")}
      </label>
      <select
        id="language-switcher"
        value={locale}
        onChange={(e) => onChange(e.target.value as AppLocale)}
        className="min-h-11 rounded-md border border-border bg-card px-2 text-sm"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
