import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt-BR", "en"],
  defaultLocale: "pt-BR",
  localePrefix: "always",
  // Detection order: NEXT_LOCALE cookie, then Accept-Language, then the default locale.
  localeDetection: true,
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" },
});

export type AppLocale = (typeof routing.locales)[number];
