"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { meApi } from "@/lib/api/endpoints";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  function onChange(next: AppLocale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    // Persist to the account when logged in; failures (not logged in) are ignored.
    if (queryClient.getQueryData(["me"])) {
      void meApi
        .updateLocale(next)
        .then(() => queryClient.invalidateQueries({ queryKey: ["me"] }))
        .catch(() => undefined);
    }
    router.replace(pathname, { locale: next });
  }

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
