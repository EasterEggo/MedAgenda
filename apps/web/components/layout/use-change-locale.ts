"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { meApi } from "@/lib/api/endpoints";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Switches the UI language: cookie, account preference (when signed in) and the URL. */
export function useChangeLocale() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  return function changeLocale(next: AppLocale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    // Persist to the account when logged in; failures (not logged in) are ignored.
    if (queryClient.getQueryData(["me"])) {
      void meApi
        .updateLocale(next)
        .then(() => queryClient.invalidateQueries({ queryKey: ["me"] }))
        .catch(() => undefined);
    }
    router.replace(pathname, { locale: next });
  };
}
